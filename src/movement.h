#ifndef Movement_h
#define Movement_h

#include "AccelStepper.h"
#include "Arduino.h"
#include "Preferences.h"
#include "display.h"
#include "kinematics.h"


#ifdef MURAL_TMC_UART
// UNTESTED ON HARDWARE: TMC2209 UART support. See docs/tmc-uart.md for the
// required wiring (single shared UART line, MS1/MS2 address straps, DIAG
// pins) before enabling this build flag on real hardware.
#include <TMCStepper.h>
#endif

// Motor driver parameters.
constexpr int printSpeedSteps = 500;
constexpr int  moveSpeedSteps = 1500;
constexpr long INFINITE_STEPS = 999999999;
constexpr long acceleration = 999999999;  // Essentially infinite, causing instant stop / start
constexpr int stepsPerRotation = 200 * 8; // 1/8 microstepping

// Geometry parameters:
// Compile-time defaults for the physics constants below. These are runtime-configurable
// (persisted in NVS via Preferences, see Movement::loadPhysicsConstants) so they can be
// refined without reflashing. These constants remain the defaults used on first boot.
constexpr double default_diameter = 12.69;                    // [mm] Effective diameter of the pulley+belts.
constexpr float default_homedStepOffsetMM = 40.0;              // Length of fully retracted belt hitting stop screw.
                                                                // Measured from outer edge of screw to the point
                                                                // of tangency between belt and pulley. [mm]
constexpr double default_mass_bot = 0.55;                      // Mass of the mural bot [kg].
constexpr double default_belt_elongation_coefficient = 5e-5;   // [m/N] elongation of the belts under force.

constexpr double midPulleyToWall = 41.0;    // (Height) distance from mid of pulley to wall [mm].
constexpr double g_constant = 9.81; // Earth's gravitational acceleration constant [m/s^2]. Please adjust when running Mural on other planets!
constexpr double d_t = 76.027;      // [mm] Distance of tangent points, where belts touch the pulleys.
                                    // Calculated as (axis distance) 85.00 - (diameter) 12.69/sqrt(2).
constexpr double d_p = 4.4866;      // [mm] distance from Q to center of pen. Calculated as diameter/(2 * sqrt(2)).
constexpr double d_m = 10.0 + d_p;  // [mm] Distance from line connecting tangent points to center of mass of bot (projected onto wall plane).
                                    // The point where d_m and d_t meet shall be called Q.
                                    // The center of mass sits roughly at the bottom of the pen opening.
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

#ifdef MURAL_TMC_UART
// UNTESTED ON HARDWARE: pin/address plan for TMC2209 UART. Both drivers
// share a single UART line (PDN_UART pins tied together); MS1/MS2 straps
// select each driver's UART slave address instead of microstepping (UART
// mode sets microsteps via register, not pins). See docs/tmc-uart.md.
constexpr int MURAL_TMC_UART_TX_PIN = 17;   // ESP32 UART2 TX -> 1k resistor -> shared PDN_UART line.
constexpr int MURAL_TMC_UART_RX_PIN = 16;   // ESP32 UART2 RX -> shared PDN_UART line (direct connection).
constexpr long MURAL_TMC_UART_BAUD = 115200;

constexpr int LEFT_DIAG_PIN = 4;            // Left driver DIAG (StallGuard) output.
constexpr int RIGHT_DIAG_PIN = 18;          // Right driver DIAG (StallGuard) output.

constexpr uint8_t LEFT_TMC_ADDRESS = 0;     // MS1=GND, MS2=GND.
constexpr uint8_t RIGHT_TMC_ADDRESS = 1;    // MS1=3V3, MS2=GND.

constexpr float TMC_R_SENSE = 0.11f;        // Sense resistor on stock BigTreeTech TMC2209 boards.
constexpr uint16_t TMC_RUN_CURRENT_MA = 800; // Conservative default - tune to the rated current of
                                             // your specific NEMA17 (pancake) motor before real use.
constexpr uint8_t TMC_SGTHRS = 100;         // StallGuard threshold (0-255, higher = less sensitive).
                                             // Must be re-tuned on real hardware/belt tension.
constexpr uint32_t TMC_TCOOLTHRS = 0xFFFFFul; // Enable StallGuard/CoolStep across (nearly) the full speed range.
constexpr int TMC_HOMING_SPEED_STEPS = printSpeedSteps; // Retract speed used for StallGuard homing.
#endif

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
    bool positionKnown = false; // Whether X/Y currently hold a valid pen position.
    bool startedHoming;
    AccelStepper *leftMotor;
    AccelStepper *rightMotor;
    Display *display;
    Preferences preferences;
    void setOrigin();

