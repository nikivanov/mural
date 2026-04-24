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

| MS2 Pin | MS1 Pin | Microstep Setting |
|---------|---------|-------------------|
| GND | GND | **8 microsteps** |
| GND | VCC_IO | **32 microsteps** |
| VCC_IO | GND | **64 microsteps** |
| VCC_IO | VCC_IO | **16 microsteps** |

---

The **TMC2209** supports 8, 16, 32, and 64 microstep resolutions controlled by the MS1 and MS2 pins. The configuration differs from the TMC2208 in the 32 and 64 microstep modes, as noted in the datasheet.

According https://github.com/nikivanov/mural/blob/c817cd03863fe5c1ac683311f0aa24aa7fac01d6/src/movement.h#L13 ,we should set the ms1 to 0 ande the ms2 to 0.
