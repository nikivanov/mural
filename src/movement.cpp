#include "movement.h"
#include "display.h"
#include <stdexcept>

Movement::Movement(Display *display)
{
    this->display = display;
   
    leftMotor = new AccelStepper(AccelStepper::DRIVER, LEFT_STEP_PIN, LEFT_DIR_PIN);
    leftMotor->setEnablePin(LEFT_ENABLE_PIN);
    leftMotor->setMaxSpeed(moveSpeedSteps);
    leftMotor->setPinsInverted(true);
    leftMotor->disableOutputs();

    rightMotor = new AccelStepper(AccelStepper::DRIVER, RIGHT_STEP_PIN, RIGHT_DIR_PIN);
    rightMotor->setEnablePin(RIGHT_ENABLE_PIN);
    rightMotor->setMaxSpeed(moveSpeedSteps);
    rightMotor->disableOutputs();

    topDistance = -1;
   
    moving = false;
    homed = false;
    startedHoming = false;
};

void Movement::setTopDistance(const int distance) {
    Serial.printf("Top distance set to %s\n", String(distance));
    topDistance = distance;                         // = d_pins [mm]

    minSafeY = safeYFraction * topDistance;         // = top_margin * d_pins [mm]
    minSafeXOffset = safeXFraction * topDistance;   // = side_margin * d_pins [mm]
    width = topDistance - 2 * minSafeXOffset;       // width of the drawing area [mm]
};

void Movement::resumeTopDistance(int distance /* = d_pin in mm */) {
    setTopDistance(distance);
    homed = true;

    const Point homeCoordinates = getHomeCoordinates();
    X = homeCoordinates.x;
    Y = homeCoordinates.y;

    const Lengths lengths = getBeltLengths(homeCoordinates.x, homeCoordinates.y);
    leftMotor->setCurrentPosition(lengths.left);
    rightMotor->setCurrentPosition(lengths.right);

    moving = false;
}

void Movement::setOrigin()
{
    leftMotor->setCurrentPosition(homedStepsOffset);
    rightMotor->setCurrentPosition(homedStepsOffset);
    homed = true;
};

void Movement::leftStepper(const int dir)
{
    if (dir > 0)
    {
        leftMotor->move(INFINITE_STEPS);
        leftMotor->setSpeed(printSpeedSteps);
    }
    else if (dir < 0)
    {
        leftMotor->move(-INFINITE_STEPS);
        leftMotor->setSpeed(printSpeedSteps);
    }
    else
    {
        leftMotor->setAcceleration(acceleration);
        leftMotor->stop();
    }

    moving = true;
};

void Movement::rightStepper(const int dir)
{
    if (dir > 0)
    {
        rightMotor->move(INFINITE_STEPS);
        rightMotor->setSpeed(printSpeedSteps);
    }
    else if (dir < 0)
    {
        rightMotor->move(-INFINITE_STEPS);
        rightMotor->setSpeed(printSpeedSteps);
    }
    else
    {
        rightMotor->setAcceleration(acceleration);
        rightMotor->stop();
    }

    moving = true;
};

Movement::Point Movement::getHomeCoordinates() {
    if (topDistance == -1) {
        return Point(0, 0);
    }

    return Point(width / 2, HOME_Y_OFFSET_MM);
}

int Movement::extendToHome()
{
    setOrigin();

    auto homeCoordinates = getHomeCoordinates();
    startedHoming = true;
    auto moveTime = beginLinearTravel(homeCoordinates.x, homeCoordinates.y, moveSpeedSteps);
    return int(ceil(moveTime));
};

void Movement::runSteppers()
{
    if (moving)
    {
        leftMotor->runSpeedToPosition();
        rightMotor->runSpeedToPosition();

        if (leftMotor->distanceToGo() == 0 && rightMotor->distanceToGo() == 0)
        {
            moving = false;
            //Serial.printf("Motion complete. Left steps: %ld, Right steps: %ld\n", leftMotor->currentPosition(), rightMotor->currentPosition());
        }
    }
};

inline void Movement::getLeftTangentPoint(const double frameX, const double frameY, const double gamma, double& x_PL, double& y_PL) const {
    // Input frameX and frameY are the coordinates of the pen center.
    const double s_L = d_t / 2.0;   // Distance of left and right tangent point from point Q. [mm]
    const double P_LX = s_L * cos(gamma) - d_p * sin(gamma); // [mm] distance from pen center in x
    const double P_LY = s_L * sin(gamma) + d_p * cos(gamma); // [mm] .. and y
    x_PL = frameX - P_LX;    // [mm] Left pulley tangent point in frame coordinate system.
    y_PL = frameY - P_LY;    // [mm]
}

