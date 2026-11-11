# BionicHand
Scripts and thoughts from the Birklehof +MINT-Camp `BionicHand`

## ESP-NOW flex data

`main.cpp` initializes serial communication at `115200` baud. Send the lowercase
serial command `s` to start continuous ESP-NOW transmission. Each payload ends
with a newline and uses this format:

```text
F0:<float>,S0:0,F1:<float>,F2:<float>,F3:<float>,F4:<float>,F5:<float>
```

Update the placeholder pin and calibration arrays in `main.cpp` with the final
six-sensor hardware configuration. Correct the MAC. 


depts: 

VL53L0X <b>VL53L7CX</b>
