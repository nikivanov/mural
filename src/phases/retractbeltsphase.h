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
    bool autoRetractRequested = false;
    bool startedAutoRetract = false;
    bool leftRetracted = false;
    bool rightRetracted = false;
#endif
    public:
    RetractBeltsPhase(PhaseManager* manager, Movement* movement);
    void doneWithPhase(AsyncWebServerRequest *request);
    const char* getName();
    void handleCommand(AsyncWebServerRequest *request);
    // "idle" | "retracting" | "retracted", used to populate leftRetract /
    // rightRetract in /getState. See retractbeltsphase.cpp for how each
    // value is derived in manual vs. (optional, MURAL_TMC_UART) auto mode.
    const char* getLeftStatus();
    const char* getRightStatus();
#ifdef MURAL_TMC_UART
    void loopPhase();
#endif
};
#endif
