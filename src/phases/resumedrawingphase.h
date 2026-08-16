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
    // True once setPenDistance() has been called on this resume offer - the
    // user may have re-inserted a different-length pen (docs/multi-color.md's
    // checkpoint-color follow-up), so their live recalibration should win
    // over the checkpointed angle in confirmResume() rather than being
    // clobbered by it.
    bool penDistanceOverridden = false;
    public:
    ResumeDrawingPhase(PhaseManager* manager, Movement* movement, Pen* pen);
    void confirmResume(AsyncWebServerRequest *request);
    // Lets the user recalibrate before resuming (they may have swapped pens
    // while it was powered off) - unlike PenCalibrationPhase's version, this
    // doesn't advance the wizard; it just applies immediately and remembers
    // that it was touched, same shape as DrawingPhase's pen-swap variant.
    void setPenDistance(AsyncWebServerRequest *request);
    // Discard: reuses the generic "done with this phase, move on" semantics to clear
    // the checkpoint and fall through to the normal SetTopDistance start.
    void doneWithPhase(AsyncWebServerRequest *request);
    const char* getName();
};
#endif