inline void Movement::getRightTangentPoint(const double frameX, const double frameY, const double gamma, double& x_PR, double& y_PR) const {
    // Coordinates of right pulley tangent point:
    const double s_R = d_t / 2.0;
    const double P_RX = s_R * cos(gamma) + d_p * sin(gamma); // [mm]
    const double P_RY = s_R * sin(gamma) - d_p * cos(gamma); // [mm]
    x_PR = frameX + P_RX;    // [mm] Right pulley tangent point in frame coordinate system.
    y_PR = frameY + P_RY;    // [mm]
}

// Compute angles of the belts and the forces on them.
// Input: - Mural coordinates X and Y in frame coordinate system [mm].
//        - Mural inclination gamma [rad].
// Output: - belt angles phi_L, phi_R [rad], measured against the line connecting the pins.
void Movement::getBeltAngles(const double frameX, const double frameY, const double gamma, double& phi_L, double& phi_R) const {
    double x_PL;
    double y_PL;
    getLeftTangentPoint(frameX, frameY, gamma, x_PL, y_PL);
    phi_L = atan2(y_PL, x_PL);     // Angle of left belt, measured from line connecting the pins. [rad]

    double x_PR;
    double y_PR;
    getRightTangentPoint(frameX, frameY, gamma, x_PR, y_PR);
    phi_R = atan2(y_PR, topDistance - x_PR);     // Angle of left belt, measured from line connecting the pins. [rad]
}

void Movement::getBeltForces(const double phi_L, const double phi_R, double& F_L, double&F_R) const {
    // Computing the Forces. 
    // Force vectors are parallel to their belts, so the direction is given by phi_R and phi_L.
    // We assume that the bot is in a stable state (no torque), which allows us for having
    // the force vectors of left (L) and right (R) pulley meet in a single point. 
    // In this stable state the pulley forces cancel out the gravity force in x and y.
    // Note this is an approximation which is refined due to iteratively updating the values (torque, angles, forces). 
    const double F_G = mass_bot * g_constant;       // [N] Gravity force is pulling bot down. No x component.
    F_R = F_G * cos(phi_L) / sin(phi_L + phi_R);    // [N] magnitude of the force vector
    F_L = F_G * cos(phi_R) / sin(phi_L + phi_R);    // [N]
    // double F_Ly = F_L * sin(phi_L);                         // [N] components in y and x
    // double F_Lx = F_L * sin(phi_L);                         // [N] ...
    // double F_Ry = F_R * sin(phi_R);                         // [N]
    // double F_Rx = F_R * sin(phi_R);                         // [N]
}

double Movement::solveTorqueEquilibrium(const double phi_L, const double phi_R, const double F_L, const double F_R, const double gamma_init) const {
    // Solve for torque equilibrium: As the belts are pulling on two distinct point, there's a torque rotating the
    // bot around a reference point. Here, we assume this reference point corresponds to Q, where tangent line d_t
    // and mass line d_m meet.
    // In the static case the residual torque is zero, which occurs at a certain inclination gamma. The goal here is
    // to find this gamma.
    const double s_L = d_t / 2.0;   // [mm] Lenght of the effective arm for the left pulley.
    const double s_R = d_t / 2.0;   // [mm]

    double gamma_best = 99999999;
    double T_delta_best = 99999999;

    // Solver parameters.
    constexpr double gamma_step = 0.20 * PI / 180.0;   // [rad] solver step width.
    constexpr double gamma_min = -90.0 * PI / 180.0;   // [rad] Solver search range: max and min values.
    constexpr double gamma_max = 90.0 * PI / 180.0;    // [rad]
    constexpr double gamma_search_window = 2.0 * PI / 180.0;    // [rad] Solver will focus on gamma_init +- gamma_search_window.
    
    // Simple solver: finding the minimum T_delta by searching over the range specified above:
    for (double gamma = gamma_init - gamma_search_window;
            gamma > gamma_min &&
            gamma < gamma_max &&
            gamma <= gamma_init + gamma_search_window;
            gamma += gamma_step){
        const double alpha = phi_L - gamma;   // [rad] Angle between left belt and line connecting tangent points (of pulleys and belts).
        const double beta = phi_R + gamma;    // [rad] Angle between right belt and line connecting tangent points.
    
        double T_L = /* s_L * F_L = */ s_L * sin(alpha) * F_L;  // [N * mm]
        double T_R = s_R * sin(beta) * F_R;                     // [N * mm]

        // The center of mass sits under the center of line connecting the tangent points.
        double s_m = d_m * tan(gamma);                          // [mm]
        const double F_G = mass_bot * g_constant;               // [N] Gravity force is pulling bot down. No x component.
        double F_m = F_G * cos(gamma);
        double T_m = s_m * F_m;                                 // [N * mm]

        // Left pulley tries to turn the bot clockwise. Right pulley ccw. Gravity ccw if gamma is positive (i.e. the bot inclined to the right).
        double T_delta = T_R - T_L + T_m;                       // [N * mm]
        // Solve gamma for T_delta = 0.0 .
        if (abs(T_delta) < abs(T_delta_best)){
            T_delta_best = T_delta;
            gamma_best = gamma;
            // Serial.printf("  solveTorqueEquilibrium: T_delta=%1.4f @ gamma=%1.4f, T_delta_best=%1.4f @ gamma_best=%1.4f\n",
            //     T_delta, gamma, T_delta_best, gamma_best);
        } else {
            // There is only one zero crossing: terminate early if T_delta gets worse than best one so far.

            // Serial.printf("  solveTorqueEquilibrium: T_delta=%1.4f @ gamma=%1.4f, T_delta_best=%1.4f @ gamma_best=%1.4f Exit function.\n",
            //     T_delta, gamma, T_delta_best, gamma_best);
            return gamma_best;
        }
    }

    return gamma_best;
}

