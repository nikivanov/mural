#include "movement.h"
#include "display.h"

Movement::Movement(Display *display)
{
    this->display = display;

    loadPhysicsConstants();

    leftMotor = new AccelStepper(AccelStepper::DRIVER, LEFT_STEP_PIN, LEFT_DIR_PIN);
    leftMotor->setEnablePin(LEFT_ENABLE_PIN);
    leftMotor->setMaxSpeed(moveSpeedSteps);
    leftMotor->setPinsInverted(true);
    leftMotor->disableOutputs();

    rightMotor = new AccelStepper(AccelStepper::DRIVER, RIGHT_STEP_PIN, RIGHT_DIR_PIN);
    rightMotor->setEnablePin(RIGHT_ENABLE_PIN);
    rightMotor->setMaxSpeed(moveSpeedSteps);
    rightMotor->disableOutputs();

#ifdef MURAL_TMC_UART
    // UNTESTED ON HARDWARE: bring up the shared TMC2209 UART and configure
    // both drivers. Motion is still driven via the existing STEP/DIR pins
    // above (AccelStepper); UART is only used for configuration and for
    // reading StallGuard/DIAG state.
    setupTmcDrivers();
#endif

    topDistance = -1;
   
    moving = false;
    homed = false;
    startedHoming = false;
};

// Loads the runtime-configurable physics constants from NVS (via the Preferences
// library), falling back to the compile-time defaults on first boot / if unset.
void Movement::loadPhysicsConstants() {
    preferences.begin("mural-phys", false);
    diameter = preferences.getDouble("diameter", default_diameter);
    homedStepOffsetMM = preferences.getDouble("homeOffsetMM", default_homedStepOffsetMM);
    mass_bot = preferences.getDouble("massBot", default_mass_bot);
    belt_elongation_coefficient = preferences.getDouble("beltElong", default_belt_elongation_coefficient);
    preferences.end();

    recomputeDerivedPhysicsConstants();
}

void Movement::recomputeDerivedPhysicsConstants() {
    circumference = diameter * PI;
    homedStepsOffset = int((homedStepOffsetMM / circumference) * stepsPerRotation);
}

Kinematics::PhysicsParams Movement::getPhysicsParams() const {
    Kinematics::PhysicsParams params;
    params.d_t = d_t;
    params.d_p = d_p;
    params.d_m = d_m;
    params.mass_bot = mass_bot;
    params.g_constant = g_constant;
    params.belt_elongation_coefficient = belt_elongation_coefficient;
    params.midPulleyToWall = midPulleyToWall;
    return params;
}

double Movement::getMassBot() {
    return mass_bot;
}

double Movement::getBeltElongationCoefficient() {
    return belt_elongation_coefficient;
}

double Movement::getEffectiveDiameter() {
    return diameter;
}

double Movement::getHomedStepOffsetMM() {
    return homedStepOffsetMM;
}

void Movement::setMassBot(double value) {
    mass_bot = value;
    preferences.begin("mural-phys", false);
    preferences.putDouble("massBot", value);
    preferences.end();
}

void Movement::setBeltElongationCoefficient(double value) {
    belt_elongation_coefficient = value;
    preferences.begin("mural-phys", false);
    preferences.putDouble("beltElong", value);
    preferences.end();
}

void Movement::setEffectiveDiameter(double value) {
    diameter = value;
    recomputeDerivedPhysicsConstants();
    preferences.begin("mural-phys", false);
    preferences.putDouble("diameter", value);
    preferences.end();
}

void Movement::setHomedStepOffsetMM(double value) {
    homedStepOffsetMM = value;
    recomputeDerivedPhysicsConstants();
    preferences.begin("mural-phys", false);
    preferences.putDouble("homeOffsetMM", value);
    preferences.end();
}

