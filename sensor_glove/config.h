// config.h – setup for the sensor glove
#pragma once

#include <Arduino.h>

// ---------------------------------------------------------------------------
// Sensors and board pins: which ADC pin belongs to which finger?
// On the ESP32-C6 only GPIO0..GPIO6 can measure analog voltages (GPIO7 can NOT).
// On the classic ESP32 only the ADC1 pins (GPIO32..39) work while the radio is on.
// The pin list, LED, BOOT button and battery pin are picked automatically from
// the board selected in the Arduino IDE (one block per board, see below).
// ---------------------------------------------------------------------------

// In which calibration pose is this sensor "fully bent" (= 1.0)?
// (Only used by the short calibration on the glove itself, command k / BOOT button.)
enum Pose : uint8_t {
  FIST,        // fingertips to the palm (not curled in), thumb tucked in
  OPPOSITION,  // thumb tip to the little finger
};

struct SensorConfig {
  uint8_t pin;
  const char* key;   // name in the radio protocol (F0, S0, F1 ...), see repo "protocol"
  Pose bentIn;       // pose in which the sensor should read 1.0
  const char* name;  // short, no spaces (shown in the Serial Plotter and the test tool)
};
// Classic ESP32 with ESP32-WROOM-32, e.g. AZ-Delivery "ESP32 DevKit C V4" /
// "ESP32 NodeMCU" (board "ESP32 Dev Module", USB through a CP2102). Any other
// classic ESP32 board lands here too.
// The ESP32 has two ADCs. ADC2 (GPIO0, 2, 4, 12..15, 25..27) is used by the
// Wi-Fi radio: while ESP-NOW is on, analogRead() on those pins fails. So only
// ADC1 pins: GPIO36 (VP), 39 (VN), 34, 35 (input only, no pull-ups) and 32, 33.
// Below about 0.1 V this ADC reads 0, so a straight finger simply reads 0 mV.
constexpr SensorConfig SENSORS[] = {
    // For now only the thumb (F0). Uncomment the others once they are connected.
    {36, "F0", FIST,       "ThumbFlex"},  // pin "VP"
    {39, "S0", OPPOSITION, "ThumbOpp"},   // pin "VN"
    {34, "F1", FIST,       "Index"},
    {35, "F2", FIST,       "Middle"},
    {32, "F3", FIST,       "Ring"},
    {33, "F4", FIST,       "Pinky"},
};
// The core's "ESP32 Dev Module" has no LED_BUILTIN. AZ-Delivery boards have a
// blue LED on GPIO2 (boards without a user LED just show no status).
#else
constexpr uint8_t PIN_LED     = 2;
#endif
constexpr uint8_t PIN_BUTTON  = 0;   // BOOT button (GPIO0): hold = calibrate
#endif
constexpr uint8_t SENSOR_COUNT = sizeof(SENSORS) / sizeof(SENSORS[0]);

// ---------------------------------------------------------------------------
// Radio protocol (see repo "protocol")
// ---------------------------------------------------------------------------
constexpr uint32_t WAKEUP_MS  = 100;   // pause between two rounds (protocol: ms)
constexpr uint32_t TRY_MS     = 1000;  // wait this long for an ACK, then give up
constexpr uint32_t RESEND_MS  = 50;    // ASSUMPTION: send the message again if no ACK yet
constexpr uint8_t  RADIO_CHANNEL = 1;  // ASSUMPTION: Wi-Fi channel, must match the robot hand

// Playback from the test tool (command p): if no new values come for this
// long, the sensors take over again.
constexpr uint32_t PLAYBACK_TIMEOUT_MS = 500;
// Link statistics (command L): one line per this many ms
constexpr uint32_t LINK_REPORT_MS = 1000;

