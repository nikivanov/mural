#ifndef Movement_h
#define Movement_h

#include "AccelStepper.h"
#include "Arduino.h" 
#include "display.h"

constexpr int printSpeedSteps = 500;
constexpr int  moveSpeedSteps = 1500;
constexpr long INFINITE_STEPS = 999999999;
constexpr long acceleration = 999999999; //essentially infinite, causing instant stop / start
constexpr int stepsPerRotation = 200 * 8; // 1/8 microstepping

// Effective diameter of the pulley+belts. Use EStep calibration to refine this value.
constexpr double diameter = 12.69;
const double circumference = diameter * PI;

// What is this? The inner distance between the pulleys? For me it's 
// more like 70.0 to 72.00mm (if measuring the point distance of belts touching pulleys.)
constexpr double bottomDistance = 67.4; 
constexpr double midPulleyToWall = 41.0;
constexpr double safeYFraction = 0.2;     // Top Margin: Image top to topDistance line.
constexpr double safeXFraction = 0.2;     // Left and right margin: from draw area boundaries to line from each pin straight down.

constexpr int LEFT_STEP_PIN = 13;
constexpr int LEFT_DIR_PIN = 12;
constexpr int LEFT_ENABLE_PIN = 14;

constexpr int RIGHT_STEP_PIN = 27;
constexpr int RIGHT_DIR_PIN = 26;
constexpr int RIGHT_ENABLE_PIN = 25;


// Length of fully retracted belt hitting stop screw. Measured from outer edge of screw to the point
// of tangency between belt and pulley.
constexpr float homedStepOffsetMM = 40.0;
const int homedStepsOffset = int((homedStepOffsetMM / circumference) * stepsPerRotation);



class Movement{
private:
int topDistance;
double minSafeY;
double minSafeXOffset;
double width;
volatile bool moving;
bool homed;
double X = -1;
double Y = -1;
bool startedHoming;
AccelStepper *leftMotor;
AccelStepper *rightMotor;
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

const int HOME_Y_OFFSET = 350;

static double distanceBetweenPoints(Point point1, Point point2) {
    return sqrt(pow(point2.x - point1.x, 2) + pow(point2.y - point1.y, 2));
}

bool isMoving();
bool hasStartedHoming();
double getWidth();
Point getCoordinates();
void setTopDistance(int distance);
void resumeTopDistance(int distance);
int getTopDistance();
void leftStepper(int dir);
void rightStepper(int dir);
int extendToHome();
void runSteppers();
float beginLinearTravel(double x, double y, int speed);

// Used for calibration of the esteps.
void extend1000mm(); 

Point getHomeCoordinates();
void disableMotors();
};
#endif