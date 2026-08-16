#ifndef Kinematics_h
#define Kinematics_h

// Pure, hardware-independent belt-length kinematics math for the Mural wall plotter.
// Extracted from Movement so this math can be exercised by a host-side (g++) test
// harness without pulling in any Arduino/ESP32 dependencies.
// See KinematicModel.md for the derivation of the equations implemented here.

namespace Kinematics {

// Physical constants describing the bot's geometry and belt behavior.
// mass_bot, belt_elongation_coefficient are runtime-configurable (see Movement);
// d_t, d_p, d_m and midPulleyToWall are fixed geometric properties of the hardware.
struct PhysicsParams {
    double d_t;                          // [mm] distance between pulley tangent points
    double d_p;                          // [mm] distance from Q to pen center
    double d_m;                          // [mm] distance from tangent line to bot's center of mass
    double mass_bot;                     // [kg] mass of the bot
    double g_constant;                   // [m/s^2] gravitational acceleration
    double belt_elongation_coefficient;  // [m/N] elongation of the belts under force
    double midPulleyToWall;              // [mm] standoff distance from pulley to wall
};

struct BeltLengthsResult {
    double leftLeg;   // [mm] dilation-corrected left belt length
    double rightLeg;  // [mm] dilation-corrected right belt length
    double gamma;     // [rad] converged bot inclination
};

void getLeftTangentPoint(double frameX, double frameY, double gamma, double d_t, double d_p, double &x_PL, double &y_PL);
void getRightTangentPoint(double frameX, double frameY, double gamma, double d_t, double d_p, double &x_PR, double &y_PR);
void getBeltAngles(double frameX, double frameY, double gamma, double topDistance, double d_t, double d_p, double &phi_L, double &phi_R);
void getBeltForces(double phi_L, double phi_R, const PhysicsParams &params, double &F_L, double &F_R);

// Residual torque T_delta(gamma) = T_R - T_L + T_m. The equilibrium inclination is the
// gamma for which this function is zero (see KinematicModel.md "Torques").
double computeTorqueDelta(double phi_L, double phi_R, double F_L, double F_R, double gamma, const PhysicsParams &params);

// Root-finds T_delta(gamma) = 0 using the secant method (with bisection fallback for
// robustness), warm-started from gamma_init. Converges to ~0.01 degrees.
double solveTorqueEquilibrium(double phi_L, double phi_R, double F_L, double F_R, double gamma_init, const PhysicsParams &params);

double getDilationCorrectedBeltLength(double belt_length, double F_belt, double belt_elongation_coefficient);

// Full solve: iterates belt-angle / force / torque computation to self-consistency,
// starting the inclination search from gamma_init (typically the last known value).
// Returns the converged, dilation-corrected belt lengths (mm) and inclination (rad).
BeltLengthsResult computeBeltLengths(
    double frameX, double frameY, double topDistance,
    double gamma_init, const PhysicsParams &params,
    double gamma_delta_termination, int solver_max_iterations);

// --- Legacy grid-search solver, retained only so the host test harness can prove
// --- numerical parity with the pre-refactor implementation. Not used by firmware.
double solveTorqueEquilibriumGridSearch(double phi_L, double phi_R, double F_L, double F_R, double gamma_init, const PhysicsParams &params);
BeltLengthsResult computeBeltLengthsGridSearch(
    double frameX, double frameY, double topDistance,
    double gamma_init, const PhysicsParams &params,
    double gamma_delta_termination, int solver_max_iterations);

} // namespace Kinematics

#endif
