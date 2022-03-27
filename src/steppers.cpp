#include <CheapStepper.h>
#include <Coordinates.h>

CheapStepper leftMotor (27, 14, 12, 13);
CheapStepper rightMotor (26, 25, 33, 32);

const int INFINITE_STEPS = 999999999;

const int MAX_RPM = 8;
void initSteppers() {
    leftMotor.set4076StepMode();
    rightMotor.set4076StepMode();
    leftMotor.setRpm(MAX_RPM); 
    rightMotor.setRpm(MAX_RPM); 
}

const auto extendDistanceMM = 750;
const auto diameterMM = 13.5;
const auto circumference = diameterMM * PI;
const auto extendRotations = extendDistanceMM / circumference;

void leftStepper(int direction) {
    if (direction == 1) {
        leftMotor.newMoveCW(INFINITE_STEPS);
    } else if (direction == -1) {
        leftMotor.newMoveCCW(INFINITE_STEPS);
    } else {
        leftMotor.stop();
    }
}

void moveLeftStepper(int distanceMM) {
    bool reverse = false;
    if (distanceMM < 0) {
        reverse = true;
    }

    distanceMM = abs(distanceMM);
    auto rotations = distanceMM / circumference;
    auto steps = int(4076 * rotations);
    if (reverse) {
        leftMotor.newMoveCCW(steps);
    } else {
        leftMotor.newMoveCW(steps);
    }
}

void moveRightStepper(int distanceMM) {
    bool reverse = false;
    if (distanceMM < 0) {
        reverse = true;
    }

    distanceMM = abs(distanceMM);
    auto rotations = distanceMM / circumference;
    auto steps = int(4076 * rotations);
    if (reverse) {
        rightMotor.newMoveCW(steps);
    } else {
        rightMotor.newMoveCCW(steps);
    }
}

void rightStepper(int direction) {
    if (direction == 1) {
        rightMotor.newMoveCCW(INFINITE_STEPS);
    } else if (direction == -1) {
        rightMotor.newMoveCW(INFINITE_STEPS);
    } else {
        rightMotor.stop();
    }
}

void moveSteppers() {
    leftMotor.run();
    rightMotor.run();
}



void run1() {
    auto totalSteps = int(4076 * extendRotations);
    leftMotor.newMoveCW(totalSteps);
    rightMotor.newMoveCCW(totalSteps);
}

// const auto retractDistanceMM = 100;
// const auto retractRotations = retractDistanceMM / circumference;
// void run2() {
//     int leftLength = extendDistanceMM;
//     int rightLength = extendDistanceMM;

//     int squareSizeMM = 50;

//     auto totalSteps = int(4076 * retractRotations);
//     leftMotor.newMoveCCW(totalSteps);
//     rightMotor.newMoveCW(totalSteps);
// }

const auto topSpacingMM = 1219;
const auto motorSpacingMM = 36.5;
Coordinates left = Coordinates();
Coordinates right = Coordinates();
bool beganMovement = false;
void run2() {
    auto leftLength = extendDistanceMM;
    auto leftAngle = asin(((topSpacingMM - motorSpacingMM) / 2) / leftLength);

    auto rightLength = extendDistanceMM;
    auto rightAngle = 360 - asin(((topSpacingMM - motorSpacingMM) / 2) / rightLength);

    left.fromPolar(leftLength, leftAngle);
    right.fromPolar(rightLength, rightAngle);

    auto horizontalMoveMM = 50;

    auto targetLeft = Coordinates(left.getX() + horizontalMoveMM, left.getY());
    auto targetLeftLength = targetLeft.getR();

    auto targetRight = Coordinates(right.getX() + horizontalMoveMM, right.getY());
    auto targetRightLength = targetRight.getR();

    auto deltaLeftLength = abs(targetLeftLength - leftLength);
    auto deltaRightLength = abs(targetRightLength - rightLength);

    float leftRPM;
    float rightRPM;
    if (deltaLeftLength >= deltaRightLength) {
        leftRPM = MAX_RPM;
        rightRPM = deltaRightLength / deltaLeftLength * MAX_RPM;
    } else {
        rightRPM = MAX_RPM;
        leftRPM = deltaLeftLength / deltaRightLength * MAX_RPM;
    }

    leftMotor.setRpm(leftRPM);
    rightMotor.setRpm(rightRPM);

    moveLeftStepper(targetLeftLength - leftLength);
    moveRightStepper(targetRightLength - rightLength);
    beganMovement = true;
}