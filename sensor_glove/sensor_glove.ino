// Sensor glove – group 1, MINT hand prosthesis 2026
//
// Reads the flex sensors, turns them into 0..1 using the calibration and sends
// them to the robot hand over ESP-NOW (sequence: see protocol.h).
//
// Usage:
//   Calibrate: open the test tool (repo tools, test_tool/index.html) in Chrome and click "Calibrate"
//   (guided, one step per finger). Short version without a laptop: hold the BOOT
//   button for more than 1 s.
//   Serial monitor (115200 baud): from the start, 20 lines per second like
//     "Index:0.512 Index_mV:1234 Index_comp:2100"
//     (0..1 only after calibration; raw mV and compensated mV always).
//   Commands:
//     k  short calibration on the glove (open hand, fingertips to the palm, thumb opposition)
//     a  values 0..1 on/off (for the Serial Plotter)
//     A  values on (for the test tool, never switches off)
//     r  raw values (mV) on/off
//     R  raw values on (for the test tool, never switches off)
//     l  radio log on/off (show every message)
//     f  radio on/off (diagnosis: does sending disturb the measurement?)
//     d  creep compensation on/off (the sensor sags while held bent)
//     c  set the calibration of one sensor, e.g. "cIndex=12,2100" + Enter
//        (straight 12 mV, fully bent 2100 mV; sensor name or key like F1).
//        This is how the test tool saves its calibration.
//     m  set the robot hand's MAC, e.g. "m58:E6:C5:F8:99:1C" + Enter
//        (saved). Just "m" + Enter = broadcast to everyone again.
//     p  playback: send these values instead of the sensors, e.g.
//        "pF0:0.5 F1:1" + Enter (protocol keys, 0..1). Holds for
//        PLAYBACK_TIMEOUT_MS, then the sensors take over again. The test tool
//        uses it to replay a recording over the radio.
//     L  link statistics on/off: one "[link] ..." line per second (link check)
//     i  info: firmware version, calibration, radio state, MAC
//     D  wiring check, printed once: "Check: sensor F0 GPIO4 1234 mV noise 12 mV ok"
//        per sensor (ok/open/short/noisy), battery (if measured), button, "Check: done"
//     o  fast raw stream on/off: "F0_raw:1234 F1_raw:987" at 100 Hz instead of
//        the normal data line (single ADC readings, unsmoothed)
//     O  fast raw stream on (for the test tool, never switches off)

#include <Preferences.h>
#include <WiFi.h>

#include "config.h"
#include "messages.h"
#include "protocol.h"
#include "version.h"

RadioLink radio;
Preferences storage;

struct Calibration {
  float straightMv;  // voltage with the finger straight
  float bentMv;      // voltage with the finger fully bent
};

Calibration cal[SENSOR_COUNT];
bool calibrated = false;
float smoothMv[SENSOR_COUNT];  // smoothed, as the sensor measures it
float creep[SENSOR_COUNT];     // estimated sag in mV (see compensateCreep)
float compMv[SENSOR_COUNT];    // smoothMv + sag = what 0..1 is calculated from
float values[SENSOR_COUNT];    // 0..1, NAN = invalid
float none[msg::FINGER_COUNT];  // all NAN, sent during the calibration
float fingers[msg::FINGER_COUNT];  // what goes over the radio, order of msg::KEYS
int8_t sensorBit[SENSOR_COUNT];    // which finger each sensor is (bit in msg::KEYS)

// Playback (command p): values from the test tool instead of the sensors
float playback[msg::FINGER_COUNT];
uint32_t playbackTime = 0;
bool playbackOn = false;

bool printValues = true;  // on from the start, so the serial monitor shows something right away
bool printRaw = true;
bool radioOn = true;
bool creepOn = CREEP_COMPENSATION;
bool linkReport = false;
bool rawStream = false;  // command o/O, replaces printLine()

