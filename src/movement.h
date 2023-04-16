#ifndef Movement_h
#define Movement_h
#include "Arduino.h" 
#include <AccelStepper.h>
#include "display.h"
const auto printSpeedSteps = 600;
const auto maxUnsafeSpeed = 800;
const auto INFINITE_STEPS = 999999999;
const auto acceleration = 500000; //essentially infinite
const int stepsPerRotation = 4076;
const auto diameter = 12.8;
const auto circumference = diameter * PI;
const auto bottomDistance = 48;
const auto safeYFraction = 0.2;
const auto safeXFraction = 0.1;

const auto LEFT_MOTOR_PIN_1 = 27;
const auto LEFT_MOTOR_PIN_2 = 14;
const auto LEFT_MOTOR_PIN_3 = 12;
const auto LEFT_MOTOR_PIN_4 = 13;

const auto RIGHT_MOTOR_PIN_1 = 26;
const auto RIGHT_MOTOR_PIN_2 = 25;
const auto RIGHT_MOTOR_PIN_3 = 33;
const auto RIGHT_MOTOR_PIN_4 = 32;

const auto sleepPerStep = int(ceil(double(1) / printSpeedSteps * 1000));

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
double X = -1;
double Y = -1;
AccelStepper *leftMotor;
AccelStepper *rightMotor;
Display *display;
void setOrigin();
public:
Movement(Display *display);
bool isMoving() {
    return moving;
}
double getWidth();
double getHeight();
struct Point {
    double x;
    double y;
    Point(double x, double y) {
        this->x = x;
        this->y = y;
    }
    Point() {
        
    }
};
Point getCoordinates();
void setTopDistance(int distance);
void leftStepper(int dir);
void rightStepper(int dir);
void extendToHome();
void runSteppers();
void beginLinearTravel(double x, double y);
void extend100mm();
};
#endif