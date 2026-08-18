#ifndef ExtendToHomePhase_h
#define ExtendToHomePhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "movement.h"
#include "../runner.h"
class ExtendToHomePhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Movement* movement;
    Runner* runner;
    public:
    ExtendToHomePhase(PhaseManager* manager, Movement* movement, Runner* runner);
    void extendToHome(AsyncWebServerRequest *request);
    const char* getName();
    void loopPhase();
};
#endif