// Only switch the LED when something changes. The DevKitC-1's RGB LED is driven
// via RMT; writing it on every loop() would be needlessly slow.
void setLed(uint8_t state) {
  static int8_t last = -1;
  if (state == last) return;
  last = state;
  digitalWrite(PIN_LED, state);
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

float readMv(uint8_t pin) {
  uint32_t sum = 0;
  for (uint8_t i = 0; i < SAMPLES_PER_VALUE; i++) sum += analogReadMilliVolts(pin);
  return (float)sum / SAMPLES_PER_VALUE;
}

// Creep compensation.
//
// Model (from measurements): when the sensor is bent and held, it first reads the
// full bend B, then sags down to CREEP_REMAINDER * B:
//     measured(t) = B * (REMAINDER + (1 - REMAINDER) * e^(-t / TAU))
// We keep estimating the sag  B - measured(t)  with a low-pass filter and add it
// back. In the settled state the sag is
//     (1 - REMAINDER) / REMAINDER * measured,
// which is exactly where the low-pass ends up. If the model fits, the sum stays at
// B while the finger is held.
//
// When straightened, the sensor does NOT sag but drops at once. So the sag is
// limited to (1 - REMAINDER) / REMAINDER * measured: when the reading goes back to
// "straight", the compensation goes to 0 with it – no lag when letting go.
//
// "measured" counts from the calibrated straight value, in the bending direction
// (some sensors give less voltage when bent instead of more).
void compensateCreep(uint8_t i) {
  float straight = calibrated ? cal[i].straightMv : 0.0f;
  float direction = (calibrated && cal[i].bentMv < cal[i].straightMv) ? -1.0f : 1.0f;
  float bend = max(0.0f, direction * (smoothMv[i] - straight));

  constexpr float FACTOR = (1.0f - CREEP_REMAINDER) / CREEP_REMAINDER;
  constexpr float DT = (float)MEASURE_INTERVAL_MS / CREEP_TAU_MS;
  creep[i] += DT * ((1.0f - CREEP_REMAINDER) * bend - CREEP_REMAINDER * creep[i]);
  creep[i] = constrain(creep[i], 0.0f, FACTOR * bend);

  compMv[i] = smoothMv[i] + (creepOn ? direction * creep[i] : 0.0f);
}

void measureAll() {
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    float mv = readMv(SENSORS[i].pin);
    smoothMv[i] += SMOOTHING * (mv - smoothMv[i]);  // exponential moving average
    compensateCreep(i);
  }
}

// A sensor counts as usefully calibrated if straight and bent are far enough apart.
bool sensorOk(uint8_t i) {
  return calibrated && fabsf(cal[i].bentMv - cal[i].straightMv) >= MIN_TRAVEL_MV;
}

// Voltage -> 0..1. Works whether the voltage rises or falls when bending.
float normalise(uint8_t i, float mv) {
  float v = (mv - cal[i].straightMv) / (cal[i].bentMv - cal[i].straightMv);
  return constrain(v, 0.0f, 1.0f);
}

void computeValues() {
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    values[i] = sensorOk(i) ? normalise(i, compMv[i]) : NAN;
  }
}

// What the radio sends: the playback values while they are fresh, otherwise
// the sensors.
void fillFingers() {
  if (playbackOn && millis() - playbackTime > PLAYBACK_TIMEOUT_MS) {
    playbackOn = false;
    Serial.println("Playback: off, sensors again");
  }
  for (uint8_t b = 0; b < msg::FINGER_COUNT; b++) fingers[b] = playbackOn ? playback[b] : NAN;
  if (playbackOn) return;
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    if (sensorBit[i] >= 0) fingers[sensorBit[i]] = values[i];
  }
}

// Command "p": "F0:0.5 F1:1" -> send these values for a while (see fillFingers).
void setPlaybackFromSerial() {
  String text = Serial.readStringUntil('\n');
  float v[msg::FINGER_COUNT];
  for (uint8_t b = 0; b < msg::FINGER_COUNT; b++) v[b] = NAN;
  bool any = false;
  int start = 0;
  while (start < (int)text.length()) {
    int end = text.indexOf(' ', start);
    if (end < 0) end = text.length();
    String part = text.substring(start, end);
    start = end + 1;
    int colon = part.indexOf(':');
    if (colon <= 0) continue;
    int b = msg::bitOf(part.substring(0, colon).c_str());
    if (b < 0) continue;
    v[b] = constrain(part.substring(colon + 1).toFloat(), 0.0f, 1.0f);
    any = true;
  }
  if (!any) {
    Serial.println("ERROR: p needs values, example: pF0:0.5 F1:1");
    return;
  }
  if (!playbackOn) Serial.println("Playback: on, sending the test tool's values");
  memcpy(playback, v, sizeof(playback));
  playbackTime = millis();
  playbackOn = true;
}

