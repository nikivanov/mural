#ifndef InterpolatingMovementTask_h
#define InterpolatingMovementTask_h
#include "movement.h"
#include "pen.h"
#include "task.h"
const double INCREMENT = 1;
class InterpolatingMovementTask : public Task {
    private:
    Movement *movement;
    Pen *pen;
    Movement::Point target;
    Movement::Point position;
    bool failed = false;
    // Pen-up moves (repositioning) run at moveSpeedSteps, the same fast speed already
    // used for extendToHome(); pen-down moves (drawing) stay at printSpeedSteps. Queried
    // from Pen::isDown() fresh on every beginLinearTravel() call (startRunning() and each
    // isDone() increment) rather than captured once at construction, so the task stays
    // correct even if pen state were ever able to change mid-task. As of this writing it
    // cannot: Runner runs PenTask and movement tasks strictly sequentially (PenTask's
    // startRunning() blocks until the servo finishes moving and isDone() is immediately
    // true), so no movement task ever observes a pen transition mid-flight - see runner.cpp.
    int currentSpeedSteps();
    public:
    const static char* NAME;
    InterpolatingMovementTask(Movement *movement, Pen *pen, Movement::Point target);
    bool isDone();
    void startRunning();
    const char* name() {
        return NAME;
    }
};
#endif