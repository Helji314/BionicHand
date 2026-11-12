// protocol.cpp – see protocol.h
#include "protocol.h"

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include "config.h"
#include "messages.h"

namespace {

constexpr size_t MAX_LENGTH = 250;  // max. payload of one ESP-NOW message

// Target: ROBOT_MAC from config.h at first, changeable with setTarget()
// (all 0xFF = broadcast to everyone).
uint8_t targetMac[6];
volatile bool targetIsBroadcast = true;
bool targetSet = false;  // already set via setTarget()?
bool started = false;

struct Received {
  uint8_t mac[6];
  uint32_t us;   // micros() on arrival
  int8_t rssi;   // signal strength in dBm
  uint8_t length;
  uint8_t data[MAX_LENGTH];
};

// The receive callback runs in the Wi-Fi task, not in loop(). So received
// messages go into a queue and are read in update().
QueueHandle_t queue = nullptr;

volatile bool logSend = false;

void onReceive(const esp_now_recv_info_t* info, const uint8_t* data, int length) {
  if (queue == nullptr || length <= 0 || length > (int)MAX_LENGTH) return;
  // With a fixed robot MAC, only accept its replies (other groups in the room).
  if (!targetIsBroadcast && memcmp(info->src_addr, targetMac, 6) != 0) return;
  Received r;
  memcpy(r.mac, info->src_addr, 6);
  r.us = micros();
  r.rssi = info->rx_ctrl ? info->rx_ctrl->rssi : 0;
  r.length = (uint8_t)length;
  memcpy(r.data, data, length);
  xQueueSend(queue, &r, 0);  // queue full -> drop the message
}

// With a fixed robot MAC, reports whether the message reached the robot hand
// (ESP-NOW's own radio acknowledgement, separate from the protocol's ACK).
// Broadcasts don't get this acknowledgement.
void onSent(const wifi_tx_info_t* info, esp_now_send_status_t status) {
  (void)info;
  if (logSend && status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("[radio]    not delivered (robot hand off or out of range?)");
  }
}

bool addPeer(const uint8_t* mac) {
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, mac, 6);
  peer.channel = 0;  // 0 = current channel
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}

}  // namespace

bool RadioLink::isBroadcast(const uint8_t* mac) {
  for (uint8_t i = 0; i < 6; i++) {
    if (mac[i] != 0xFF) return false;
  }
  return true;
}

const uint8_t* RadioLink::target() const { return targetMac; }

bool RadioLink::setTarget(const uint8_t* mac) {
  if (started && memcmp(mac, targetMac, 6) == 0) return true;
  if (started) esp_now_del_peer(targetMac);
  memcpy(targetMac, mac, 6);
  targetIsBroadcast = isBroadcast(mac);
  targetSet = true;
  if (!started) return true;  // begin() adds the peer
  hadSuccess_ = false;        // new partner: start the round from scratch
  pause();
  return addPeer(targetMac);
}

bool RadioLink::begin() {
  queue = xQueueCreate(8, sizeof(Received));
  if (queue == nullptr) return false;

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  // Fix the channel. Going through promiscuous mode makes sure the channel is
  // applied even without a Wi-Fi connection.
  esp_wifi_set_promiscuous(true);
  esp_err_t channelOk = esp_wifi_set_channel(RADIO_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);
  if (channelOk != ESP_OK) return false;

  if (esp_now_init() != ESP_OK) return false;
  if (esp_now_register_recv_cb(onReceive) != ESP_OK) return false;
  if (esp_now_register_send_cb(onSent) != ESP_OK) return false;

  if (!targetSet) setTarget(ROBOT_MAC);
  if (!addPeer(targetMac)) return false;
  started = true;

  pause();
  return true;
}