// ---------------------------------------------------------------------------
// Short calibration on the glove (command k / BOOT button)
// ---------------------------------------------------------------------------

// The radio keeps running during calibration but sends no finger values –
// the robot hand should stay still instead of copying nonsense.
void waitBlinking(uint32_t durationMs, uint32_t blinkMs) {
  uint32_t start = millis();
  while (millis() - start < durationMs) {
    radio.update(none);
    setLed(((millis() - start) / blinkMs) % 2 == 0 ? HIGH : LOW);
    delay(1);
  }
}

// Measures one pose for CAL_MEASURE_MS.
//
// Our flex sensors creep: after letting go the value keeps falling for seconds,
// and while held it slowly sags. So:
//   reference == nullptr ("straight"): average over the last quarter of the
//       measuring time only – by then the sensor has settled the most.
//   reference != nullptr ("palm"/"opposition"): the value furthest away from
//       "straight" (moving average over ~50 ms), i.e. the strongest bend instead
//       of an average spoiled by the sag.
void measurePose(float* result, const float* reference) {
  constexpr uint8_t WINDOW = 8;
  float window[SENSOR_COUNT][WINDOW] = {};
  double sum[SENSOR_COUNT] = {0};
  uint32_t nSum = 0, nWindow = 0;
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) result[i] = reference ? reference[i] : 0;

  uint32_t start = millis();
  setLed(HIGH);
  while (millis() - start < CAL_MEASURE_MS) {
    bool lastQuarter = millis() - start >= CAL_MEASURE_MS * 3 / 4;
    for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
      float mv = readMv(SENSORS[i].pin);
      window[i][nWindow % WINDOW] = mv;
      if (lastQuarter) sum[i] += mv;
      if (reference && nWindow + 1 >= WINDOW) {
        float avg = 0;
        for (uint8_t k = 0; k < WINDOW; k++) avg += window[i][k];
        avg /= WINDOW;
        if (fabsf(avg - reference[i]) > fabsf(result[i] - reference[i])) result[i] = avg;
      }
    }
    nWindow++;
    if (lastQuarter) nSum++;
    radio.update(none);
    delay(5);
  }
  if (!reference) {
    for (uint8_t i = 0; i < SENSOR_COUNT; i++) result[i] = nSum ? sum[i] / nSum : 0;
  }
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    Serial.printf("     %-10s %6.0f mV\n", SENSORS[i].name, result[i]);
  }
}

bool needsPose(Pose p) {
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    if (SENSORS[i].bentIn == p) return true;
  }
  return false;
}

void calibrate() {
  float straight[SENSOR_COUNT] = {}, palm[SENSOR_COUNT] = {}, opposition[SENSOR_COUNT] = {};

  Serial.println("\n=== Calibration ===");
  Serial.println("1) OPEN your hand fully, fingers and thumb straight ...");
  waitBlinking(CAL_PREPARE_MS, 500);  // slow blinking
  Serial.println("   measuring ...");
  measurePose(straight, nullptr);

  // Fingertips touching the palm is 100 %, the same as in the test tool's wizard.
  // A finger curled in further (fist) reads beyond that and is held at 1.0.
  Serial.println("2) FINGERTIPS TO THE PALM, fingers not curled in, thumb tucked in ...");
  waitBlinking(CAL_PREPARE_MS, 100);  // fast blinking
  Serial.println("   measuring ...");
  measurePose(palm, straight);

  if (needsPose(OPPOSITION)) {
    Serial.println("3) Fingers straight, THUMB TIP TO LITTLE FINGER ...");
    waitBlinking(CAL_PREPARE_MS, 250);  // medium blinking
    Serial.println("   measuring ...");
    measurePose(opposition, straight);
  }

  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    float bent = SENSORS[i].bentIn == OPPOSITION ? opposition[i] : palm[i];
    cal[i] = {straight[i], bent};
    smoothMv[i] = straight[i];
    creep[i] = 0;
  }
  saveCalibration();

  setLed(LOW);
  showCalibration();
}