// Hooks into the existing E-steps calibration flow (see extend1000mm()): given how far
// the bot actually traveled (measured by the user) for the commanded step count, backs
// out and persists a corrected effective pulley diameter.
bool Movement::calibrateEffectiveDiameterFromMeasurement(double measuredDistanceMM, double& correctedDiameter) {
    if (lastEstepsCalibrationSteps <= 0 || measuredDistanceMM <= 0) {
        Serial.println("No calibration extension has been performed yet");
        return false;
    }

    const double correctedCircumference = (measuredDistanceMM * stepsPerRotation) / lastEstepsCalibrationSteps;
    correctedDiameter = correctedCircumference / PI;
    setEffectiveDiameter(correctedDiameter);
    return true;
}

#ifdef MURAL_TMC_UART
// UNTESTED ON HARDWARE: configure both TMC2209 drivers over the shared UART.
// See docs/tmc-uart.md for wiring and for how to safely validate this on the
// bench before trusting it for homing/stall-monitoring.
void Movement::setupTmcDrivers() {
    tmcSerial.begin(MURAL_TMC_UART_BAUD, SERIAL_8N1, MURAL_TMC_UART_RX_PIN, MURAL_TMC_UART_TX_PIN);

    leftDriver = new TMC2209Stepper(&tmcSerial, TMC_R_SENSE, LEFT_TMC_ADDRESS);
    rightDriver = new TMC2209Stepper(&tmcSerial, TMC_R_SENSE, RIGHT_TMC_ADDRESS);

    leftDriver->begin();
    rightDriver->begin();

    leftDriver->toff(4);
    rightDriver->toff(4);

    leftDriver->rms_current(TMC_RUN_CURRENT_MA);
    rightDriver->rms_current(TMC_RUN_CURRENT_MA);

    // Microstepping is set via UART here (MS1/MS2 are repurposed as the UART
    // address straps in this mode), and must match stepsPerRotation above.
    leftDriver->microsteps(8);
    rightDriver->microsteps(8);

    // SpreadCycle (not StealthChop) for reliable StallGuard/DIAG stall
    // detection. This is louder than StealthChop; once StallGuard behavior is
    // validated on real hardware it's reasonable to explore StealthChop +
    // pwm_autoscale-based stall detection instead if quieter running matters
    // more than detection reliability.
    leftDriver->en_spreadCycle(true);
    rightDriver->en_spreadCycle(true);
    leftDriver->pwm_autoscale(false);
    rightDriver->pwm_autoscale(false);

    leftDriver->TCOOLTHRS(TMC_TCOOLTHRS);
    rightDriver->TCOOLTHRS(TMC_TCOOLTHRS);
    leftDriver->SGTHRS(TMC_SGTHRS);
    rightDriver->SGTHRS(TMC_SGTHRS);

    pinMode(LEFT_DIAG_PIN, INPUT);
    pinMode(RIGHT_DIAG_PIN, INPUT);
}

// UNTESTED ON HARDWARE: true if either driver's DIAG pin currently reports a
// stall/error condition.
bool Movement::checkStallGuard() {
    return digitalRead(LEFT_DIAG_PIN) == HIGH || digitalRead(RIGHT_DIAG_PIN) == HIGH;
}

bool Movement::isStalled() {
    return stalled;
}

void Movement::clearStall() {
    stalled = false;
}
#endif

void Movement::setTopDistance(const int distance) {
    Serial.printf("Top distance set to %d\n", distance);
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
    positionKnown = true;

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

#ifdef MURAL_TMC_UART
    if (dir != 0) {
        // A freshly-commanded move supersedes any previous stall.
        stalled = false;
    }
#endif
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

#ifdef MURAL_TMC_UART
    if (dir != 0) {
        // A freshly-commanded move supersedes any previous stall.
        stalled = false;
    }
#endif
    moving = true;
};

Movement::Point Movement::getHomeCoordinates() {
    if (topDistance == -1) {
        return Point(0, 0);
    }

    return Point(width / 2, HOME_Y_OFFSET_MM);
}

bool Movement::extendToPoint(double x, double y, int& moveTime)
{
    setOrigin();

    startedHoming = true;
    float moveTimeF;
    if (!beginLinearTravel(x, y, moveSpeedSteps, moveTimeF)) {
        return false;
    }
    moveTime = int(ceil(moveTimeF));
    return true;
};

