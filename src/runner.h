#ifndef Runner_h
#define Runner_h
#include "movement.h"
#include "task.h"
class Runner {
    private:
    Movement *movement;
    Task *tasks[250];
    int currentTask;
    void initTasks();
    bool stopped;
    public:
    Runner(Movement *movement);
    void start();
    void run();

};
#endif