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

The Mural bot is suspended on two belts. As it moves across the wall it rotates slightly,
in particular it tilts towards the center as it moves to the edges of the drawing region.

In order to achieve precise drawing abilities it is essential that Mural keeps track of its
position in space. In particular, it needs to be aware of its inclination angle as it
moves around.

This section describes a kinematic model of mural, which is used to derive its exact location 
and orientation in space. The model is implemented in movement.cpp, c.f. function getBeltLengths.

The bot is modeled as a rigid body in 2D and all features are assumed to be projected onto the wall plane.
In this representation it can be represented as two lines: One connecting the pulley tangent points
and orthogonal to it the line which goes through the pen center and the bot's center of mass $m$. The 
two lines coincide in a reference point called $Q$. 
The bot's mass is assumed to be concentrated into a single point (its center of gravity) which is
located in distance $d_m$ from $Q$. The pen center is located in distance $d_p$ from $Q$ .

The relevant forces in this model are: $F_L$ applied by the left pulley, $F_R$ applied by the right pulley, 
and the gravitational force $F_G$ affecting the center of mass.

![kinematic_model1](/images/doc/kinematic_model1.drawio.svg)




rotates as it moves towards the sides. As this happens, Mural's coordinate
    // system rotates as well, which would mean straight lines become curved. Therefore, 
    // a compensation in this rotated system is computed and applied.
    //
    // This function works as follows:
    // 1 Compute the belt length in the wall plane first:
    //   {
    //      compute belt angles phi_L and phi_R
    //      compute forces on both belts
    //      compute torque on mural, solve for mural inclination gamma
    //      loop (if needed)
    //      result: mural inclination, x and y correction, and belt forces
    //   }
    // 2 Compute 3D belt length: Euclidean distance due to Pulleys not being in same (wall) plane
    //   as belt anchors (pins).
    // 3 Apply dilation correction to account for non-rigid belts.


    // Coordinate systems:
    // Frame coordinate system: Outer frame defined by the belt pins. Origin is the center of the left pin.
    //      x-axis points right towards the right pin. y-axis is perpendicular to x, pointing down.
    // Image coordinate system:
    //      This coordinate system defines the actual drawing area. The origin is in the top left corner 
    //      of the image to be drawn. It is shifted by safeYFraction * d_pins down from the line connecting the pins.
    //      Additionally, it's shifted safeXFraction to the right from the y-axis of the frame coordinate system.
    //      So, in frame coordinates the origin of the image coordinate system is 
    //      (safeYFraction * d_pins, safeXFraction * d_pins).
    //      See also /images/doc/muralbot_image_positioning.svg . 

