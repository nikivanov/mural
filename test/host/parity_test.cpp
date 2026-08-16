// Host-side (g++) parity harness for the belt-length kinematics solver.
//
// This exercises the pure math in src/kinematics.cpp -- no Arduino/ESP32 dependencies
// are involved, so it can be built and run directly with g++ on a dev machine:
//
//   g++ -std=c++17 -O2 -I../../src ../../src/kinematics.cpp parity_test.cpp -o parity_test
//   ./parity_test
//
// It compares the belt lengths produced by the new root-finding solver
// (Kinematics::computeBeltLengths) against the original 0.2-degree grid-search solver
// (Kinematics::computeBeltLengthsGridSearch, preserved in kinematics.cpp for exactly
// this purpose) over a grid of pen positions, for topDistance values of 1000/2000/3000mm.
//
// Both solvers are warm-started (see Movement::gamma_last_position), so the harness walks
// a boustrophedon (snake) path over the drawable area and evaluates every 1mm along it --
// matching src/tasks/interpolatingmovementtask.h's INCREMENT, i.e. the actual step size at
// which the firmware calls Movement::getBeltLengths() during a real drawing. This matters:
// the legacy solver's 0.2-degree grid step means its per-call precision is coarse, but
// warm-started at real firmware step sizes it tracks the true equilibrium closely, same as
// it does in production. (A coarser synthetic grid with large jumps between sample points
// is not representative -- it forces both warm-started solvers to chase a large inclination
// change in one call, which is not how either is used in practice.)
//
// Requirement: max belt-length difference between old and new must be < 0.05mm.

#include "kinematics.h"
#include <cstdio>
#include <cmath>
#include <vector>

