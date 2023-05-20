#ifndef InterpolatingMovementTask_h
#define InterpolatingMovementTask_h
#include "movement.h"
#include "task.h"
const double INCREMENT = 1;
class InterpolatingMovementTask : public Task {
    private:
    Movement *movement;
    Movement::Point target;
    Movement::Point position;
    public:
    const static char* NAME;
    InterpolatingMovementTask(Movement *movement, Movement::Point target);
    bool isDone();
    void startRunning();
    const char* name() {
        return NAME;
    }
};
#endif