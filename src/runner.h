#ifndef Runner_h
#define Runner_h
#include "movement.h"
#include "tasks/task.h"
#include "pen.h"
#include "display.h"
#include "SPIFFS.h"
class Runner {
    private:
    Movement *movement;
    Pen *pen;
    Display *display;
    bool initTaskProvider();
    Task* getNextTask(bool dryRun);
    Task* currentTask;
    bool stopped;
    File* openedFile;
    double totalDistance;
    double distanceSoFar;
    Movement::Point startPosition;
    Movement::Point targetPosition;
    int progress;
    Task *finishingSequence[3];
    int sequenceIx = 0;
    public:
    Runner(Movement *movement, Pen *pen, Display *display);
    void start();
    void run();
    bool validate();
};
#endif