void saveCalibration() {
  storage.begin("calib", false);
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    char key[8];
    snprintf(key, sizeof(key), "s%u", i);
    storage.putFloat(key, cal[i].straightMv);
    snprintf(key, sizeof(key), "b%u", i);
    storage.putFloat(key, cal[i].bentMv);
  }
  storage.putUChar("count", SENSOR_COUNT);
  storage.end();
  calibrated = true;
}

// Command "c": set one sensor's calibration from outside (test tool).
// Line "name=straight,bent", e.g. "Index=12,2100" or "F1=12,2100".
void setCalibrationFromSerial() {
  String text = Serial.readStringUntil('\n');  // waits up to 1 s for the line end
  text.trim();
  int equals = text.indexOf('='), comma = text.indexOf(',');
  if (equals < 1 || comma < equals) {
    Serial.printf("ERROR: can't read \"%s\". Example: cIndex=12,2100\n", text.c_str());
    return;
  }
  String name = text.substring(0, equals);
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    if (name != SENSORS[i].name && name != SENSORS[i].key) continue;
    // Never calibrated before: the other sensors stay invalid (straight == bent).
    if (!calibrated) {
      for (uint8_t k = 0; k < SENSOR_COUNT; k++) cal[k] = {0, 0};
    }
    cal[i] = {text.substring(equals + 1, comma).toFloat(), text.substring(comma + 1).toFloat()};
    creep[i] = 0;
    saveCalibration();
    Serial.printf("CAL %s straight %.0f bent %.0f %s\n", SENSORS[i].name, cal[i].straightMv,
                  cal[i].bentMv, sensorOk(i) ? "ok" : "TOO LITTLE TRAVEL");
    return;
  }
  Serial.printf("ERROR: there is no sensor \"%s\"\n", name.c_str());
}

void loadCalibration() {
  storage.begin("calib", true);
  // Only use it if it was saved with the same number of sensors.
  if (storage.getUChar("count", 0) == SENSOR_COUNT) {
    for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
      char key[8];
      snprintf(key, sizeof(key), "s%u", i);
      cal[i].straightMv = storage.getFloat(key, 0);
      snprintf(key, sizeof(key), "b%u", i);
      cal[i].bentMv = storage.getFloat(key, 0);
    }
    calibrated = true;
  }
  storage.end();
}

void showCalibration() {
  if (!calibrated) {
    Serial.println("Not calibrated! Use \"Calibrate\" in the test tool, hold the BOOT button or send 'k'.");
    return;
  }
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    Serial.printf("  %-10s GPIO%u  straight %6.0f mV  bent %6.0f mV  %s\n", SENSORS[i].name,
                  SENSORS[i].pin, cal[i].straightMv, cal[i].bentMv,
                  sensorOk(i) ? "ok" : "TOO LITTLE TRAVEL -> check sensor/wiring");
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

void checkButton() {
  static uint32_t pressedSince = 0;
  bool pressed = digitalRead(PIN_BUTTON) == LOW;
  if (pressed && pressedSince == 0) pressedSince = millis();
  if (!pressed) pressedSince = 0;
  if (pressedSince != 0 && millis() - pressedSince > BUTTON_HOLD_MS) {
    while (digitalRead(PIN_BUTTON) == LOW) delay(10);  // wait for release
    pressedSince = 0;
    calibrate();
  }
}

// Warns if a sensor is on a pin that can't measure analog.
void checkPins() {
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    if (digitalPinToAnalogChannel(SENSORS[i].pin) < 0 || !radioSafeAnalogPin(SENSORS[i].pin)) {
      Serial.printf("ERROR: %s on GPIO%u – this pin can't measure analog here! "
                    "On this board use " ANALOG_PINS_TEXT " only.\n",
                    SENSORS[i].name, SENSORS[i].pin);
    }
  }
}

