#include <Arduino.h>
#include <Wire.h>
//#include <RunningMedian.h>

const int minInput[] = {700};
const int maxInput[] = {3333};
const int minoutput = 0;
const int maxoutput = 1;

int portNumbers[] = {4};



int flexValue;
int previousflexValue;

const int flexPin = 4;
const int numberOfSamples = 15;
const int numberOfFingers = 1;

float roundedfingerValue[numberOfFingers];
float previousfingerValue[numberOfFingers];
long SensorRead[numberOfFingers];




float map_to_0_1(float value, float min_input, float max_input){
  float result = (value - min_input) / (max_input - min_input);
  return(result);
}






float* read_fingers(){
  for (int finger = 0; finger < numberOfFingers; finger++){ 
    SensorRead[finger] = 0;
  }
  for (int i = 0; i < numberOfSamples; i++){
    for (int finger = 0; finger < numberOfFingers; finger++){
      SensorRead[finger] += analogRead(portNumbers[finger]); // Read the analog value from the flex sensor
    }
    delay(50); // Wait for 50 milliseconds before the next reading
  }
  float fingerValue[numberOfFingers];
  for (int finger = 0; finger < numberOfFingers; finger++){
    int intermediatValue = 0;
    intermediatValue = SensorRead[finger] / numberOfSamples;
    fingerValue[finger] = map_to_0_1(intermediatValue, minInput[finger], maxInput[finger]);
    if(fingerValue[finger] < 0){
      fingerValue[finger] = 0;
    }
    roundedfingerValue[finger] = (fingerValue[finger] + previousfingerValue[finger]) / 2;
    previousfingerValue[finger] = fingerValue[finger];
  }
  return(roundedfingerValue);
}


void setup() {
  Serial.begin(9600); // Initialize serial communication
  pinMode(flexPin, INPUT); // Set the flex sensor pin as input
  delay(500);
  Serial.println("reset");

  
}

void loop(){
  float* fingerValues;
  fingerValues = read_fingers();
  //Serial.print("Sensor Values: ");
  for(int i = 0; i < numberOfFingers; i++){
    Serial.println(fingerValues[i]);
  }
}
