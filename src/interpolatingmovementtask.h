#ifndef InterpolatingMovementTask_h
#define InterpolatingMovementTask_h
#include "movement.h"
#include "task.h"
const double INCREMENT = 0.5;
class InterpolatingMovementTask : public Task {
    private:
    Movement *movement;
    Movement::Point target;
    Movement::Point position;
    public:
    InterpolatingMovementTask(Movement *movement, Movement::Point target);
    bool isDone();
    void startRunning();

};
#endif