void RadioLink::update(const float* fingers) {
  uint32_t now = millis();
  logSend = log;

  if (step_ == Step::PAUSE) {
    xQueueReset(queue);  // throw away late ACKs from the last round
    if (now - stepStart_ >= WAKEUP_MS) start(Step::SYN, fingers);
    return;
  }

  // Look at the robot hand's replies. Only the ACK we are waiting for moves us
  // on; everything else is ignored.
  Received r;
  while (xQueueReceive(queue, &r, 0) == pdTRUE) {
    Message m = recognise(r.data, r.length);
    if (log) {
      Serial.printf("[radio] <- %02X:%02X:%02X:%02X:%02X:%02X ", r.mac[0], r.mac[1],
                    r.mac[2], r.mac[3], r.mac[4], r.mac[5]);
      printMessage(r.data, r.length);
    }

    bool expected = (step_ == Step::SYN && m == Message::ACK_SYN) ||
                    (step_ == Step::DATA && m == Message::ACK_DATA) ||
                    (step_ == Step::WAKEUP && m == Message::ACK_WAKEUP);
    if (expected) {
      uint32_t rtt = r.us - lastSendUs_;
      stats_.acks++;
      stats_.rttSumUs += rtt;
      if (rtt > stats_.rttMaxUs) stats_.rttMaxUs = rtt;
      if (stats_.rssiCount == 0 || r.rssi < stats_.rssiMin) stats_.rssiMin = r.rssi;
      stats_.rssiSum += r.rssi;
      stats_.rssiCount++;
    }

    if (step_ == Step::SYN && m == Message::ACK_SYN) {
      start(Step::DATA, fingers);
    } else if (step_ == Step::DATA && m == Message::ACK_DATA) {
      start(Step::WAKEUP, fingers);
    } else if (step_ == Step::WAKEUP && m == Message::ACK_WAKEUP) {
      succeeded_++;
      stats_.roundsOk++;
      stats_.roundSumUs += r.us - roundStartUs_;
      hadSuccess_ = true;
      lastSuccess_ = millis();
      pause();
      return;
    }
  }

  if (millis() - stepStart_ >= TRY_MS) {
    if (log) Serial.println("[radio] no ACK -> giving up, trying again");
    failed_++;
    stats_.roundsFailed++;
    pause();
    return;
  }

  if (millis() - lastSend_ >= RESEND_MS) send(fingers);
}

void RadioLink::start(Step s, const float* fingers) {
  step_ = s;
  stepStart_ = millis();
  if (s == Step::SYN) roundStartUs_ = micros();
  sendCount_ = 0;
  send(fingers);
}

void RadioLink::send(const float* fingers) {
  uint8_t buffer[MAX_LENGTH];
  size_t length = 0;
  switch (step_) {
    case Step::SYN:    length = buildSyn(buffer, sizeof(buffer)); break;
    case Step::DATA:   length = buildData(buffer, sizeof(buffer), fingers); break;
    case Step::WAKEUP: length = buildWakeup(buffer, sizeof(buffer), WAKEUP_MS); break;
    case Step::PAUSE:  return;
  }
  lastSend_ = millis();
  if (length == 0) return;
  lastSendUs_ = micros();
  esp_now_send(targetMac, buffer, length);
  stats_.sent++;
  if (sendCount_++ > 0) stats_.resent++;
  if (log) {
    Serial.print("[radio] -> ");
    printMessage(buffer, length);
  }
}

void RadioLink::pause() {
  step_ = Step::PAUSE;
  stepStart_ = millis();
}

bool RadioLink::connected() const {
  return hadSuccess_ && millis() - lastSuccess_ < TRY_MS + WAKEUP_MS;
}

LinkStats RadioLink::takeStats() {
  LinkStats s = stats_;
  stats_ = LinkStats();
  return s;
}

const char* RadioLink::stateText() const {
  switch (step_) {
    case Step::SYN:    return "waiting for ACK SYN";
    case Step::DATA:   return "waiting for ACK DATA";
    case Step::WAKEUP: return "waiting for ACK WAKEUP";
    case Step::PAUSE:  return "pause";
  }
  return "?";
}
