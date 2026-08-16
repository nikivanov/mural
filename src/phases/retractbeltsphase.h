#ifndef RetractBelts_h
#define RetractBelts_h
#include "commandhandlingphase.h"
#include "phasemanager.h"
#include "movement.h"
#include "pen.h"
class RetractBeltsPhase : public CommandHandlingPhase {
    private:
    PhaseManager* manager;
    Movement* movement;
#ifdef MURAL_TMC_UART
    bool startedAutoRetract = false;
#endif
    public:
    RetractBeltsPhase(PhaseManager* manager, Movement* movement);
    void doneWithPhase(AsyncWebServerRequest *request);
    const char* getName();
#ifdef MURAL_TMC_UART
    void loopPhase();
#endif
};
#endif