// ---------------------------------------------------------------------------
// Radio partner (robot hand MAC), saved under "radio"/"target"
// ---------------------------------------------------------------------------
void showTarget() {
  const uint8_t* t = radio.target();
  if (RadioLink::isBroadcast(t)) {
    Serial.println("Target Broadcast (every robot hand)");
  } else {
    Serial.printf("Target %02X:%02X:%02X:%02X:%02X:%02X\n", t[0], t[1], t[2], t[3], t[4], t[5]);
  }
}

void loadTarget() {
  uint8_t mac[6];
  storage.begin("radio", true);
  bool found = storage.getBytes("target", mac, 6) == 6;
  storage.end();
  if (found) radio.setTarget(mac);  // otherwise ROBOT_MAC from config.h stays
}

// Reads a MAC like "58:E6:C5:F8:99:1C", "58-e6-...", "58E6C5F8991C" or
// "{0x58, 0xE6, ...}". Empty = broadcast. Returns false if it isn't a MAC.
bool parseMac(String text, uint8_t* mac) {
  text.replace("0x", "");
  text.replace("0X", "");
  String hex;
  for (char c : text) {
    if (isxdigit(c)) hex += c;
    else if (!strchr(" :-,{}\t\r", c)) return false;
  }
  if (hex.length() == 0) {
    memset(mac, 0xFF, 6);
    return true;
  }
  if (hex.length() != 12) return false;
  for (uint8_t i = 0; i < 6; i++) mac[i] = strtoul(hex.substring(2 * i, 2 * i + 2).c_str(), nullptr, 16);
  return true;
}

void setTargetFromSerial() {
  String text = Serial.readStringUntil('\n');  // waits up to 1 s for the line end
  uint8_t mac[6];
  if (!parseMac(text, mac)) {
    Serial.printf("ERROR: \"%s\" is not a MAC. Example: m58:E6:C5:F8:99:1C\n", text.c_str());
    return;
  }
  if (!radio.setTarget(mac)) Serial.println("ERROR: could not set the radio partner");
  storage.begin("radio", false);
  storage.putBytes("target", mac, 6);
  storage.end();
  showTarget();
}

void showInfo() {
  Serial.println(FIRMWARE_INFO);
  Serial.printf("MAC %s, radio channel %u\n", WiFi.macAddress().c_str(), RADIO_CHANNEL);
  showTarget();
  Serial.printf("Radio: %s, %s, %lu rounds ok, %lu given up\n",
                radio.connected() ? "CONNECTED" : "not connected", radio.stateText(),
                (unsigned long)radio.succeeded(), (unsigned long)radio.failed());
  Serial.printf("Creep compensation %s\n", creepOn ? "on" : "off");
  checkPins();
  showCalibration();
}

// Command D: wiring check, printed once (the test tool parses these lines):
//   Check: sensor F0 GPIO4 1234 mV noise 12 mV ok     (one per sensor: ok|open|short|noisy)
//   Check: battery 4012 mV                            (only on boards that measure it)
//   Check: button released                            (BOOT button: pressed|released)
//   Check: done
// What the verdicts mean and their thresholds: CHECK_* in config.h. Takes about
// 100 ms; the radio keeps running in between.
void wiringCheck() {
  uint32_t sumMv[SENSOR_COUNT] = {};
  uint16_t minMv[SENSOR_COUNT], maxMv[SENSOR_COUNT];
  bool atRail[SENSOR_COUNT];
  constexpr uint16_t ADC_MAX = 4095;  // 12 bit, see analogReadResolution() in setup()
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    minMv[i] = UINT16_MAX;
    maxMv[i] = 0;
    atRail[i] = true;
  }
  for (uint8_t n = 0; n < CHECK_SAMPLES; n++) {
    for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
      uint16_t raw = analogRead(SENSORS[i].pin);
      uint16_t mv = analogReadMilliVolts(SENSORS[i].pin);
      sumMv[i] += mv;
      minMv[i] = min(minMv[i], mv);
      maxMv[i] = max(maxMv[i], mv);
      if (raw > CHECK_RAIL_COUNTS && raw < ADC_MAX - CHECK_RAIL_COUNTS) atRail[i] = false;
    }
    if (radioOn) radio.update(fingers);
    delay(1);
  }
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    uint32_t noise = maxMv[i] - minMv[i];
    const char* verdict = "ok";
    if (noise >= CHECK_OPEN_MV) verdict = "open";
    else if (noise >= CHECK_NOISY_MV) verdict = "noisy";
    else if (atRail[i]) verdict = "short";
    Serial.printf("Check: sensor %s GPIO%u %lu mV noise %lu mV %s\n", SENSORS[i].key, SENSORS[i].pin,
                  (unsigned long)(sumMv[i] / CHECK_SAMPLES), (unsigned long)noise, verdict);
  }
  if (PIN_BATTERY >= 0) {
    uint32_t sum = 0;
    for (uint8_t n = 0; n < 16; n++) sum += analogReadMilliVolts(PIN_BATTERY);
    Serial.printf("Check: battery %lu mV\n", (unsigned long)(sum / 16.0f * BATTERY_FACTOR + 0.5f));
  }
  Serial.printf("Check: button %s\n", digitalRead(PIN_BUTTON) == LOW ? "pressed" : "released");
  Serial.println("Check: done");
}

