#ifndef Runner_h
#define Runner_h
#include "movement.h"
#include "tasks/task.h"
#include "pen.h"
#include "display.h"
#include "LittleFS.h"
class Runner {
    private:
    Movement *movement;
    Pen *pen;
    Display *display;
    bool initTaskProvider();
    Task* getNextTask();
    Task* currentTask;
    bool stopped;
    File openedFile;
    double totalDistance;
    Movement::Point targetPosition;
    int progress;
    int totalLines;
    int executedLines;
    Task *finishingSequence[1];
    int sequenceIx = 0;
#ifdef MURAL_TMC_UART
    // UNTESTED ON HARDWARE: set once a mid-drawing stall has been observed;
    // while true, run() stops feeding new tasks instead of advancing the job.
    bool pausedForStall = false;
#endif
    public:
    Runner(Movement *movement, Pen *pen, Display *display);
    bool start();
    void run();
    void dryRun();
};
#endif