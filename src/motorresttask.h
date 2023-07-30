#ifndef MotorRestTask_h
#define MotorRestTask_h
#include "task.h"
#include "movement.h"
#include "pen.h"
class MotorRestTask : public Task {
    private:
    const char* NAME = "MotorRestTask";
    const int REST_SECONDS = 60;
    Movement *movement;
    Display *display;
    Pen *pen;
    unsigned long startTime;
    bool penDownAfterRest = false;
    int progress;
    public:
    MotorRestTask(Movement *movement, Display *display, Pen *pen, int progress);
    bool isDone();
    void startRunning();
    const char* name() {
        return NAME;
    }
};
#endif