void checkSerial() {
  if (!Serial.available()) return;
  switch (Serial.read()) {
    case 'k': calibrate(); break;
    case 'a': printValues = !printValues; break;
    case 'A': printValues = true; break;
    case 'r': printRaw = !printRaw; break;
    case 'R': printRaw = true; break;
    case 'l': radio.log = !radio.log; break;
    case 'i': showInfo(); break;
    case 'm': setTargetFromSerial(); break;
    case 'c': setCalibrationFromSerial(); break;
    case 'p': setPlaybackFromSerial(); break;
    case 'D': wiringCheck(); break;
    case 'o': rawStream = !rawStream; break;
    case 'O': rawStream = true; break;
    case 'L':
      linkReport = !linkReport;
      radio.takeStats();  // start counting from now
      Serial.printf("Link statistics %s\n", linkReport ? "ON" : "OFF");
      break;
    case 'd':
      creepOn = !creepOn;
      Serial.printf("Creep compensation %s\n", creepOn ? "ON" : "OFF");
      break;
    case 'f':
      radioOn = !radioOn;
      Serial.printf("Radio %s\n", radioOn ? "ON" : "OFF (nothing is sent)");
      break;
  }
}

void printLine() {
  static uint32_t last = 0;
  if (rawStream || !(printValues || printRaw) || millis() - last < 50) return;
  last = millis();
  // Format "name:value", which the Serial Plotter understands.
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    if (printValues && !isnan(values[i])) Serial.printf("%s:%.3f ", SENSORS[i].name, values[i]);
    if (printRaw) {
      Serial.printf("%s_mV:%.0f ", SENSORS[i].name, smoothMv[i]);
      if (creepOn) Serial.printf("%s_comp:%.0f ", SENSORS[i].name, compMv[i]);
    }
  }
  Serial.println();
}

// Command o/O: fast raw stream for the test tool's signals view, e.g.
//   F0_raw:1234 F1_raw:987
// One fresh single ADC reading (mV, not averaged or smoothed) per sensor every
// RAW_STREAM_INTERVAL_US, in place of printLine(). A line is only written when it
// fits into the serial transmit buffer, so this never blocks loop() and the radio;
// a late line is sent on the next pass (the average rate stays at 100 Hz).
void printRawStream() {
  static uint32_t next = 0;
  if (!rawStream) return;
  uint32_t now = micros();
  if ((int32_t)(now - next) < 0) return;
  char line[16 * SENSOR_COUNT + 3];
  if (Serial.availableForWrite() < (int)sizeof(line)) return;  // buffer full: try again on the next pass
  int length = 0;
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    length += snprintf(line + length, sizeof(line) - length, "%s%s_raw:%lu", i ? " " : "",
                       SENSORS[i].key, (unsigned long)analogReadMilliVolts(SENSORS[i].pin));
  }
  length += snprintf(line + length, sizeof(line) - length, "\r\n");
  Serial.write((const uint8_t*)line, length);
  next += RAW_STREAM_INTERVAL_US;
  // just switched on, or far behind (e.g. after a command that took a while): restart the clock
  if ((int32_t)(now - next) > (int32_t)(3 * RAW_STREAM_INTERVAL_US)) next = now + RAW_STREAM_INTERVAL_US;
}

