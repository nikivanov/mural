#ifndef Movement_h
#define Movement_h
#include "Arduino.h" 
#include <TinyStepper_28BYJ_48.h>
const auto maxSpeedSteps = 300;
const auto acceleration = 500000;
const auto maxUnsafeSpeed = 500;
const auto INFINITE_STEPS = 999999999;
const int stepsPerRotation = 4076 / 2;
const auto diameter = 12.8;
const auto circumference = diameter * PI;
const auto bottomDistance = 48;
const auto safeYFraction = 0.2;
const auto safeXFraction = 0.1;

const auto homedStepOffsetMM = 0;
const int homedStepsOffset = int((homedStepOffsetMM / circumference) * stepsPerRotation);

class Movement{
private:
int topDistance;
double minSafeY;
double minSafeXOffset;
double height;
double width;
bool moving;
bool homed;
int X;
int Y;
TinyStepper_28BYJ_48 *leftMotor;
TinyStepper_28BYJ_48 *rightMotor;
void setOrigin();
public:
Movement();
bool isMoving() {
    return moving;
}
double getWidth();
double getHeight();
void setTopDistance(int distance);
void leftStepper(int dir);
void rightStepper(int dir);
void extendToHome();
void runSteppers();
void beginTravel(double x, double y);
};
#endif