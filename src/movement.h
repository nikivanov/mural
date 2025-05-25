#ifndef Movement_h
#define Movement_h

#include "AccelStepper.h"
#include "Arduino.h" 
#include "display.h"

// Motor driver parameters.
constexpr int printSpeedSteps = 500;
constexpr int  moveSpeedSteps = 1500;
constexpr long INFINITE_STEPS = 999999999;
constexpr long acceleration = 999999999;    // Essentially infinite, causing instant stop / start.
constexpr int stepsPerRotation = 200 * 8;   // 1/8 microstepping

// Geometry parameters:
// Effective diameter of the pulley+belts. Use EStep calibration to refine this value.
constexpr double diameter = 12.69;
const double circumference = diameter * PI;
constexpr double bottomDistance = 67.4;
constexpr double midPulleyToWall = 41.0;    // (Height) distance from mid of pulley to wall [mm].
constexpr float homedStepOffsetMM = 40.0;   // Length of fully retracted belt hitting stop screw.
                                            // Measured from outer edge of screw to the point
                                            // of tangency between belt and pulley. [mm]
const int homedStepsOffset = int((homedStepOffsetMM / circumference) * stepsPerRotation);
const int HOME_Y_OFFSET_MM = 350;   // Y coordinate of mural home position in image coordinate system [mm].


// Margins used for transformations of the coordinate systems:
constexpr double safeYFraction = 0.2;       // Top margin: Image top to topDistance line.
constexpr double safeXFraction = 0.2;       // Left and right margin: From draw area boundaries to line from each pin straight down.

// ESP setup:
constexpr int LEFT_STEP_PIN = 13;
constexpr int LEFT_DIR_PIN = 12;
constexpr int LEFT_ENABLE_PIN = 14;

constexpr int RIGHT_STEP_PIN = 27;
constexpr int RIGHT_DIR_PIN = 26;
constexpr int RIGHT_ENABLE_PIN = 25;

class Movement{
private:
    int topDistance;            // Distance between pins (d_pins) [mm].
    double minSafeY;
    double minSafeXOffset;
    double width;               // width of the drawing area [mm]
    volatile bool moving;
    bool homed;
    double X = -1;              // Location of Pen in x [mm].
    double Y = -1;              // Location of Pen in y [mm].
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