// Command L: once per second what the radio did in that second, e.g.
//   [link] ok:10 fail:0 sent:30 resent:0 acks:30 rtt_us:1850 rtt_max_us:3200 round_us:5400 rssi:-48 rssi_min:-51
// (rtt = from sending a message to its ACK, round = SYN to ACK WAKEUP,
// rssi = signal strength of the robot hand's ACKs in dBm)
void printLinkReport() {
  static uint32_t last = 0;
  if (!linkReport || millis() - last < LINK_REPORT_MS) return;
  last = millis();
  LinkStats s = radio.takeStats();
  Serial.printf("[link] ok:%lu fail:%lu sent:%lu resent:%lu acks:%lu", (unsigned long)s.roundsOk,
                (unsigned long)s.roundsFailed, (unsigned long)s.sent, (unsigned long)s.resent,
                (unsigned long)s.acks);
  if (s.acks) {
    Serial.printf(" rtt_us:%lu rtt_max_us:%lu", (unsigned long)(s.rttSumUs / s.acks),
                  (unsigned long)s.rttMaxUs);
  }
  if (s.roundsOk) Serial.printf(" round_us:%lu", (unsigned long)(s.roundSumUs / s.roundsOk));
  if (s.rssiCount) Serial.printf(" rssi:%ld rssi_min:%d", (long)(s.rssiSum / (int32_t)s.rssiCount), s.rssiMin);
  Serial.printf(" playback:%d\n", playbackOn ? 1 : 0);
}

// LED every 2 s:
//   not calibrated               -> slow blinking (1 s on, 1 s off)
//   calibrated, no robot hand    -> double flash
//   calibrated, connected        -> single flash
void showStatus() {
  uint32_t t = millis() % 2000;
  bool on;
  if (!calibrated) on = t < 1000;
  else if (radio.connected()) on = t < 50;
  else on = t < 50 || (t >= 200 && t < 250);
  setLed(on ? HIGH : LOW);
}

// ---------------------------------------------------------------------------

void setup() {
#if !ARDUINO_USB_CDC_ON_BOOT
  Serial.setTxBufferSize(SERIAL_TX_BUFFER);  // UART: must be set before begin()
#endif
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  analogReadResolution(12);
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    if (digitalPinToAnalogChannel(SENSORS[i].pin) >= 0) {
      analogSetPinAttenuation(SENSORS[i].pin, ADC_11db);  // range about 0..3.1 V
    }
    values[i] = NAN;
    sensorBit[i] = msg::bitOf(SENSORS[i].key);
    if (sensorBit[i] < 0) Serial.printf("ERROR: %s has an unknown key %s\n", SENSORS[i].name, SENSORS[i].key);
  }
  if (PIN_BATTERY >= 0) analogSetPinAttenuation(PIN_BATTERY, ADC_11db);
  for (uint8_t b = 0; b < msg::FINGER_COUNT; b++) none[b] = playback[b] = NAN;
  delay(500);

  if (!radio.begin()) {
    Serial.println("ERROR: ESP-NOW could not be started");
  }
  loadTarget();
  loadCalibration();

  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    smoothMv[i] = compMv[i] = readMv(SENSORS[i].pin);
    creep[i] = 0;
  }

  Serial.printf("\nSensor glove group 1 ready (%u sensors)\n", SENSOR_COUNT);
  Serial.println(FIRMWARE_INFO);
  Serial.println("Commands: k=calibrate  a=values  r=raw  d=creep compensation  l=radio log  L=link statistics  f=radio  m=partner MAC  D=wiring check  o=raw stream  i=info");
  Serial.printf("MAC %s, radio channel %u\n", WiFi.macAddress().c_str(), RADIO_CHANNEL);
  showTarget();
  checkPins();
  showCalibration();
}

void loop() {
  static uint32_t lastMeasure = 0;

  checkButton();
  checkSerial();

  if (millis() - lastMeasure >= MEASURE_INTERVAL_MS) {
    lastMeasure = millis();
    measureAll();
    computeValues();
  }

  fillFingers();
  if (radioOn) radio.update(fingers);
  printLine();
  printRawStream();
  printLinkReport();
  showStatus();
}
