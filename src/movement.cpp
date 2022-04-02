#include <Coordinates.h>
#include <TinyStepper_28BYJ_48.h>
#include <cppQueue.h>

TinyStepper_28BYJ_48 leftMotor;
TinyStepper_28BYJ_48 rightMotor;

void setupMovement() {
    leftMotor.connectToPins(27, 14, 12, 13);
    rightMotor.connectToPins(26, 25, 33, 32);   
}

void setOrigin() {
    leftMotor.setCurrentPositionInSteps(0);
    rightMotor.setCurrentPositionInSteps(0);
}

bool moving = false;
const auto maxSpeedSteps = 300;
const auto acceleration = 500000;

const auto maxUnsafeSpeed = 400;

const auto INFINITE_STEPS = 999999999;
void leftStepper(int dir) {
    leftMotor.setSpeedInStepsPerSecond(maxUnsafeSpeed);
    leftMotor.setAccelerationInStepsPerSecondPerSecond(acceleration);

    if (dir > 0) {
        leftMotor.setupRelativeMoveInSteps(INFINITE_STEPS);
    } else if (dir < 0) {
        leftMotor.setupRelativeMoveInSteps(-INFINITE_STEPS);
    } else {
        leftMotor.setupStop();
    }

    moving = true;
}

void rightStepper(int dir) {
    rightMotor.setSpeedInStepsPerSecond(maxUnsafeSpeed);
    rightMotor.setAccelerationInStepsPerSecondPerSecond(acceleration);

    if (dir > 0) {
        rightMotor.setupRelativeMoveInSteps(-INFINITE_STEPS);
    } else if (dir < 0) {
        rightMotor.setupRelativeMoveInSteps(INFINITE_STEPS);
    } else {
        rightMotor.setupStop();
    }

    moving = true;
}

const int homeDistanceMM = 750;
const int stepsPerRotation = 4076 / 2;
const auto diameterMM = 13.5;
const auto circumference = diameterMM * PI;
const auto extendSteps = long((homeDistanceMM / circumference) * stepsPerRotation);


const auto topSpacingSteps = long((1219 / circumference) * stepsPerRotation);
const auto bottomSpacingSteps = long((36.5 / circumference) * stepsPerRotation);

const auto hangerLengthSteps = long((22 / circumference) * stepsPerRotation);
struct Position
{
    Coordinates left;
    Coordinates right;
};


Position getCoordinates() {
    // everything is in steps
    auto leftLength = leftMotor.getCurrentPositionInSteps();
    auto rightLength = -rightMotor.getCurrentPositionInSteps();
    
    //https://www-formula.com/geometry/trapezoid/height
    auto numerator = pow(topSpacingSteps - bottomSpacingSteps, 2) + pow(leftLength, 2) - pow(rightLength, 2);
    auto denominator = 2*(topSpacingSteps - bottomSpacingSteps);
    auto squared = pow(numerator / denominator, 2);
    auto diff = pow(leftLength, 2) - squared;
    auto height = sqrt(diff);

    auto leftAngle = asin(height / leftLength);
    auto rightAngle = asin(height / rightLength);

    Coordinates left = Coordinates();
    left.fromPolar(leftLength, leftAngle);
    
    Coordinates right = Coordinates();
    right.fromPolar(rightLength, rightAngle);

    return {left, right};
}

void (*nextMoveFunc)();


void extendToHome() {
    setOrigin();

    Serial.printf("Position after setOrigin(): (%ld, %ld)\n", leftMotor.getCurrentPositionInSteps(), rightMotor.getCurrentPositionInSteps());

    leftMotor.setSpeedInStepsPerSecond(maxSpeedSteps);
    rightMotor.setSpeedInStepsPerSecond(maxSpeedSteps);

    leftMotor.setAccelerationInStepsPerSecondPerSecond(acceleration);
    rightMotor.setAccelerationInStepsPerSecondPerSecond(acceleration);

    leftMotor.setupMoveInSteps(extendSteps);
    rightMotor.setupMoveInSteps(-extendSteps);
    moving = true;
    nextMoveFunc = NULL;
}

void home() {
    nextMoveFunc = &extendToHome;
}

void runSteppers() {
    if (moving) {
        leftMotor.processMovement();
        rightMotor.processMovement();

        if (leftMotor.motionComplete() && rightMotor.motionComplete()) {
            moving = false;
            Serial.printf("Motion complete. Left steps: %ld, Right steps: %ld\n", leftMotor.getCurrentPositionInSteps(), rightMotor.getCurrentPositionInSteps());
        }
    } else {
        if (nextMoveFunc != NULL) {
            nextMoveFunc();
        }
    }
}

void setupRelativeMove(int x, int y) {
    auto xSteps = long((x / circumference) * stepsPerRotation);
    auto ySteps = long((y / circumference) * stepsPerRotation);

    auto currentPosition = getCoordinates();
    Coordinates targetLeft = Coordinates();
    targetLeft.fromCartesian(currentPosition.left.getX() + xSteps, currentPosition.left.getY() + ySteps);
    Coordinates targetRight = Coordinates();
    targetRight.fromCartesian(currentPosition.right.getX() - xSteps, currentPosition.right.getY() + ySteps);
    
    auto currentLeftLength = currentPosition.left.getR();
    auto currentRightLength = currentPosition.right.getR();

    auto targetLeftLength = targetLeft.getR();
    auto targetRightLength = targetRight.getR();

    auto deltaLeft = targetLeftLength - currentLeftLength;
    auto deltaRight = targetRightLength - currentRightLength;

    Serial.printf("\n=================\nNew relative move (%i, %i)\n\n", x, y);
    Serial.printf("\nCurrent\nLeft %f\nRight %f\n", currentLeftLength, currentRightLength);
    Serial.printf("\nTarget\nLeft %f \nRight %f\n", targetLeftLength, targetRightLength);

    int leftSpeed, rightSpeed;
    if (abs(deltaLeft) >= abs(deltaRight)) {
        leftSpeed = maxSpeedSteps;
        auto moveTime = abs(double(deltaLeft)) / leftSpeed;
        rightSpeed = int(abs(deltaRight) / moveTime);
    } else {
        rightSpeed = maxSpeedSteps;
        auto moveTime = abs(double(deltaRight) / rightSpeed);
        leftSpeed = int(abs(deltaLeft) / moveTime);
    }

    Serial.printf("\nMove\nLeft speed: %i (%f)\nRight speed: %i (%f)\n=================\n", leftSpeed, deltaLeft, rightSpeed, deltaRight);

    leftMotor.setSpeedInStepsPerSecond(leftSpeed);
    rightMotor.setSpeedInStepsPerSecond(rightSpeed);

    leftMotor.setupRelativeMoveInSteps(deltaLeft);
    rightMotor.setupRelativeMoveInSteps(-deltaRight);
    
    moving = true;
}

const auto squareSizeMM = 100;
void drawSquareLeftSide() {
    setupRelativeMove(0, -squareSizeMM);
    nextMoveFunc = NULL;
}

void drawSquareBottom() {
    setupRelativeMove(-squareSizeMM, 0);
    nextMoveFunc = &drawSquareLeftSide;
}

void drawSquareRightSide() {
    setupRelativeMove(0, squareSizeMM);
    nextMoveFunc = &drawSquareBottom;
}


void startDrawSquare() {
    setupRelativeMove(squareSizeMM, 0);
    nextMoveFunc = &drawSquareRightSide;
}

