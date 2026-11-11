#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_now.h>

const int numberOfFingers = 5;
const int numberOfSamples = 15;
const unsigned long sendIntervalMs = 100;

// Replace these placeholder pins and calibration limits with the final hardware values.
const int flexPins[numberOfFingers] = {4, 5, 6, 7, 8};
const int minInput[numberOfFingers] = {700, 700, 700, 700, 700};
const int maxInput[numberOfFingers] = {3333, 3333, 3333, 3333, 3333};

const uint8_t receiverMac[] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};

long sensorRead[numberOfFingers];
float previousFingerValue[numberOfFingers] = {};
float roundedFingerValue[numberOfFingers];
bool streamingEnabled = false;
unsigned long lastSendTime = 0;

float mapToZeroOne(float value, float minimum, float maximum) {
  float result = (value - minimum) / (maximum - minimum);
  return constrain(result, 0.0f, 1.0f);
}

void readFingers() {
  for (int finger = 0; finger < numberOfFingers; finger++) {
    sensorRead[finger] = 0;
  }

  for (int sample = 0; sample < numberOfSamples; sample++) {
    for (int finger = 0; finger < numberOfFingers; finger++) {
      sensorRead[finger] += analogRead(flexPins[finger]);
    }
    delay(50);
  }

  for (int finger = 0; finger < numberOfFingers; finger++) {
    const float sensorAverage = sensorRead[finger] / (float)numberOfSamples;
    const float fingerValue = mapToZeroOne(
      sensorAverage,
      minInput[finger],
      maxInput[finger]
    );
    roundedFingerValue[finger] = (fingerValue + previousFingerValue[finger]) / 2.0f;
    previousFingerValue[finger] = fingerValue;
  }
}

bool sendFingerValues() {
  readFingers();

  char payload[128];
  const int payloadLength = snprintf(
    payload,
    sizeof(payload),
    "F0:%.3f,S0:0,F1:%.3f,F2:%.3f,F3:%.3f,F4:%.3f,F5:%.3f\n",
    roundedFingerValue[0],
    roundedFingerValue[0],
    roundedFingerValue[1],
    roundedFingerValue[2],
    roundedFingerValue[3],
    roundedFingerValue[4]
  );

  if (payloadLength < 0 || payloadLength >= (int)sizeof(payload)) {
    return false;
  }

  return esp_now_send(receiverMac, (uint8_t*)payload, payloadLength) == ESP_OK;
}

void setup() {
  Serial.begin(115200);
  for (int finger = 0; finger < numberOfFingers; finger++) {
    pinMode(flexPins[finger], INPUT);
  }

  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    return;
  }

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, receiverMac, sizeof(receiverMac));
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);
}

void loop() {
  while (Serial.available() > 0) {
    if (Serial.read() == 's') {
      streamingEnabled = true;
    }
  }

  if (streamingEnabled && millis() - lastSendTime >= sendIntervalMs) {
    lastSendTime = millis();
    sendFingerValues();
  }
}
