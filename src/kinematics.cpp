#include "kinematics.h"
#include <cmath>

namespace Kinematics {

namespace {
    constexpr double kPi = 3.14159265358979323846;
}

void getLeftTangentPoint(const double frameX, const double frameY, const double gamma, const double d_t, const double d_p, double &x_PL, double &y_PL) {
    const double s_L = d_t / 2.0;
    const double P_LX = s_L * cos(gamma) - d_p * sin(gamma);
    const double P_LY = s_L * sin(gamma) + d_p * cos(gamma);
    x_PL = frameX - P_LX;
    y_PL = frameY - P_LY;
}

void getRightTangentPoint(const double frameX, const double frameY, const double gamma, const double d_t, const double d_p, double &x_PR, double &y_PR) {
    const double s_R = d_t / 2.0;
    const double P_RX = s_R * cos(gamma) + d_p * sin(gamma);
    const double P_RY = s_R * sin(gamma) - d_p * cos(gamma);
    x_PR = frameX + P_RX;
    y_PR = frameY + P_RY;
}

void getBeltAngles(const double frameX, const double frameY, const double gamma, const double topDistance, const double d_t, const double d_p, double &phi_L, double &phi_R) {
    double x_PL, y_PL;
    getLeftTangentPoint(frameX, frameY, gamma, d_t, d_p, x_PL, y_PL);
    phi_L = atan2(y_PL, x_PL);

    double x_PR, y_PR;
    getRightTangentPoint(frameX, frameY, gamma, d_t, d_p, x_PR, y_PR);
    phi_R = atan2(y_PR, topDistance - x_PR);
}

void getBeltForces(const double phi_L, const double phi_R, const PhysicsParams &params, double &F_L, double &F_R) {
    const double F_G = params.mass_bot * params.g_constant;
    F_R = F_G * cos(phi_L) / sin(phi_L + phi_R);
    F_L = F_G * cos(phi_R) / sin(phi_L + phi_R);
}

double computeTorqueDelta(const double phi_L, const double phi_R, const double F_L, const double F_R, const double gamma, const PhysicsParams &params) {
    const double s_L = params.d_t / 2.0;
    const double s_R = params.d_t / 2.0;

    const double alpha = phi_L - gamma;
    const double beta = phi_R + gamma;

    const double T_L = s_L * sin(alpha) * F_L;
    const double T_R = s_R * sin(beta) * F_R;

    const double s_m = params.d_m * tan(gamma);
    const double F_G = params.mass_bot * params.g_constant;
    const double F_m = F_G * cos(gamma);
    const double T_m = s_m * F_m;

    return T_R - T_L + T_m;
}

double solveTorqueEquilibrium(const double phi_L, const double phi_R, const double F_L, const double F_R, const double gamma_init, const PhysicsParams &params) {
    // Root-find T_delta(gamma) = 0. There is exactly one zero crossing in the valid
    // range (see KinematicModel.md), so a secant search warm-started from gamma_init
    // converges in just a few evaluations. A bisection fallback guarantees robustness
    // in case the secant step misbehaves (e.g. near-flat regions).
    constexpr double gamma_min = -90.0 * kPi / 180.0;
    constexpr double gamma_max = 90.0 * kPi / 180.0;
    constexpr double gamma_tolerance = 0.01 * kPi / 180.0; // [rad] ~0.01 degree convergence.
    constexpr double bracket_step = 0.5 * kPi / 180.0;     // [rad] initial probe offset for bracketing.
    constexpr int max_iterations = 40;

    auto clamp = [&](double gamma) {
        if (gamma < gamma_min) return gamma_min;
        if (gamma > gamma_max) return gamma_max;
        return gamma;
    };

    double gamma_a = clamp(gamma_init);
    double T_a = computeTorqueDelta(phi_L, phi_R, F_L, F_R, gamma_a, params);
    if (fabs(T_a) < 1e-9) {
        return gamma_a;
    }

    double gamma_b = clamp(gamma_init + bracket_step);
    if (gamma_b == gamma_a) {
        gamma_b = clamp(gamma_init - bracket_step);
    }
    double T_b = computeTorqueDelta(phi_L, phi_R, F_L, F_R, gamma_b, params);

    // Make sure we have a bracket [lo, hi] with a sign change, expanding outward from
    // gamma_init if the initial probe didn't straddle the root.
    double lo, hi, T_lo, T_hi;
    if (T_a * T_b <= 0) {
        lo = fmin(gamma_a, gamma_b);
        hi = fmax(gamma_a, gamma_b);
        T_lo = (lo == gamma_a) ? T_a : T_b;
        T_hi = (hi == gamma_a) ? T_a : T_b;
    } else {
        double step = bracket_step;
        bool found = false;
        lo = hi = gamma_a;
        T_lo = T_hi = T_a;
        for (int i = 0; i < 30 && !found; i++) {
            step *= 1.6;
            const double try_hi = clamp(gamma_init + step);
            const double try_lo = clamp(gamma_init - step);

            const double T_try_hi = computeTorqueDelta(phi_L, phi_R, F_L, F_R, try_hi, params);
            if (T_a * T_try_hi <= 0) {
                lo = gamma_a; T_lo = T_a;
                hi = try_hi; T_hi = T_try_hi;
                found = true;
                break;
            }

            const double T_try_lo = computeTorqueDelta(phi_L, phi_R, F_L, F_R, try_lo, params);
            if (T_a * T_try_lo <= 0) {
                lo = try_lo; T_lo = T_try_lo;
                hi = gamma_a; T_hi = T_a;
                found = true;
                break;
            }

            if (try_hi >= gamma_max && try_lo <= gamma_min) {
                break;
            }
        }
        if (!found) {
            // Could not bracket a root (shouldn't happen in practice): fall back to
            // whichever probe point is closest to equilibrium.
            return fabs(T_a) < fabs(T_b) ? gamma_a : gamma_b;
        }
    }

    // Secant iteration using the two most recent points, constrained to stay inside
    // [lo, hi] (bisecting whenever the secant step would leave the bracket).
    double x_prev = lo, f_prev = T_lo;
    double x_curr = hi, f_curr = T_hi;

    for (int i = 0; i < max_iterations; i++) {
        double x_next;
        if (f_curr != f_prev) {
            x_next = x_curr - f_curr * (x_curr - x_prev) / (f_curr - f_prev);
        } else {
            x_next = 0.5 * (lo + hi);
        }

        if (!(x_next > lo && x_next < hi) || !std::isfinite(x_next)) {
            x_next = 0.5 * (lo + hi);
        }

        const double f_next = computeTorqueDelta(phi_L, phi_R, F_L, F_R, x_next, params);

        // Keep the bracket valid for the bisection fallback.
        if (T_lo * f_next <= 0) {
            hi = x_next; T_hi = f_next;
        } else {
            lo = x_next; T_lo = f_next;
        }

        const double step_size = fabs(x_next - x_curr);
        x_prev = x_curr; f_prev = f_curr;
        x_curr = x_next; f_curr = f_next;

        if (step_size < gamma_tolerance || fabs(f_next) < 1e-9) {
            return x_next;
        }
    }

    return x_curr;
}

double getDilationCorrectedBeltLength(const double belt_length, const double F_belt, const double belt_elongation_coefficient) {
    const double elongation_factor = 1 + belt_elongation_coefficient * F_belt;
    return belt_length / elongation_factor;
}

BeltLengthsResult computeBeltLengths(
    const double frameX, const double frameY, const double topDistance,
    const double gamma_init, const PhysicsParams &params,
    const double gamma_delta_termination, const int solver_max_iterations) {

    double gamma = gamma_init;
    double phi_L = 0.0, phi_R = 0.0;
    double F_L = 0.0, F_R = 0.0;

    for (int i = 0; i < solver_max_iterations; i++) {
        getBeltAngles(frameX, frameY, gamma, topDistance, params.d_t, params.d_p, phi_L, phi_R);
        getBeltForces(phi_L, phi_R, params, F_L, F_R);

        const double gamma_last = gamma;
        gamma = solveTorqueEquilibrium(phi_L, phi_R, F_L, F_R, gamma, params);
        if (fabs(gamma_last - gamma) < gamma_delta_termination) break;
    }

    double leftX, leftY, rightX, rightY;
    getLeftTangentPoint(frameX, frameY, gamma, params.d_t, params.d_p, leftX, leftY);
    getRightTangentPoint(frameX, frameY, gamma, params.d_t, params.d_p, rightX, rightY);

    const double leftLegFlat = sqrt(pow(leftX, 2) + pow(leftY, 2));
    const double rightLegFlat = sqrt(pow(topDistance - rightX, 2) + pow(rightY, 2));

    double leftLeg = sqrt(pow(leftLegFlat, 2) + pow(params.midPulleyToWall, 2));
    double rightLeg = sqrt(pow(rightLegFlat, 2) + pow(params.midPulleyToWall, 2));

    leftLeg = getDilationCorrectedBeltLength(leftLeg, F_L, params.belt_elongation_coefficient);
    rightLeg = getDilationCorrectedBeltLength(rightLeg, F_R, params.belt_elongation_coefficient);

    BeltLengthsResult result;
    result.leftLeg = leftLeg;
    result.rightLeg = rightLeg;
    result.gamma = gamma;
    return result;
}

// --- Legacy grid-search implementation, preserved for the parity test harness only. ---

double solveTorqueEquilibriumGridSearch(const double phi_L, const double phi_R, const double F_L, const double F_R, const double gamma_init, const PhysicsParams &params) {
    const double s_L = params.d_t / 2.0;
    const double s_R = params.d_t / 2.0;

    double gamma_best = 99999999;
    double T_delta_best = 99999999;

    constexpr double gamma_step = 0.20 * kPi / 180.0;
    constexpr double gamma_min = -90.0 * kPi / 180.0;
    constexpr double gamma_max = 90.0 * kPi / 180.0;
    constexpr double gamma_search_window = 2.0 * kPi / 180.0;

    for (double gamma = gamma_init - gamma_search_window;
         gamma > gamma_min && gamma < gamma_max && gamma <= gamma_init + gamma_search_window;
         gamma += gamma_step) {
        const double alpha = phi_L - gamma;
        const double beta = phi_R + gamma;

        double T_L = s_L * sin(alpha) * F_L;
        double T_R = s_R * sin(beta) * F_R;

        double s_m = params.d_m * tan(gamma);
        const double F_G = params.mass_bot * params.g_constant;
        double F_m = F_G * cos(gamma);
        double T_m = s_m * F_m;

        double T_delta = T_R - T_L + T_m;
        if (fabs(T_delta) < fabs(T_delta_best)) {
            T_delta_best = T_delta;
            gamma_best = gamma;
        } else {
            return gamma_best;
        }
    }

    return gamma_best;
}

BeltLengthsResult computeBeltLengthsGridSearch(
    const double frameX, const double frameY, const double topDistance,
    const double gamma_init, const PhysicsParams &params,
    const double gamma_delta_termination, const int solver_max_iterations) {

    double gamma = gamma_init;
    double phi_L = 0.0, phi_R = 0.0;
    double F_L = 0.0, F_R = 0.0;

    for (int i = 0; i < solver_max_iterations; i++) {
        getBeltAngles(frameX, frameY, gamma, topDistance, params.d_t, params.d_p, phi_L, phi_R);
        getBeltForces(phi_L, phi_R, params, F_L, F_R);

        const double gamma_last = gamma;
        gamma = solveTorqueEquilibriumGridSearch(phi_L, phi_R, F_L, F_R, gamma, params);
        if (fabs(gamma_last - gamma) < gamma_delta_termination) break;
    }

    double leftX, leftY, rightX, rightY;
    getLeftTangentPoint(frameX, frameY, gamma, params.d_t, params.d_p, leftX, leftY);
    getRightTangentPoint(frameX, frameY, gamma, params.d_t, params.d_p, rightX, rightY);

    const double leftLegFlat = sqrt(pow(leftX, 2) + pow(leftY, 2));
    const double rightLegFlat = sqrt(pow(topDistance - rightX, 2) + pow(rightY, 2));

    double leftLeg = sqrt(pow(leftLegFlat, 2) + pow(params.midPulleyToWall, 2));
    double rightLeg = sqrt(pow(rightLegFlat, 2) + pow(params.midPulleyToWall, 2));

    leftLeg = getDilationCorrectedBeltLength(leftLeg, F_L, params.belt_elongation_coefficient);
    rightLeg = getDilationCorrectedBeltLength(rightLeg, F_R, params.belt_elongation_coefficient);

    BeltLengthsResult result;
    result.leftLeg = leftLeg;
    result.rightLeg = rightLeg;
    result.gamma = gamma;
    return result;
}

} // namespace Kinematics
