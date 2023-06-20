#ifndef Movement_h
#define Movement_h
#include "Arduino.h" 
#include <TinyStepper_28BYJ_48.h>
#include "display.h"
const auto printSpeedSteps = 250;
const auto maxUnsafeSpeed = 400;
const auto INFINITE_STEPS = 999999999;
const auto acceleration = 500000; //essentially infinite
const int stepsPerRotation = 4076 / 2;
const auto diameter = 12.65;
const auto circumference = diameter * PI;
const auto bottomDistance = 85.6;
const auto safeYFraction = 0.2;
const auto safeXFraction = 0.2;

const auto LEFT_MOTOR_PIN_1 = 27;
const auto LEFT_MOTOR_PIN_2 = 14;
const auto LEFT_MOTOR_PIN_3 = 12;
const auto LEFT_MOTOR_PIN_4 = 13;

const auto RIGHT_MOTOR_PIN_1 = 26;
const auto RIGHT_MOTOR_PIN_2 = 25;
const auto RIGHT_MOTOR_PIN_3 = 33;
const auto RIGHT_MOTOR_PIN_4 = 32;

const auto sleepAfterMove = int(ceil(double(1) / printSpeedSteps * 1000)) * 3;

const auto homedStepOffsetMM = 22;
const int homedStepsOffset = int((homedStepOffsetMM / circumference) * stepsPerRotation);



class Movement{
private:
int topDistance;
double minSafeY;
double minSafeXOffset;
double height;
double width;
volatile bool moving;
bool homed;
double X = -1;
double Y = -1;
TinyStepper_28BYJ_48 *leftMotor;
TinyStepper_28BYJ_48 *rightMotor;
Display *display;
void setOrigin();

struct Lengths {
    int left;
    int right;
    Lengths(int left, int right) {
        this->left = left;
        this->right = right;
    }
    Lengths() {

    }
};

Lengths getBeltLengths(double x, double y);
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


static double distanceBetweenPoints(Point point1, Point point2) {
    return sqrt(pow(point2.x - point1.x, 2) + pow(point2.y - point1.y, 2));
}

Point getCoordinates();
void setTopDistance(int distance);
void resumeTopDistance(int distance);
void leftStepper(int dir);
void rightStepper(int dir);
void extendToHome();
void runSteppers();
void beginLinearTravel(double x, double y);
void extend100mm();
Point getHomeCoordinates();
};
#endif