inline double Movement::getDilationCorrectedBeltLength(double belt_length, double F_belt) const {
    // Apply belt length correction: The belts stretch because of Mural's mass. 
    // This function returns a (shorter) length of the belt, such that with gravity the belt
    // exactly as long as required.
    const double elongation_factor = 1 + belt_elongation_coefficient * F_belt;
    const double belth_length_corrected = belt_length / elongation_factor;
    return belth_length_corrected;
}

// Calculate the lengths of the left and right belt in mm based on the input coordinates.
// input: x [mm], y [mm] ; both in image coordinate system
// output: Struct containing the target stepper position for each motor to move.
Movement::Lengths Movement::getBeltLengths(const double x, const double y) {
    // Mural rotates as it moves towards the sides. As this happens, Mural's coordinate
    // system rotates as well, which would mean straight lines become curved. Therefore, 
    // a compensation in this rotated system is computed and applied.
    // !!!! Please see KinematicModel.md for a more detailed explanation !!!!
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

    // Pen coordinates in frame coordinate system.
    const double frameX = x + minSafeXOffset;
    const double frameY = y + minSafeY;

    double gamma = gamma_last_position;              // Inclination of the bot [rad]. 0: Bot is horizontal. gamma>0: Bot tilts to the right.
    double phi_L = 0.0;
    double phi_R = 0.0;
    double F_L = 0.0;                               // [N] magnitude of the force vector (left belt)
    double F_R = 0.0;                               // [N] magnitude of the force vector (right belt)
    constexpr int solver_max_iterations = 20;       // Maximum number of outer loop iterations of the solver.
    constexpr double gamma_delta_termination = 0.25 / 180.0 * PI; // [rad] Outer loop of solver will stop if last update is smaller than this. 
                                                                  // Value should be greater than gamma step size in solveTorqueEquilibrium.

    // Solve for belt angles phi and bot inclination gamma by running a few rounds.
    int debug_step_count = 0;
    for (int i = 0; i < solver_max_iterations; i++){
        getBeltAngles(frameX, frameY, gamma, phi_L, phi_R);

        getBeltForces(phi_L, phi_R, F_L, F_R);

        const double gamma_last = gamma;
        gamma = solveTorqueEquilibrium(phi_L, phi_R, F_L, F_R, gamma);
        // Serial.printf(" Solver loop: i=%d, frameX=%1.2f, frameY=%1.2f, phi_L=%1.4f, phi_R=%1.4f, F_L=%1.2f, F_R=%1.2f, gamma=%1.4f\n", 
        //     i, frameX, frameY, phi_L, phi_R, F_L, F_R, gamma);
        debug_step_count = i;
        if (abs(gamma_last - gamma) < gamma_delta_termination) break;
    }
    gamma_last_position = gamma;
    // Serial.printf("Solver found: frameX=%1.2f, frameY=%1.2f, phi_L=%1.4f, phi_R=%1.4f, F_L=%1.2f, F_R=%1.2f, debug_step_count=%d, gamma=%1.4f\n", 
    //     frameX, frameY, phi_L, phi_R, F_L, F_R, debug_step_count, gamma);

    double leftX, leftY;
    double rightX, rightY;
    getLeftTangentPoint(frameX, frameY, gamma, leftX, leftY);
    getRightTangentPoint(frameX, frameY, gamma, rightX, rightY);

    // Left and right leg distances flush to the wall.
    const double leftLegFlat = sqrt(pow(leftX, 2) + pow(leftY, 2));
    const double rightLegFlat = sqrt(pow(topDistance - rightX, 2) + pow(rightY, 2));

    // Left and right leg distances including the standoff length.
    double leftLeg = sqrt(pow(leftLegFlat, 2) + pow(midPulleyToWall, 2));
    double rightLeg = sqrt(pow(rightLegFlat, 2) + pow(midPulleyToWall, 2));

    leftLeg = getDilationCorrectedBeltLength(leftLeg, F_L);
    rightLeg = getDilationCorrectedBeltLength(rightLeg, F_R);
    
    const double leftLegSteps = int((leftLeg / circumference) * stepsPerRotation);
    const double rightLegSteps = int((rightLeg / circumference) * stepsPerRotation);

    return Lengths(leftLegSteps, rightLegSteps);
}

