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

# Mural's Kinematic Model

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
The distance of the two tangent points is calles $s$.
The bot's mass is assumed to be concentrated into a single point (its center of gravity) which is
located in distance $d_m$ from $Q$. The pen center is located in distance $d_p$ from $Q$ .

The relevant forces in this model are: $F_L$ applied by the left pulley, $F_R$ applied by the right pulley, 
and the gravitational force $F_G$ affecting the center of mass.

![kinematic_model1](/images/doc/kinematic_model1.drawio.svg)

Assumptions:

- all mass is concentrated in a single point
- the belts mass is negligible
- the pin distance is much larger than the bot width $d_{pins} >> width_{bot}$ 

## Solving for the Equilibrium State

With forces affecting the Mural bot they are moving it (translation) and rotating it by generating torques. 
We are looking for the static state of the bot, in which the forces as well as the torques cancel out.
We'll find this state by updating the values describing the bot's location, the forces and the torques 
in a consecutive and decoupled manner. I.e. while computing the forces we assume there's no torque, and while 
computing the torque there's no translating force, etc.. Updating these values repeatedly and in a loop
will lead to convergence of all quantities towards their true equilibrium states.

On a top level, we run the following steps in a loop:
- compute belt angles $\varphi_L$ and $\varphi_R$
- compute forces on both belts
- compute torque on mural, solve for mural inclination $\gamma$

With the result: mural inclination $\gamma$, length of both belts in wall plane, and belt forces $F_L$ and $F_R$ .

In subsequent steps, these quantities are used to compute the belt lengths in 3D and to apply a dilation correction to account for non-rigidity of the belts under force.

## Forces

In the equilibrium state the overall torque on the bot is zero and can be ignored. In this case
all forces can be assumed to be applied to a single point:

![kinematic_model_forces](/images/doc/kinematic_model_forces.jpg)

Introducing the angles $\rho = 90^\circ-\varphi_R$ and $\delta = 90^\circ-\varphi_L$ we can apply the [Law of Sines](https://en.wikipedia.org/wiki/Law_of_sines) and get:

$\frac{F_R}{F_G}=\frac{\sin(\delta)}{\sin\left( \varphi_R + \varphi_L \right)}$

$\Leftrightarrow F_R=\frac{F_G\cdot\sin(\delta)}{\sin\left( \varphi_L + \varphi_R \right)} =
\frac{F_G\cdot\cos(\varphi_L)}{\sin\left( \varphi_L + \varphi_R \right)}$

and likewise

$\frac{F_L}{F_G}=\frac{\sin(\rho)}{\sin\left( \varphi_L + \varphi_R \right)}$

$\Leftrightarrow F_L=\frac{F_G\cdot\sin(\rho)}{\sin\left( \varphi_L + \varphi_R \right)} =
\frac{F_G\cdot\cos(\varphi_R)}{\sin\left( \varphi_L + \varphi_R \right)}$


## Torques

![kinematic_model_torques](/images/doc/kinematic_model_torques.jpg)

Given the forces we can compute the torque values $T_L$ ,  $T_R$ and  $T_m$ they induce on the reference point $Q$.
What we are interested in is the bot inclination angle $\gamma$. A positive $\gamma$ means the bot tilts to the right,
while a negative $\gamma$ represents a tilt to the left.

Let's introduce the auxilliary angles $\alpha$ and $\beta$ representing the direction of the belts relative to the
line connecting the tangent points:
$\varphi_L = \alpha + \gamma$
and 
$\varphi_R = \beta - \gamma$ .

As $Q$ is located in the center between the tangent points we get $s_L = 0.5\cdot s$ and $s_R = 0.5\cdot s$.

The torque induced on the left tangent point is 

$T_L = s_L \cdot \sin(\alpha)\cdot F_L$ 

, and it is pushing the bot clockwise.

Analogously, $T_R$ is affecting the right tangent point and rotating the bot counter-clockwise around $Q$:

$T_R = s_R \cdot \sin(\beta)\cdot F_R$ 

The mass of the bot results in torque $T_m$ which is rotating it counter-clockwise (for $\gamma>0$):

$T_m = s_m * F_m$ , with

$s_m = d_m \cdot \tan(\gamma)$ and

$F_m = F_g \cdot \cos(\gamma)$ .

So we get

$T_m = d_m \cdot \tan(\gamma) \cdot F_G \cdot \cos(\gamma)$

In the static state the resulting torque is zero, so

$T_R - T_L + T_m a\stackrel{!}{=} 0$

, and the implementation numerically searches for a $\gamma$ which fulfills this condition.