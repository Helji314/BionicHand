// messages.cpp – binary format, see messages.h
#include "messages.h"

int msg::bitOf(const char* key) {
  for (uint8_t i = 0; i < FINGER_COUNT; i++) {
    if (strcmp(key, KEYS[i]) == 0) return i;
  }
  return -1;
}

size_t buildSyn(uint8_t* buffer, size_t size) {
  if (size < 1) return 0;
  buffer[0] = msg::SYN;
  return 1;
}

size_t buildData(uint8_t* buffer, size_t size, const float* fingers) {
  if (size < 2 + msg::FINGER_COUNT) return 0;
  buffer[0] = msg::DATA;
  buffer[1] = 0;
  size_t n = 2;
  for (uint8_t b = 0; b < msg::FINGER_COUNT; b++) {
    if (isnan(fingers[b])) continue;
    buffer[1] |= 1 << b;
    buffer[n++] = (uint8_t)lroundf(constrain(fingers[b], 0.0f, 1.0f) * 255.0f);
  }
  return n;
}

size_t buildWakeup(uint8_t* buffer, size_t size, uint32_t ms) {
  if (size < 3) return 0;
  if (ms > 0xFFFF) ms = 0xFFFF;
  buffer[0] = msg::WAKEUP;
  buffer[1] = ms & 0xFF;
  buffer[2] = ms >> 8;
  return 3;
}

Message recognise(const uint8_t* data, size_t length) {
  if (length != 2 || data[0] != msg::ACK) return Message::UNKNOWN;
  switch (data[1]) {
    case msg::SYN:    return Message::ACK_SYN;
    case msg::DATA:   return Message::ACK_DATA;
    case msg::WAKEUP: return Message::ACK_WAKEUP;
  }
  return Message::UNKNOWN;
}

void printMessage(const uint8_t* data, size_t length) {
  for (size_t i = 0; i < length; i++) Serial.printf("%02X ", data[i]);
  Serial.print(" ");
  if (length == 0) { Serial.println("(empty)"); return; }
  switch (data[0]) {
    case msg::SYN: Serial.println("SYN"); return;
    case msg::WAKEUP:
      if (length >= 3) { Serial.printf("WAKEUP %u ms\n", data[1] | (data[2] << 8)); return; }
      break;
    case msg::ACK:
      if (length >= 2) { Serial.printf("ACK %c\n", (char)data[1]); return; }
      break;
    case msg::DATA: {
      if (length < 2) break;
      Serial.print("DATA");
      size_t n = 2;
      for (uint8_t b = 0; b < msg::FINGER_COUNT && n < length; b++) {
        if (data[1] & (1 << b)) Serial.printf(" %s:%.3f", msg::KEYS[b], data[n++] / 255.0f);
      }
      Serial.println();
      return;
    }
  }
  Serial.println("?");
}
