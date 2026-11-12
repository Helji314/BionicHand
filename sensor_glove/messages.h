// messages.h – building and recognising the radio messages (binary)
//
// Format from the repo "protocol". Every message starts with one byte for its
// type; the finger values are one byte each (uint8: 0 = straight, 255 = bent).
//
//   Glove -> robot hand                         Robot hand -> glove
//   SYN     'S'                       (1 B)     ACK  'A' 'S'   (2 B)
//   DATA    'D' mask v0 v1 ...    (2 + n B)     ACK  'A' 'D'   (2 B)
//   WAKEUP  'W' ms_low ms_high        (3 B)     ACK  'A' 'W'   (2 B)
//
// mask: bit i set = finger i is in the message, in the order F0 S0 F1 F2 F3 F4
// (bit 0 = F0). The values follow in the same order, only for the set bits.
// Fingers that are not calibrated or broken are left out.
//
// The same format is in roboter_hand/nachrichten.* in the repo ansteuerung_hand.
// If it changes, change both sides (and the test tool in the repo tools).

#pragma once

#include <Arduino.h>

namespace msg {
constexpr uint8_t SYN = 'S';
constexpr uint8_t DATA = 'D';
constexpr uint8_t WAKEUP = 'W';
constexpr uint8_t ACK = 'A';
constexpr uint8_t FINGER_COUNT = 6;
// Protocol keys in bit order of the mask
constexpr const char* KEYS[FINGER_COUNT] = {"F0", "S0", "F1", "F2", "F3", "F4"};

// Bit of a protocol key ("F1" -> 2), -1 = unknown key
int bitOf(const char* key);
}  // namespace msg

enum class Message : uint8_t {
  UNKNOWN,
  ACK_SYN,
  ACK_DATA,
  ACK_WAKEUP,
};

// Build the message into the buffer and return its length (0 = error).
size_t buildSyn(uint8_t* buffer, size_t size);
// fingers: one value 0..1 per protocol key, in the order of msg::KEYS. NAN = leave out
size_t buildData(uint8_t* buffer, size_t size, const float* fingers);
size_t buildWakeup(uint8_t* buffer, size_t size, uint32_t ms);

// Recognise a reply from the robot hand.
Message recognise(const uint8_t* data, size_t length);

// Radio log: the bytes in hex, then what they mean, e.g.
//   44 05 1F 80  DATA F0:0.122 F1:0.502
// (the test tool in the repo tools counts the hex bytes)
void printMessage(const uint8_t* data, size_t length);
