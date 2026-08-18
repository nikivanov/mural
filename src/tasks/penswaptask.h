#ifndef PenSwapTask_h
#define PenSwapTask_h
#include "task.h"
#include "interpolatingmovementtask.h"
#include "../pen.h"
#include "../movement.h"
#include "../display.h"
class Runner;

// Multi-color pen swap (docs/multi-color.md sections 2-3): dequeued by
// Runner::getNextTask() when it reads a `c<index>` command-file line.
// Sequence: lift the pen, travel to the swap station (home position), show
// an OLED prompt naming the pen to insert, then block - via isDone()
// returning false, same "poll state from loop() instead of blocking in
// place" shape ExtendToHomePhase::loopPhase() already uses - until an HTTP
// handler (DrawingPhase::confirmPenSwap(), wired to POST /confirmPenSwap)
// confirms it. Runner::run()'s ordinary task-boundary loop drives all of
// this already; no separate pause/resume call is needed here; Runner's
// awaitingSwap bookkeeping (set via notifyPenSwapWaiting()) is what
// getStateName()/buildProgressJson() surface over /getState and the /events
// SSE stream while this task is blocked.
class PenSwapTask : public Task {
    private:
    const char* NAME = "PenSwapTask";
    Pen *pen;
    Runner *runner;
    int colorIndex;
    String penName;
    enum State { Traveling, AwaitingConfirmation, Confirmed };
    State state = Traveling;
    InterpolatingMovementTask *travelTask;
    bool confirmed = false;

    public:
    PenSwapTask(Pen *pen, Movement *movement, Runner *runner, int colorIndex, String penName);
    ~PenSwapTask();
    void startRunning();
    bool isDone();
    // Called by Runner::confirmPenSwap() once the human has swapped the pen
    // and (optionally) recalibrated it - lets the next isDone() call return
    // true so Runner::run() moves on to the next command file line.
    void confirm();
    bool isAwaitingConfirmation();
    const char* name() {
        return NAME;
    }
};
#endif