bool Movement::extendToHome(int& moveTime)
{
    auto homeCoordinates = getHomeCoordinates();
    return extendToPoint(homeCoordinates.x, homeCoordinates.y, moveTime);
};

void Movement::runSteppers()
{
    if (moving)
    {
#ifdef MURAL_TMC_UART
        // UNTESTED ON HARDWARE: stop feeding step pulses the moment either
        // driver reports a stall, instead of continuing to command motion
        // into whatever is blocking the belt (which would just desync
        // AccelStepper's step count from reality). RetractBeltsPhase relies
        // on this to detect the end of StallGuard homing; Runner relies on
        // it to pause the current job if a stall happens mid-drawing.
        if (checkStallGuard()) {
            leftMotor->setSpeed(0);
            rightMotor->setSpeed(0);
            moving = false;
            stalled = true;
            return;
        }
#endif
        leftMotor->runSpeedToPosition();
        rightMotor->runSpeedToPosition();

        if (leftMotor->distanceToGo() == 0 && rightMotor->distanceToGo() == 0)
        {
            moving = false;
        }
    }
};

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

    constexpr int solver_max_iterations = 20;       // Maximum number of outer loop iterations of the solver.
    constexpr double gamma_delta_termination = 0.01 / 180.0 * PI; // [rad] Outer loop of solver will stop if last update is smaller than this.
                                                                  // The inner solver (Kinematics::solveTorqueEquilibrium) now converges to
                                                                  // ~0.01 degree via root-finding rather than a coarse grid search, so this
                                                                  // outer threshold can be tightened accordingly without costing extra
                                                                  // iterations in practice.

    const Kinematics::BeltLengthsResult result = Kinematics::computeBeltLengths(
        frameX, frameY, topDistance, gamma_last_position, getPhysicsParams(),
        gamma_delta_termination, solver_max_iterations);

    gamma_last_position = result.gamma;

    const long leftLegSteps = lround((result.leftLeg / circumference) * stepsPerRotation);
    const long rightLegSteps = lround((result.rightLeg / circumference) * stepsPerRotation);

    return Lengths(leftLegSteps, rightLegSteps);
}

bool Movement::beginLinearTravel(double x, double y, int speed, float& moveTime)
{
#ifdef MURAL_TMC_UART
    // A freshly-commanded move supersedes any previous stall.
    stalled = false;
#endif
    if (topDistance == -1 || !homed) {
        Serial.println("Not ready");
        return false;
    }

    if (x < 0 || (x - 1) > width)
    {
        Serial.println("Invalid x");
        return false;
    }

    if (y < 0)
    {
        Serial.println("Invalid y");
        return false;
    }

    auto lengths = getBeltLengths(x, y);
    auto leftLegSteps = lengths.left;
    auto rightLegSteps = lengths.right;

    long deltaLeft = abs(abs(leftMotor->currentPosition()) - (long)leftLegSteps);
    long deltaRight = abs(abs(rightMotor->currentPosition()) - (long)rightLegSteps);

    float leftSpeed, rightSpeed;
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

    leftMotor->moveTo(leftLegSteps);
    leftMotor->setSpeed(leftSpeed);

    rightMotor->moveTo(rightLegSteps);
    rightMotor->setSpeed(rightSpeed);

    X = x;
    Y = y;
    positionKnown = true;

    moving = true;
    return true;
};

bool Movement::getWidth(double& width) {
    if (topDistance == -1) {
        return false;
    }
    width = this->width;
    return true;
}

bool Movement::getCoordinates(Point& point) {
    if (!positionKnown) {
        Serial.println("Not ready to get coordinates");
        return false;
    }

    if (moving) {
        Serial.println("Can't get coordinates while moving");
        return false;
    }
    point = Movement::Point(X, Y);
    return true;
}

void Movement::extend1000mm() {
    const int steps = int((1000 / circumference) * stepsPerRotation);
    lastEstepsCalibrationSteps = steps; // remembered so a later measured-distance can be turned back into diameter.

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
