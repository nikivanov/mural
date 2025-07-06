#ifndef Movement_h
#define Movement_h

#include "AccelStepper.h"
#include "Arduino.h" 
#include "display.h"

// Motor driver parameters.
constexpr int printSpeedSteps = 500;
constexpr int  moveSpeedSteps = 1500;
constexpr long INFINITE_STEPS = 999999999;
constexpr long acceleration = 999999999;  // Essentially infinite, causing instant stop / start
constexpr int stepsPerRotation = 200 * 8; // 1/8 microstepping

// Geometry parameters:
// Effective diameter of the pulley+belts. Use EStep calibration to refine this value.
constexpr double diameter = 12.69;          // [mm]
const double circumference = diameter * PI; // [mm]
constexpr double midPulleyToWall = 41.0;    // (Height) distance from mid of pulley to wall [mm].
constexpr float homedStepOffsetMM = 40.0;   // Length of fully retracted belt hitting stop screw.
                                            // Measured from outer edge of screw to the point
                                            // of tangency between belt and pulley. [mm]
const int homedStepsOffset = int((homedStepOffsetMM / circumference) * stepsPerRotation);
constexpr double mass_bot = 0.55;   // Mass of the mural bot [kg].
constexpr double g_constant = 9.81; // Earth's gravitational acceleration constant [m/s^2]. Please adjust when running Mural on other planets!
constexpr double d_t = 76.027;      // [mm] Distance of tangent points, where belts touch the pulleys.
                                    // Calculated as (axis distance) 85.00 - (diameter) 12.69/sqrt(2).
constexpr double d_p = 4.4866;      // [mm] distance from Q to center of pen. Calculated as diameter/(2 * sqrt(2)).
constexpr double d_m = 10.0 + d_p;  // [mm] Distance from line connecting tangent points to center of mass of bot (projected onto wall plane).
                                    // The point where d_m and d_t meet shall be called Q.
                                    // The center of mass sits roughly at the bottom of the pen opening.
constexpr double belt_elongation_coefficient = 5e-5; // [m/N] elongation of the belts under force.
const int HOME_Y_OFFSET_MM = 350;   // Y coordinate of mural home position in image coordinate system [mm].


// Margins used for transformations of the coordinate systems:
constexpr double safeYFraction = 0.2;           // Top Margin: Image top to topDistance line.
constexpr double safeXFraction = 0.2;           // Left and right margin: from draw area boundaries to line from each pin straight down.

// Variables used for debugging:
// constexpr int sleepDurationAfterMove_ms = 0;    // Delay after linear movement [ms], e.g. 50.

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

    double gamma_last_position = 0.0;   // [rad] The last known inclination of the mural bot. As the angle changes only slowly 
                                        // with position we can compute updates faster by keeping track of the last solution.
    inline void getLeftTangentPoint(const double frameX, const double frameY, const double gamma, double& x_PL, double& y_PL) const;
    inline void getRightTangentPoint(const double frameX, const double frameY, const double gamma, double& x_PR, double& y_PR) const;
    void getBeltAngles(const double frameX, const double frameY, const double gamma, double& phi_L, double& phi_R) const;
    void getBeltForces(const double phi_L, const double phi_R, double& F_L, double&F_R) const;
    double solveTorqueEquilibrium(const double phi_L, const double phi_R, const double F_L, const double F_R, const double gamma_start) const;
    double getDilationCorrectedBeltLength(double belt_length, double F_belt) const;
    
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
    void setTopDistance(const int distance);
    void resumeTopDistance(const int distance);
    int getTopDistance();
    void leftStepper(const int dir);
    void rightStepper(const int dir);
    int extendToHome();
    void runSteppers();
    float beginLinearTravel(double x, double y, int speed);

    // Used for calibration of the esteps.
    void extend1000mm(); 

    Point getHomeCoordinates();
    void disableMotors();
};

#endif