// Which robot hand do we talk to?
// All 0xFF = broadcast to everyone (for testing, any robot hand may answer).
// With several groups in the room, put the MAC of your own robot hand here
// (it is printed when the robot hand starts, repo ansteuerung_hand, or use
// tools/get_mac). Then only ACKs from this MAC are accepted.
// It can also be set at runtime with the "m" command or in the test tool.
const uint8_t ROBOT_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// ---------------------------------------------------------------------------
// Board: PIN_LED, PIN_BUTTON and PIN_BATTERY are in the board blocks above.
// On-board LED: Beetle = GPIO15, DevKitC-1 = RGB LED on GPIO8 (lights white),
// classic ESP32 = GPIO2. digitalWrite() handles all of them.
// ---------------------------------------------------------------------------
// Serial transmit buffer on UART boards (classic ESP32, DevKitC-1 "UART"
// socket): 115200 baud move only ~11.5 kB/s, the buffer lets loop() go on
// while a line is being sent. The fast raw stream (command o) is about 7.3 kB/s
// with six sensors.
constexpr size_t SERIAL_TX_BUFFER = 1024;

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------
constexpr uint32_t MEASURE_INTERVAL_MS = 20;     // 50 measurements per second
constexpr uint8_t  SAMPLES_PER_VALUE   = 8;      // average over n ADC readings
constexpr float    SMOOTHING           = 0.3f;   // 0..1, smaller = calmer but slower
constexpr uint32_t MIN_TRAVEL_MV       = 200;    // straight and bent must differ at least this much

// Creep compensation ("drop-off"): our flex sensors sag while held bent.
// Measured (index finger, 44 kOhm): within about 1.5 s down to 40..55 % of the
// peak, after that the value stays roughly constant. When straightened they
// drop immediately. The compensation adds the sag back (details: compensateCreep()).
//   CREEP_REMAINDER: share that is left after sagging (0.4 = 40 %).
//                    Smaller = stronger compensation. If the value slowly RISES
//                    while held, CREEP_REMAINDER is too small -> make it bigger.
//   CREEP_TAU_MS:    how fast the sensor sags (time constant).
constexpr bool     CREEP_COMPENSATION = true;   // setting at start, toggle with 'd'
constexpr float    CREEP_REMAINDER    = 0.40f;
constexpr uint32_t CREEP_TAU_MS       = 1500;

// Short calibration on the glove (k / BOOT button): duration of each pose
constexpr uint32_t CAL_PREPARE_MS = 2000;
constexpr uint32_t CAL_MEASURE_MS = 2000;
constexpr uint32_t BUTTON_HOLD_MS = 1000;

// Fast raw stream (command o): one line with every sensor's single ADC reading
// per this many microseconds (10000 = 100 Hz). Six sensors are ~73 bytes per
// line, at 100 Hz ~7.3 kB/s of the ~11.5 kB/s that 115200 baud can carry.
constexpr uint32_t RAW_STREAM_INTERVAL_US = 10000;

// Wiring check (command D): CHECK_SAMPLES single readings per sensor, one per
// millisecond (~100 ms = 5 periods of 50 Hz mains hum, which a floating pin
// picks up). "noise" = highest minus lowest reading. Verdict, first match wins:
//   open   noise >= CHECK_OPEN_MV   (pin floating: sensor or fixed resistor missing)
//   noisy  noise >= CHECK_NOISY_MV  (connected, but loose contact or long wires)
//   short  every reading within CHECK_RAIL_COUNTS of the end of the ADC scale
//          (stuck at 0 V or 3.3 V without noise)
//   ok     anything else
// With our divider a STRAIGHT finger reads almost 0 V (10 MOhm against 44 kOhm)
// and shows as "short": do the check with the fingers half bent.
constexpr uint8_t  CHECK_SAMPLES     = 100;
constexpr uint32_t CHECK_OPEN_MV     = 400;
constexpr uint32_t CHECK_NOISY_MV    = 100;
constexpr uint16_t CHECK_RAIL_COUNTS = 16;   // of 0..4095 (12 bit)
