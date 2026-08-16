#ifndef ResumeDrawingPhase_h
#define ResumeDrawingPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "../movement.h"
#include "../pen.h"
// Entered on boot instead of SetTopDistance when a resumable checkpoint from a prior
// power loss exists (see PhaseManager::reset()). Offers "resume" or "discard"; the
// stored belt position is not trusted (belts may have back-driven while unpowered),
// so resuming re-runs the same manual RetractBelts -> ExtendToHome flow used at the
// start of every job, just extending to the checkpointed (x, y) instead of home (see
// ExtendToHomePhase) and then handing off into the Drawing phase instead of
// PenCalibration.
class ResumeDrawingPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Movement* movement;
    Pen* pen;
    public:
    ResumeDrawingPhase(PhaseManager* manager, Movement* movement, Pen* pen);
    void confirmResume(AsyncWebServerRequest *request);
    // Discard: reuses the generic "done with this phase, move on" semantics to clear
    // the checkpoint and fall through to the normal SetTopDistance start.
    void doneWithPhase(AsyncWebServerRequest *request);
    const char* getName();
};
#endif
