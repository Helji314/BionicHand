// protocol.h – radio link to the robot hand (ESP-NOW)
//
// One round (from repo "protocol"):
//
//   Glove      -> robot hand   SYN           "Hello, are you there?"
//   Robot hand -> glove        ACK SYN       "Yes, I am."
//   Glove      -> robot hand   DATA          finger values 0..1
//   Robot hand -> glove        ACK DATA      "Thanks for the data."
//   Glove      -> robot hand   WAKEUP 100    "See you in 100 ms?"
//   Robot hand -> glove        ACK WAKEUP    "Yes, see you."
//   ... wait WAKEUP_MS, then start again with SYN.
//
// If a message gets no ACK, it is sent again every RESEND_MS. After TRY_MS
// without an ACK the round is given up: wait WAKEUP_MS and start again with SYN.
//
// Nothing here uses delay(): call update() from loop() as often as possible.

#pragma once

#include <Arduino.h>

// Link statistics for the link check in the test tool (command L), counted
// since the last takeStats().
struct LinkStats {
  uint32_t roundsOk = 0;      // complete rounds SYN..ACK WAKEUP
  uint32_t roundsFailed = 0;  // rounds given up after TRY_MS
  uint32_t sent = 0;          // messages sent, resends included
  uint32_t resent = 0;        // of which resends (the ACK did not come in time)
  uint32_t acks = 0;          // ACKs that moved the round on
  uint32_t rttSumUs = 0;      // time from the last send to its ACK
  uint32_t rttMaxUs = 0;
  uint32_t roundSumUs = 0;    // time from SYN to ACK WAKEUP
  int32_t rssiSum = 0;        // signal strength of the robot hand's ACKs (dBm)
  int8_t rssiMin = 0;
  uint32_t rssiCount = 0;
};

class RadioLink {
 public:
  bool begin();

  // fingers: one value 0..1 per protocol key (order of msg::KEYS: F0 S0 F1 F2
  // F3 F4), NAN = not sent
  void update(const float* fingers);

  // true if a complete round worked recently
  bool connected() const;

  uint32_t succeeded() const { return succeeded_; }
  uint32_t failed() const { return failed_; }
  const char* stateText() const;

  // Statistics since the last call, then start counting again
  LinkStats takeStats();

  // Which robot hand to talk to? All 0xFF = broadcast to everyone.
  // Can be changed at any time (command "m" in the serial monitor).
  bool setTarget(const uint8_t* mac);
  const uint8_t* target() const;
  static bool isBroadcast(const uint8_t* mac);

  bool log = false;  // print every message sent and received

 private:
  enum class Step : uint8_t { SYN, DATA, WAKEUP, PAUSE };

  void start(Step s, const float* fingers);
  void send(const float* fingers);
  void pause();

  Step step_ = Step::PAUSE;
  uint32_t stepStart_ = 0;
  uint32_t lastSend_ = 0;
  uint32_t lastSuccess_ = 0;
  bool hadSuccess_ = false;
  uint32_t succeeded_ = 0;
  uint32_t failed_ = 0;
  uint32_t lastSendUs_ = 0;
  uint8_t sendCount_ = 0;     // how often the current message was sent
  uint32_t roundStartUs_ = 0;
  LinkStats stats_;
};
