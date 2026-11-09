#include <Wire.h> 

const int flexPin = 3; 

void setup() {
  Serial.begin(9600); // Initialize serial communication
  pinMode(flexPin, INPUT); // Set the flex sensor pin as input
}

void loop(){
    int flexValue = analogRead(flexPin); // Read the analog value from the flex sensor
    Serial.print("Flex Sensor Value: ");
    Serial.println(flexValue); // Print the flex sensor value to the serial monitor
    delay(500); // Wait for 500 milliseconds before the next reading

}