#ifdef MURAL_TMC_UART
    // UNTESTED ON HARDWARE: TMC2209 UART driver state. Used for (a) sensorless
    // StallGuard homing during belt retraction and (b) stall monitoring while
    // drawing. See docs/tmc-uart.md.
    HardwareSerial tmcSerial = HardwareSerial(2);
    TMC2209Stepper *leftDriver;
    TMC2209Stepper *rightDriver;
    // Tracked per motor (rather than one combined flag) so RetractBeltsPhase
    // can report/stop each belt's StallGuard homing independently - see the
    // per-DIAG-pin handling in runSteppers().
    bool leftStalled = false;
    bool rightStalled = false;
    void setupTmcDrivers();
    bool checkLeftStallGuard();
    bool checkRightStallGuard();
#endif

    // Direction (-1, 0, 1) last commanded via leftStepper()/rightStepper(),
    // used to report a live "retracting" status per motor while a manual jog
    // is held (see isLeftRetracting()/isRightRetracting()). Tracked outside
    // MURAL_TMC_UART since manual jogging is the default (and always
    // available) way to retract the belts.
    int leftCommandedDir = 0;
    int rightCommandedDir = 0;

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

    // Runtime-configurable physics constants, persisted in NVS (see loadPhysicsConstants).
    double diameter;                    // [mm] Effective diameter of the pulley+belts.
    double homedStepOffsetMM;           // [mm] Length of fully retracted belt hitting stop screw.
    double mass_bot;                    // [kg] Mass of the mural bot.
    double belt_elongation_coefficient; // [m/N] Elongation of the belts under force.

    // Values derived from the physics constants above.
    double circumference;   // [mm] = diameter * PI
    int homedStepsOffset;   // [steps]

    long lastEstepsCalibrationSteps = 0; // Steps commanded by the last extend1000mm() call, used to
                                          // convert a user-measured travel distance back into diameter.

    void loadPhysicsConstants();
    void recomputeDerivedPhysicsConstants();
    Kinematics::PhysicsParams getPhysicsParams() const;

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
    // True while that motor is actively jogging in the retract direction
    // (dir < 0 last commanded via leftStepper()/rightStepper() and still has
    // steps left to run). Used by RetractBeltsPhase to report a live
    // "retracting" status per motor in manual mode; goes back to false as
    // soon as the jog is released, it never claims "retracted" on its own.
    bool isLeftRetracting();
    bool isRightRetracting();
    bool hasStartedHoming();
    bool getWidth(double& width);
    bool getCoordinates(Point& point);
    void setTopDistance(const int distance);
    void resumeTopDistance(const int distance);
    int getTopDistance();
    void leftStepper(const int dir);
    void rightStepper(const int dir);
    bool extendToHome(int& moveTime);
    void runSteppers();
    bool beginLinearTravel(double x, double y, int speed, float& moveTime);

    // Used for calibration of the esteps.
    void extend1000mm();

    Point getHomeCoordinates();
    void disableMotors();

    // Runtime-configurable physics constants (see KinematicModel.md).
    double getMassBot();
    double getBeltElongationCoefficient();
    double getEffectiveDiameter();
    double getHomedStepOffsetMM();
    void setMassBot(double value);
    void setBeltElongationCoefficient(double value);
    void setEffectiveDiameter(double value);
    void setHomedStepOffsetMM(double value);

    // Given a physically measured travel distance for the last extend1000mm() call,
    // computes and persists a corrected effective pulley diameter.
    bool calibrateEffectiveDiameterFromMeasurement(double measuredDistanceMM, double& correctedDiameter);

#ifdef MURAL_TMC_UART
    // UNTESTED ON HARDWARE: true once runSteppers() has observed a stall
    // (DIAG asserted) mid-move and halted that motor. isStalled() reports
    // either belt (used by Runner to pause the job if a stall happens while
    // drawing); isLeftStalled()/isRightStalled() let RetractBeltsPhase track
    // each belt's StallGuard homing independently. Cleared automatically
    // whenever a new move is (re-)started for that motor, or explicitly via
    // clearStall().
    bool isStalled();
    bool isLeftStalled();
    bool isRightStalled();
    void clearStall();
#endif
};

#endif