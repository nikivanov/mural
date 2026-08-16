#ifndef Runner_h
#define Runner_h
#include "movement.h"
#include "tasks/task.h"
#include "pen.h"
#include "display.h"
#include "LittleFS.h"
#include <ESPAsyncWebServer.h>
class PenSwapTask;
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
        // Whether the pen was down (mid-stroke) at the moment this checkpoint was
        // written. Restoring this on resume matters: without it, a power loss
        // mid-stroke resumes with the pen up and silently skips drawing the rest
        // of that stroke (up to checkpointIntervalLines worth of it) until the
        // next p1. See beginResume()'s hand-off ordering.
        bool penDown;
        // Multi-color (docs/multi-color.md): which pen was mounted at the moment
        // this checkpoint was written - 1-based, matching `c<index>`/`n<index>`.
        // Defaults to 1/"" for single-color files (see writeCheckpoint()), so old
        // checkpoints (written before this field existed - loadCheckpoint() reads
        // them back as 1/"" too) and single-color jobs behave exactly as before:
        // the resume offer only mentions a pen at all when colorName is non-empty.
        int colorIndex;
        String colorName;
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

    // Multi-color palette metadata, parsed from the command file's optional
    // `n<index> <name>` headers (see docs/multi-color.md section 2) by
    // parseCommandFileHeader(). Index 0 holds palette color 1, etc.
    // paletteCount is how many entries were actually parsed (0 for a
    // single-color file with no `n` headers at all).
    static const int maxPaletteColors = 8;
    String palette[maxPaletteColors];
    int paletteCount = 0;

    // True whenever the current task is a PenSwapTask blocked waiting for
    // /confirmPenSwap (see notifyPenSwapWaiting()/confirmPenSwap() below).
    bool awaitingSwap = false;
    int awaitingSwapColorIndex = 0;
    String awaitingSwapName;

    // Multi-color (docs/multi-color.md): which pen is currently mounted, i.e.
    // active as of the most recently *completed* swap (or 1, the pen the job
    // started with, if none yet) - not the pen a pending-but-unconfirmed swap
    // is asking for, since the old pen is still physically mounted until
    // confirmPenSwap() runs. Checkpointed by writeCheckpoint() so a resume
    // offer can tell the user which pen must be inserted (see
    // PhaseManager::respondWithState()).
    int currentColorIndex = 1;

    // Reads the mandatory d/h header, the optional t<mm> pin-distance header,
    // and the optional `n<index> <name>` palette headers (added by
    // toCommands.ts, in that order, after d/h; older command files won't have
    // t or n) from an open command file, leaving the file positioned at the
    // first command line. Sets totalDistanceOut from the d line. If a t line
    // is present, hasTopDistanceOut is set true and topDistanceOut holds its
    // value, so instance callers (which have a Movement pointer) can validate
    // it against the current setup; static callers that don't care about
    // validation (see countTotalCommandLines()) can just ignore the
    // out-params. paletteNamesOut (size maxPaletteColors) and paletteCountOut
    // receive any parsed `n<index> <name>` lines; pass paletteNamesOut as
    // nullptr to skip storing them (paletteCountOut is still set). Returns
    // false only if d or h is missing/malformed. Shared by initTaskProvider()
    // and beginResume() so the two don't duplicate header parsing.
    static bool parseCommandFileHeader(File& file, double& totalDistanceOut, bool& hasTopDistanceOut, double& topDistanceOut, String* paletteNamesOut, int& paletteCountOut);

    public:
    // Set by initTaskProvider() when start()/dryRun() returns false, so the
    // caller (BeginDrawingPhase) can surface a specific reason instead of a
    // generic "Not ready". Empty when no specific reason was recorded.
    String lastError;

    Runner(Movement *movement, Pen *pen, Display *display);
    bool start();
    void run();
    void dryRun();
    String getLastError();

    // Live status (see /events SSE stream, wired in main.cpp).
    void setEventSource(AsyncEventSource *events);
    void buildProgressJson(char* buffer, size_t bufferSize, const char* stateOverride = nullptr);

    // Pause/resume primitive, generalized beyond just power-loss recovery (see
    // docs/multi-color.md section 4) - also used by /pauseDrawing, /resumeDrawing,
    // and (once TMC UART stall detection is enabled) automatically on a stall.
    void pause();
    void resumeRun();
    bool isPaused();

    // Multi-color pen swap (docs/multi-color.md sections 2-3). Called by
    // PenSwapTask once it finishes lifting the pen and travelling to the swap
    // station, to record which pen to prompt for and push the OLED/SSE
    // notification - built on the same live-status infrastructure as ordinary
    // drawing progress (buildProgressJson()/pushProgressEvent()), rather than
    // a parallel notification channel.
    void notifyPenSwapWaiting(int colorIndex, String name);
    // True whenever a PenSwapTask is blocked awaiting /confirmPenSwap - gates
    // DrawingPhase::setPenDistance() (recalibrating the newly-inserted pen)
    // and is what confirmPenSwap()/applyPenDistanceDuringSwap() require.
    bool isAwaitingPenSwap();
    // Applies a new pen-down angle while a swap is pending, mirroring
    // PenCalibrationPhase::setPenDistance()'s persistence, without switching
    // phases (the server stays in DrawingPhase for the whole job - see
    // docs/multi-color.md section 4 and drawingphase.h). Returns false (and
    // does nothing) if no swap is pending or the pen isn't ready.
    bool applyPenDistanceDuringSwap(int angle);
    // Unblocks the pending PenSwapTask so Runner::run() advances to the next
    // command file line on its next tick. Returns false if no swap is
    // pending.
    bool confirmPenSwap();

    // Resume-after-power-loss: reopens /commands, seeks to the checkpointed offset,
    // restores executedLines/totalLines so progress reporting is correct, and starts
    // feeding tasks again. Movement must already be homed to the checkpoint's (x, y)
    // (see ExtendToHomePhase) before calling this - the pen is only lowered (if
    // cp.penDown) once that travel is complete and confirmed, never during it.
    bool beginResume(const Checkpoint& cp);

    static bool loadCheckpoint(Checkpoint& out);
    static void clearCheckpoint();
    // Counts command lines (post-header) in /commands without disturbing any open
    // Runner file handle - used to compute a resume-offer percentage before a
    // Runner instance has (re)opened the file itself.
    static int countTotalCommandLines();
};
#endif