float Movement::beginLinearTravel(double x, double y, int speed)
{
    X = x;
    Y = y;
    if (topDistance == -1 || !homed) {
        Serial.println("Not ready");
        throw std::invalid_argument("not ready");
    }

    if (x < 0 || (x - 1) > width)
    {
        Serial.println("Invalid x");
        throw std::invalid_argument("Invalid x");
    }

    if (y < 0)
    {
        Serial.println("Invalid y");
        throw std::invalid_argument("Invalid y");
    }

    auto lengths = getBeltLengths(x, y);
    auto leftLegSteps = lengths.left;
    auto rightLegSteps = lengths.right;

    auto deltaLeft = int(abs(abs(leftMotor->currentPosition()) - leftLegSteps));
    auto deltaRight = int(abs(abs(rightMotor->currentPosition()) - rightLegSteps));

    float leftSpeed, rightSpeed, moveTime;
    if (deltaLeft >= deltaRight)
    {
        leftSpeed = speed;
        moveTime = deltaLeft / leftSpeed;
        rightSpeed = deltaRight / moveTime;
    }
    else
    {
        rightSpeed = speed;
        moveTime = deltaRight / rightSpeed;
        leftSpeed = deltaLeft / moveTime;
    }

    //Serial.printf("Begin movement: X(%s) Y(%s) UnsafeX(%s) UnsafeY(%s) leftLeg(%s) rightLeg(%s) deltaLeft(%s) deltaRight(%s) leftSpeed(%s) rightSpeed(%s) \n", String(x), String(y), String(unsafeX), String(unsafeY), String(leftLeg), String(rightLeg), String(deltaLeft), String(deltaRight), String(leftSpeed), String(rightSpeed));
    leftMotor->moveTo(leftLegSteps);
    leftMotor->setSpeed(leftSpeed);
    
    rightMotor->moveTo(rightLegSteps);
    rightMotor->setSpeed(rightSpeed);

    //display->displayText(String(X) + ", " + String(Y));
    delay(sleepDurationAfterMove_ms);

    moving = true;
    return moveTime;
};

double Movement::getWidth() {
    if (topDistance == -1) {
        throw std::invalid_argument("not ready");
    }
    return width;
}

Movement::Point Movement::getCoordinates() {
    if (X == -1 || Y == -1) {
        Serial.println("Not ready to get coordinates");
        throw std::invalid_argument("not ready");
    }

    if (moving) {
        Serial.println("Can't get coordinates while moving");
        throw std::invalid_argument("not ready");
    }
    return Movement::Point(X, Y);
}

void Movement::extend1000mm() {
    const int steps = int((1000 / circumference) * stepsPerRotation);   

    leftMotor->move(steps);
    leftMotor->setSpeed(moveSpeedSteps);

    rightMotor->move(steps);
    rightMotor->setSpeed(moveSpeedSteps);

    moving = true;
}

void Movement::disableMotors() {
    leftMotor->disableOutputs();
    rightMotor->disableOutputs();
}

bool Movement::isMoving() {
    return moving;
}

bool Movement::hasStartedHoming() {
    return startedHoming;
}

int Movement::getTopDistance() {
    return topDistance;
}
