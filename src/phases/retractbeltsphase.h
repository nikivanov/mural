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
    Pen* pen;
    public:
    RetractBeltsPhase(PhaseManager* manager, Movement* movement, Pen* pen);
    void setServo(AsyncWebServerRequest *request);
    void doneWithPhase(AsyncWebServerRequest *request);
    void estepsCalibration(AsyncWebServerRequest *request);
    const char* getName();
};
#endif