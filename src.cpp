#include <Wire.h>
#include <VL53L7CX.h> // Include the VL53L7CX library

VL53L7CX sensor; // Create a sensor object

void setup() {
  Serial.begin(9600); // Initialize serial communication
  Wire.begin();       // Initialize I²C communication

  // Initialize the VL53L7CX sensor
  if (!sensor.begin()) {
    Serial.println("Failed to initialize VL53L7CX sensor!");
    while (1); // Halt execution if initialization fails
  }

  Serial.println("VL53L7CX initialized successfully.");
}

void loop() {
  uint16_t distances[64]; // Array to store distances for 64 zones

  // Perform a distance measurement
  if (sensor.getDistances(distances)) {
    Serial.println("Distance measurements (in mm):");
    for (int i = 0; i < 64; i++) {
      Serial.print(distances[i]);
      Serial.print(" ");
      if ((i + 1) % 8 == 0) Serial.println(); // Print 8 values per line
    }
    Serial.println();
  } else {
    Serial.println("Failed to read distances.");
  }

  delay(500); // Wait 500 ms before the next measurement
}
