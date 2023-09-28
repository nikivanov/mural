#ifndef MovementTask_h
#define MovementTask_h
#include "movement.h"
#include "task.h"
class MovementTask : public Task {
    private:
    const char* NAME = "MovementTask";
    Movement *movement;
    int x;
    int y;
    public:
    MovementTask(int x, int y, Movement *movement);
    bool isDone();
    void startRunning();
    const char* name() {
        return NAME;
    }
};
#endif