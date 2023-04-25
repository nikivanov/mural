#ifndef Runner_h
#define Runner_h
#include "movement.h"
#include "task.h"
#include "pen.h"
#include "display.h"
class Runner {
    private:
    Movement *movement;
    Pen *pen;
    Display *display;
    Task *tasks[5*8];
    int currentTask;
    void initTasks();
    bool stopped;
    void printStatus();
    public:
    Runner(Movement *movement, Pen *pen, Display *display);
    void start();
    void run();

};
#endif