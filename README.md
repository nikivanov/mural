# [getmural.me](https://getmural.me)

Please find the main documentation on https://getmural.me. 

# Additional Information

## Positioning of the Drawing on the Wall

Here's how the image is prepared and drawn:

- The user defines the pin distance as part of the setup in the UI. For example 1 meter (or 1000mm). (This is d_pins in the image below.)
- The top margin is 20% of that distance, so the top of the image will be 200mm below the line between the two pins.
- Each side also has a 20% margin, so you'll get total of 60% of the horizontal distance, or 600mm.
- Now that we have the max width (600mm). The SVG is resized so its width is 600 and the height gets resized proportionally.
- Then a processing step is performed on the SVG to figure out what to actually draw, with each SVG unit being treated as millimeter.
- Finally it's converted into a simple format for Mural to draw, containing mostly its coordinate movement commands and pen up/down. This file is then uploaded to the microcontroller and executed line by line.

![image_positioning](/images/doc/muralbot_image_positioning.svg)

## Mural's Kinematic Model

Please find the kinematic model [here](KinematicModel.md).

## TMC2209 Subdivision Configuration Table

| MS1 | MS2 | MS3 | Subdivision Mode | Steps per Revolution |
|:---:|:---:|:---:|------------------:|--------------------:|
| 0 | 0 | 0 | Full Steps | 200 |
| 1 | 0 | 0 | 1/2 | 400 |
| 0 | 1 | 0 | 1/4 | 800 |
| 1 | 1 | 0 | 1/8 | 1600 |
| 0 | 0 | 1 | 1/16 | 3200 |
| 1 | 0 | 1 | 1/32 | 6400 |
| 0 | 1 | 1 | 1/64 | 12800 |
| 1 | 1 | 1 | 1/128 | 25600 |

## Recommended Configuration Example

- Set **MS1 = ON (1)**  
- Set **MS2 = ON (1)**  
- Set **MS3 = OFF (0)**

With this configuration the TMC2209 operates in **1/8 subdivision mode**, generating **1600 pulses per revolution**, matching the setting in movement.h:13:  
stepsPerRotation = 200 * 8 = 1600.
