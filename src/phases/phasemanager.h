#ifndef PhaseManager_H
#define PhaseManager_H
#include "phase.h"
#include "movement.h"
#include "pen.h"
#include "runner.h"
#include <ESPAsyncWebServer.h>
class SvgSelectPhase;
class RetractBeltsPhase;
class PhaseManager {
    private:
    Phase* currentPhase;
    RetractBeltsPhase* retractBeltsPhase;
    Phase* setTopDistancePhase;
    Phase* extendToHomePhase;
    Phase* penCalibrationPhase;
    SvgSelectPhase* svgSelectPhase;
    Phase* beginDrawingPhase;
    Phase* drawingPhase;
    Phase* resumeDrawingPhase;
    Movement* movement;

    // True from the moment a resumable checkpoint is offered (see reset()) until
    // either the offer is discarded or the resume flow hands off to the Drawing
    // phase (see ExtendToHomePhase::loopPhase()). While true, pendingCheckpoint
    // holds the checkpoint being resumed, and RetractBelts/ExtendToHome behave
    // differently (extend to the checkpoint instead of home; see ExtendToHomePhase).
    bool resuming = false;
    Runner::Checkpoint pendingCheckpoint;

    public:
    enum PhaseNames {RetractBelts, SetTopDistance, ExtendToHome, PenCalibration, SvgSelect, BeginDrawing, Drawing, ResumeDrawing};
    PhaseManager(Movement* movement, Pen* pen, Runner* runner);
    Phase* getCurrentPhase();
    void setPhase(PhaseNames name);
    void respondWithState(AsyncWebServerRequest *request);
    // Resets to the normal start of the wizard, unless a resumable checkpoint (from
    // a prior power loss mid-drawing) exists, in which case it offers ResumeDrawing
    // instead.
    void reset();

    bool isResuming();
    Runner::Checkpoint getPendingCheckpoint();
    void clearResuming();
};
#endif
