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
    public:
    RetractBeltsPhase(PhaseManager* manager, Movement* movement);
    void doneWithPhase(AsyncWebServerRequest *request);
    const char* getName();
};
#endif