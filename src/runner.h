#ifndef Runner_h
#define Runner_h
#include "movement.h"
#include "task.h"
#include "pen.h"
class Runner {
    private:
    Movement *movement;
    Pen *pen;
    Task *tasks[5*8];
    int currentTask;
    void initTasks();
    bool stopped;
    public:
    Runner(Movement *movement, Pen *pen);
    void start();
    void run();

};
#endif