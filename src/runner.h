#ifndef Runner_h
#define Runner_h
#include "movement.h"
#include "tasks/task.h"
#include "pen.h"
#include "display.h"
#include "LittleFS.h"
#include <ESPAsyncWebServer.h>
class Runner {
    public:
    // Snapshot of everything needed to resume a drawing after a power loss.
    // Persisted to NVS (see prefskeys.h) before executing each command line -
    // write-before-execute means the checkpoint can be at most
    // checkpointIntervalLines behind the true physical position, never ahead
    // of it, so resuming re-executes (at most) that many already-drawn,
    // sub-mm segments rather than skipping any.
    struct Checkpoint {
        uint32_t offset;
        int executedLines;
        double x;
        double y;
        int topDistance;
        int penAngle;
    };

    private:
    Movement *movement;
    Pen *pen;
    Display *display;
    AsyncEventSource *events = nullptr;
    unsigned long lastEventMillis = 0;
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

    // Pause/resume primitive (see docs/multi-color.md section 4). pauseRequested is
    // set by pause() and honored at the next task boundary (i.e. once the in-flight
    // task finishes) so a pause never cuts a movement short; paused is the resulting
    // "feeding stopped, pen lifted" state, cleared by resumeRun().
    bool pauseRequested = false;
    bool paused = false;
    bool penWasDownAtPause = false;
#ifdef MURAL_TMC_UART
    // UNTESTED ON HARDWARE: true while the current pause was caused by a detected
    // stall rather than a manual/API pause request - reported as a distinct "stalled"
    // state over SSE, and resumeRun() retries the interrupted move instead of
    // advancing to the next command file line.
    bool pausedDueToStall = false;
#endif

    // NVS checkpoint write cadence: every N lines (to limit flash wear) and, in
    // addition, on every pen up/down line regardless of N (see getNextTask()).
    static const int checkpointIntervalLines = 20;
    void writeCheckpoint(uint32_t offset);

    const char* getStateName();
    void pushProgressEvent(bool force, const char* stateOverride = nullptr);

    public:
    Runner(Movement *movement, Pen *pen, Display *display);
    bool start();
    void run();
    void dryRun();

    // Live status (see /events SSE stream, wired in main.cpp).
    void setEventSource(AsyncEventSource *events);
    void buildProgressJson(char* buffer, size_t bufferSize, const char* stateOverride = nullptr);

    // Pause/resume primitive, generalized beyond just power-loss recovery (see
    // docs/multi-color.md section 4) - also used by /pauseDrawing, /resumeDrawing,
    // and (once TMC UART stall detection is enabled) automatically on a stall.
    void pause();
    void resumeRun();
    bool isPaused();

    // Resume-after-power-loss: reopens /commands, seeks to the checkpointed offset,
    // restores executedLines/totalLines so progress reporting is correct, and starts
    // feeding tasks again. Movement must already be homed to the checkpoint's (x, y)
    // (see ExtendToHomePhase) before calling this.
    bool beginResume(const Checkpoint& cp);

    static bool loadCheckpoint(Checkpoint& out);
    static void clearCheckpoint();
    // Counts command lines (post d/h header) in /commands without disturbing any
    // open Runner file handle - used to compute a resume-offer percentage before a
    // Runner instance has (re)opened the file itself.
    static int countTotalCommandLines();
};
#endif