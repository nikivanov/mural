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
const int stepsPerRotation = 2048;
const auto diameterMM = 13.5;
const auto circumference = diameterMM * PI;
const auto extendRotations = homeDistanceMM / circumference;


const auto topSpacingMM = 1219;
const auto motorSpacingMM = 36.5;

const auto hangerLengthMM = 22;
struct Position
{
    Coordinates left;
    Coordinates right;
};


Position getCoordinates() {
    auto leftLengthMM = (leftMotor.getCurrentPositionInSteps() / stepsPerRotation) * circumference + hangerLengthMM;
    auto rightLengthMM = (-rightMotor.getCurrentPositionInSteps() / stepsPerRotation) * circumference + hangerLengthMM;

    //Serial.printf("Getting coordinates, left length: %f, right length: %f\n", leftLengthMM, rightLengthMM);
    
    //https://www-formula.com/geometry/trapezoid/height
    auto numerator = pow(topSpacingMM - motorSpacingMM, 2) + pow(leftLengthMM, 2) - pow(rightLengthMM, 2);
    auto denominator = 2*(topSpacingMM - motorSpacingMM);
    auto squared = pow(numerator / denominator, 2);
    auto diff = pow(leftLengthMM, 2) - squared;
    auto height = sqrt(diff);

    auto leftAngle = asin(height / leftLengthMM);
    auto rightAngle = asin(height / rightLengthMM);

    Coordinates left = Coordinates();
    left.fromPolar(leftLengthMM, leftAngle);
    
    Coordinates right = Coordinates();
    right.fromPolar(rightLengthMM, rightAngle);

    return {left, right};
}

void (*nextMoveFunc)();


void extendToHome() {
    setOrigin();

    Serial.printf("Position after setOrigin(): (%ld, %ld)", leftMotor.getCurrentPositionInSteps(), rightMotor.getCurrentPositionInSteps());

    leftMotor.setSpeedInStepsPerSecond(maxSpeedSteps);
    rightMotor.setSpeedInStepsPerSecond(maxSpeedSteps);

    leftMotor.setAccelerationInStepsPerSecondPerSecond(acceleration);
    rightMotor.setAccelerationInStepsPerSecondPerSecond(acceleration);

    auto leftSteps = long(extendRotations * stepsPerRotation);
    auto rightSteps = long(extendRotations * stepsPerRotation);

    leftMotor.setupMoveInSteps(leftSteps);
    rightMotor.setupMoveInSteps(-rightSteps);
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
            Serial.printf("Motion complete. Left steps: %ld, Right steps: %ld", leftMotor.getCurrentPositionInSteps(), rightMotor.getCurrentPositionInSteps());
        }
    } else {
        if (nextMoveFunc != NULL) {
            nextMoveFunc();
        }
    }
}

void setupRelativeMove(int x, int y) {
    auto currentPosition = getCoordinates();
    Coordinates targetLeft = Coordinates();
    targetLeft.fromCartesian(currentPosition.left.getX() + x, currentPosition.left.getY() + y);
    Coordinates targetRight = Coordinates();
    targetRight.fromCartesian(currentPosition.right.getX() - x, currentPosition.right.getY() + y);
    
    auto currentLeftLength = currentPosition.left.getR();
    auto currentRightLength = currentPosition.right.getR();

    auto targetLeftLength = targetLeft.getR();
    auto targetRightLength = targetRight.getR();

    auto deltaLeft = targetLeftLength - currentLeftLength;
    auto deltaRight = targetRightLength - currentRightLength;

    auto deltaLeftSteps = long((deltaLeft / circumference) * stepsPerRotation);
    auto deltaRightSteps = long((deltaRight / circumference) * stepsPerRotation);
    Serial.printf("\n=================\nNew relative move (%i, %i)\n\n", x, y);
    Serial.printf("\nCurrent\nLeft %f (%f, %f)\nRight %f (%f, %f)\n", currentLeftLength, currentPosition.left.getX(), currentPosition.left.getY(), currentRightLength, currentPosition.right.getX(), currentPosition.right.getY());
    Serial.printf("\nTarget\nLeft %f (%f, %f)\nRight %f (%f, %f)\n", targetLeftLength, targetLeft.getX(), targetLeft.getY(), targetRightLength, targetRight.getX(), targetRight.getY());

    int leftSpeed, rightSpeed;
    if (abs(deltaLeftSteps) >= abs(deltaRightSteps)) {
        leftSpeed = maxSpeedSteps;
        auto moveTime = abs(double(deltaLeftSteps)) / leftSpeed;
        rightSpeed = int(abs(deltaRightSteps) / moveTime);
    } else {
        rightSpeed = maxSpeedSteps;
        auto moveTime = abs(double(deltaRightSteps) / rightSpeed);
        leftSpeed = int(abs(deltaLeftSteps) / moveTime);
    }

    Serial.printf("\nMove\nLeft speed: %i (%ld)\nRight speed: %i (%ld)\n=================\n", leftSpeed, deltaLeftSteps, rightSpeed, deltaRightSteps);

    leftMotor.setSpeedInStepsPerSecond(leftSpeed);
    rightMotor.setSpeedInStepsPerSecond(rightSpeed);

    leftMotor.setupRelativeMoveInSteps(deltaLeftSteps);
    rightMotor.setupRelativeMoveInSteps(-deltaRightSteps);
    
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