namespace {

constexpr double kPi = 3.14159265358979323846;

// Mirrors the compile-time defaults in movement.h.
constexpr double d_t = 76.027;
constexpr double d_p = 4.4866;
constexpr double d_m = 10.0 + d_p;
constexpr double mass_bot = 0.55;
constexpr double g_constant = 9.81;
constexpr double belt_elongation_coefficient = 5e-5;
constexpr double midPulleyToWall = 41.0;

// Mirrors Movement::setTopDistance's coordinate-system setup.
constexpr double safeYFraction = 0.2;
constexpr double safeXFraction = 0.2;

constexpr double gamma_delta_termination_new = 0.01 * kPi / 180.0;
constexpr double gamma_delta_termination_old = 0.25 * kPi / 180.0;
constexpr int solver_max_iterations = 20;

// Matches INCREMENT in src/tasks/interpolatingmovementtask.h: the firmware calls
// getBeltLengths() roughly every 1mm of travel while interpolating a move.
constexpr double kStepMM = 1.0;
constexpr double kRowSpacingMM = 25.0; // vertical spacing between boustrophedon rows.

struct GridResult {
    double maxDiffLeft = 0.0;
    double maxDiffRight = 0.0;
    double worstX = 0.0;
    double worstY = 0.0;
    double worstTopDistance = 0.0;
    long pointCount = 0;
    long overThreshold = 0;
    double sumDiff = 0.0;
};

struct Point {
    double x, y;
};

void evaluatePoint(double x, double y, double topDistance, double minSafeXOffset, double minSafeY,
                    const Kinematics::PhysicsParams &params,
                    double &gamma_state_new, double &gamma_state_old, GridResult &accum) {
    const double frameX = x + minSafeXOffset;
    const double frameY = y + minSafeY;

    const Kinematics::BeltLengthsResult resultNew = Kinematics::computeBeltLengths(
        frameX, frameY, topDistance, gamma_state_new, params,
        gamma_delta_termination_new, solver_max_iterations);

    const Kinematics::BeltLengthsResult resultOld = Kinematics::computeBeltLengthsGridSearch(
        frameX, frameY, topDistance, gamma_state_old, params,
        gamma_delta_termination_old, solver_max_iterations);

    gamma_state_new = resultNew.gamma;
    gamma_state_old = resultOld.gamma;

    const double diffLeft = fabs(resultNew.leftLeg - resultOld.leftLeg);
    const double diffRight = fabs(resultNew.rightLeg - resultOld.rightLeg);

    accum.pointCount++;
    const double diffMax = fmax(diffLeft, diffRight);
    accum.sumDiff += diffMax;
    if (diffMax >= 0.05) accum.overThreshold++;
    if (diffLeft > accum.maxDiffLeft) {
        accum.maxDiffLeft = diffLeft;
        accum.worstX = x;
        accum.worstY = y;
        accum.worstTopDistance = topDistance;
    }
    if (diffRight > accum.maxDiffRight) {
        accum.maxDiffRight = diffRight;
        accum.worstX = x;
        accum.worstY = y;
        accum.worstTopDistance = topDistance;
    }
}

// Walks from `from` to `to` in ~kStepMM increments (mirroring getNextIncrement() in
// interpolatingmovementtask.cpp), evaluating both solvers at every step.
void walkSegment(Point from, Point to, double topDistance, double minSafeXOffset, double minSafeY,
                  const Kinematics::PhysicsParams &params,
                  double &gamma_state_new, double &gamma_state_old, GridResult &accum) {
    const double dx = to.x - from.x;
    const double dy = to.y - from.y;
    const double distance = sqrt(dx * dx + dy * dy);
    const int steps = std::max(1, (int)ceil(distance / kStepMM));

    for (int i = 1; i <= steps; i++) {
        const double t = (double)i / steps;
        evaluatePoint(from.x + t * dx, from.y + t * dy, topDistance, minSafeXOffset, minSafeY,
                      params, gamma_state_new, gamma_state_old, accum);
    }
}

GridResult runGridForTopDistance(double topDistance, GridResult accum) {
    Kinematics::PhysicsParams params;
    params.d_t = d_t;
    params.d_p = d_p;
    params.d_m = d_m;
    params.mass_bot = mass_bot;
    params.g_constant = g_constant;
    params.belt_elongation_coefficient = belt_elongation_coefficient;
    params.midPulleyToWall = midPulleyToWall;

    const double minSafeY = safeYFraction * topDistance;
    const double minSafeXOffset = safeXFraction * topDistance;
    const double width = topDistance - 2 * minSafeXOffset;
    const double height = topDistance * 0.6; // representative drawable height, well within safe bounds.

    // Warm-started state, carried across the whole walk just like Movement::gamma_last_position
    // is carried across successive getBeltLengths() calls during a real drawing.
    double gamma_state_new = 0.0;
    double gamma_state_old = 0.0;

    Point current = {0.0, 0.0};
    evaluatePoint(current.x, current.y, topDistance, minSafeXOffset, minSafeY, params, gamma_state_new, gamma_state_old, accum);

    int rowIndex = 0;
    for (double y = 0.0; y <= height; y += kRowSpacingMM) {
        const double targetX = (rowIndex % 2 == 0) ? width : 0.0;
        Point rowEnd = {targetX, y};
        walkSegment(current, rowEnd, topDistance, minSafeXOffset, minSafeY, params, gamma_state_new, gamma_state_old, accum);
        current = rowEnd;

        const double nextY = std::min(y + kRowSpacingMM, height);
        if (nextY > y) {
            Point rowStep = {current.x, nextY};
            walkSegment(current, rowStep, topDistance, minSafeXOffset, minSafeY, params, gamma_state_new, gamma_state_old, accum);
            current = rowStep;
        }
        rowIndex++;
    }

    return accum;
}

} // namespace

int main() {
    const std::vector<double> topDistances = {1000.0, 2000.0, 3000.0};

    GridResult accum;
    for (double topDistance : topDistances) {
        accum = runGridForTopDistance(topDistance, accum);
    }

    const double maxDiff = fmax(accum.maxDiffLeft, accum.maxDiffRight);
    const double tolerance = 0.05;

    printf("Parity test: %ld points (boustrophedon path at %.0fmm step, %.0fmm row spacing) across topDistance in {1000,2000,3000}mm\n",
           accum.pointCount, kStepMM, kRowSpacingMM);
    printf("  max |leftLeg_new - leftLeg_old|  = %.6f mm\n", accum.maxDiffLeft);
    printf("  max |rightLeg_new - rightLeg_old| = %.6f mm\n", accum.maxDiffRight);
    printf("  worst point: topDistance=%.0fmm x=%.2f y=%.2f\n", accum.worstTopDistance, accum.worstX, accum.worstY);
    printf("  mean diff = %.6f mm, points >= 0.05mm: %ld / %ld (%.4f%%)\n",
           accum.sumDiff / accum.pointCount, accum.overThreshold, accum.pointCount,
           100.0 * accum.overThreshold / accum.pointCount);

    if (maxDiff < tolerance) {
        printf("PASS: max belt-length difference %.6f mm < %.2f mm tolerance\n", maxDiff, tolerance);
        return 0;
    } else {
        printf("FAIL: max belt-length difference %.6f mm >= %.2f mm tolerance\n", maxDiff, tolerance);
        return 1;
    }
}
