# Bill of Materials
All parts can be found on Amazon, AliExpress, Ebay etc. Make sure the items you're ordering match the pictures. 

| Part| Reference Photo | Notes |
|---|---|---|
|NodeMCU ESP32 ESP-WROOM-32|![esp32](/images/bom/esp32.jpg)| Also sometimes referred to as ESP32 devkit v1
| 2x Pancake Nema 17 motors |![nema17](/images/bom/nema17.jpg) ![nema17-dims](/images/bom/nema17-dims.jpg) |
| 2x Stepper Motor Driver control extension boards |![driverboard](/images/bom/driverboard.jpg) | 
| 2x TMC2209 Stepper motor drivers |![drivers](/images/bom/tmc2209.jpg) | You can also use A4988 or DRV8825 if you don't mind the noise, just make sure the DIP switches on the driver board are set for 1/8 microstepping
| GT2 Pulley 20 teeth 5mm bore 6mm shaft | ![pulley](/images/bom/pulley.jpg) ![pulley-dims](/images/bom/pulley_dims.jpg) | Make sure to get the pulley with those exact dimensions 
| GT2 Timing belt 2mm pitch 6mm width | ![belt](/images/bom/belt.jpg) |
| MG90s metal gear servo | ![servo](/images/bom/mg90s.jpg) | Different brands have different diameter metal shafts. The servo arm mounting hole comes in different sizes. Print the fitting guide first to confirm size. The arm needs to go very snugly onto the shaft so it doesn't spin through
| USB-C PD 12V power trigger module | ![display](/images/bom/pd.jpg) | Confirm with a voltmeter that you're indeed getting 12V from it when plugging it into the USB-C power source
| LM2596 DC to DC voltage regulator (buck) | ![buck](/images/bom/buck.jpg) | Connect to the USB-C PD board and then turn the potentiometer (most likely) counter-clockwise until the output reads 5.1V
| 20W USB-C power delivery adapter | ![power](/images/bom/power.jpg) | You can use any PD adapter with at least 20W and can supply 12V
| USB-C male-to-male 10ft cable | ![cable](/images/bom/cable.jpg) |
| M-F and F-F breadboard jumper wire 10cm and 20cm | ![wire](/images/bom/wire.jpg) |
| M3 hex bolt set | ![m3](/images/bom/m3.jpg) |
| 2.54m pitch male headers | ![headers](/images/bom/header.jpg) |