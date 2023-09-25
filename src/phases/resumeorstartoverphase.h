#ifndef ResumeOrStartOverPhase_h
#define ResumeOrStartOverPhase_h
#include "notsupportedphase.h"
#include "movement.h"
#include "phasemanager.h"
class ResumeOrStartOverPhase : public NotSupportedPhase {
    private:
    Movement* movement;
    PhaseManager* manager;
    public:
    ResumeOrStartOverPhase(PhaseManager* manager, Movement* movement);
    void resumeTopDistance(AsyncWebServerRequest *request);
    void doneWithPhase(AsyncWebServerRequest *request);
    const char* getName();
};
#endif