# Mural Kinematic Model

The Mural bot is suspended on two belts. As it moves across the wall it rotates slightly,
in particular it tilts towards the center as it moves to the edges of the drawing region.

In order to achieve precise drawing abilities it is essential that Mural keeps track of its
position in space. In particular, it needs to be aware of its inclination angle as it
moves around.

## Basic Model

Here, we describe the kinematic model of Mural, which is used to derive its exact location 
and orientation in space. The model is implemented in ``movement.cpp``, in particular the function ``getBeltLengths``.

The bot is modeled as a rigid body in 2D and all features are assumed to be projected onto the wall plane.
In this representation it can be modeled as two lines: One connecting the pulley tangent points
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
- the belts masses are negligible
- the pin distance is much larger than the bot width $d_{pins} >> width_{bot}$ 

### Tangent points

In our model the belt connects to the bot in the tangent point of its pulley. Technically, this point 
is not fully stable: It rotates slightly around the pulley center as the bot tilts sideways.

In the following it is assumed that this rotation can be ignored, and the tangent point are fixed at
a $45^\circ$ belt angle.

![tangent_point](/images/doc/tangent_point.drawio.svg)

The tangent point of the left pulley is located $q$ shifted to the right and $q$ shifted up relative to the pulley center. Likewise, the right tangent point is located $q$ left of the right pulley center and $q$ above the line connecting both pulley centers.

$q$ can be calculated from the pulley diameter $d_{pulley}$ as

$q=\frac{d_{pulley}}{2\cdot \sqrt2}$

So, for a typical pulley diameter of $d_{pulley}=12.69$ mm we get $q=4.4866$ mm .

The lenght of the line connecting the tangent point is given as the distance of the pulley axes minus $2*q$ .

## Solving for the Equilibrium State

With forces $F$ affecting the Mural bot they are moving it (translation) and rotating it by generating torques. 
We are looking for the static state of the bot, in which the forces as well as the torques cancel out.
We'll find this state by updating the values describing the bot's location, the forces and the torques 
in a consecutive and decoupled manner. I.e. while computing the forces we assume there's no torque, and while 
computing the torque there's no translating force. Updating these values repeatedly and in a loop
will lead to convergence of all quantities towards their true equilibrium states.

On a top level, we run the following steps in a loop until the quantities converge:
- compute belt angles $\varphi_L$ and $\varphi_R$
- compute forces on both belts
- compute torque on mural, solve for mural inclination $\gamma$

With the result: mural inclination $\gamma$, length of both belts in wall plane, and belt forces $F_L$ and $F_R$ .

In a subsequent step, these quantities are used to compute the belt lengths in 3D. Finally, a dilation correction is applied to account for non-rigidity of the belts under force.

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

Given the forces we can compute the torque values $T_L$ ,  $T_R$ and  $T_m$ they induce around the reference point $Q$.
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

The gravity force $F_G$ of the bot results in torque $T_m$ which is rotating it counter-clockwise (for $\gamma>0$):

$T_m = s_m \cdot F_m$ , with

$s_m = d_m \cdot \tan(\gamma)$ and

$F_m = F_g \cdot \cos(\gamma)$ .

So we get

$T_m = d_m \cdot \tan(\gamma) \cdot F_G \cdot \cos(\gamma)$

In the static state the resulting torque is zero, so

$T_R - T_L + T_m \stackrel{!}{=} 0$

, and the implementation searches numerically for a $\gamma$ which fulfills this condition.

## Tangent Points given Pen Location

As our goal is to compute the precise belt lenths, we have to compute the exact tangent point location given the outcome
of the optimization operation (see ``Movement::getLeftTangentPoint``). For the left tangent point we calculate the distance from the 
pen center in $x$ and $y$ as

$P_{LX} = s_L \cdot \cos(\gamma) - d_p \cdot \sin(\gamma)$

$P_{LY} = s_L \cdot \sin(\gamma) + d_p \cdot \cos(\gamma)$

and with these the left tangent point coordinates as

$x_{PL} = x_{pen} - P_{LX}$

$y_{PL} = y_{pen} - P_{LY}$

In the same way we get for the right pulley:


$P_{RX} = s_R \cdot \cos(\gamma) + d_p \cdot \sin(\gamma)$

$P_{RY} = s_R \cdot \sin(\gamma) - d_p \cdot \cos(\gamma)$

and

$x_{PR} = x_{pen} + P_{RX}$

$y_{PR} = y_{pen} + P_{RY}$

