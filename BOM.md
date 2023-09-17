# Bill of Materials
All parts can be found on Amazon, AliExpress, Ebay etc. Make sure the items you're ordering match the pictures. 

| Part| Reference Photo | Notes |
|---|---|---|
|NodeMCU ESP32 ESP-WROOM-32|![esp32](/images/bom/esp32.jpg)| Also sometimes referred to as ESP32 devkit v1
| 2x 28byj-48 stepper motors with ULN2003 drivers |![28byj-48](/images/bom/28byj-48.jpg) | More often than not they are sold together as a kit
| GT2 Pulley 20 teeth 5mm bore 6mm shaft | ![pulley](/images/bom/pulley.jpg) ![pulley-dims](/images/bom/pulley_dims.jpg) | Make sure to get the pulley with those exact dimensions 
| GT2 Timing belt 2mm pitch 6mm width | ![belt](/images/bom/belt.jpg) |
| MG90s metal gear servo | ![servo](/images/bom/mg90s.jpg) | Different brands have different diameter metal shafts. The servo arm mounting hole comes in different sizes. Print the fitting guide first to confirm size. The arm needs to go very snugly onto the shaft so it doesn't spin through
| 0.96" OLED I2C display | ![display](/images/bom/screen.jpg) | 
| USB-C PD 9V power trigger module | ![display](/images/bom/pd.jpg) | Confirm with a voltmeter that you're indeed getting 9V from it when plugging it into the USB-C power source
| LM2596 DC to DC voltage regulator (buck) | ![buck](/images/bom/buck.jpg) | Connect to the USB-C PD board and then turn the potentiometer (most likely) counter-clockwise until the output reads 5.2V
| 20W USB-C power delivery block | ![power](/images/bom/power.jpg) | You can use any PD block with at least 20W and can supply 9V
| USB-C male-to-male 10ft cable | ![cable](/images/bom/cable.jpg) |