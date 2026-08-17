# This is an enthusiastic fork of the original Mural code

This version of Mural now features:

- Multi-colour printing (with pen swaps), with care taken to not overlap pens (and if we do, start with the lighter colours)
- Variable hatching density based on grey/ colour density (i.e. can do light and dark colours from same pen)
- 7 fancy new hatching styles in addition to the existing cross-hatchng
- Tweaks to the already excellent routing algorithms with better smoothing, reducing drawing time
- Updated and slightly obnoxiously-styled mobile and desktop designs
- Clear estimations (before action) of image conversion/ hatching time, plotting time, ink used (measured in Sharpies)
- Larger, better previews of drawings before they get drawn
- Various smaller QoL tweaks (e.g. auto detection of motor stall on initial calibration, live progress updates in the UI, mostly-graceful resume from power outage/ other error...)
- - A full test suite and CI

This was only possible thanks to the excellent original code, fantastic original hardware (no changes there yet), previous adventures with Lego Mindstorms wall plotters and a hack of the Makelangelo plotter, and my careful but generous application of Claude Code in pursuit of the greater good.

Backlog

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
