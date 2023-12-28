#ifndef ExtendToHomePhase_h
#define ExtendToHomePhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "movement.h"
class ExtendToHomePhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Movement* movement;
    public:
    ExtendToHomePhase(PhaseManager* manager, Movement* movement);
    void extendToHome(AsyncWebServerRequest *request);
    const char* getName();
    void loopPhase();
};
#endif