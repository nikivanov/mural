#ifndef RetractBelts_h
#define RetractBelts_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "movement.h"
#include "pen.h"
class RetractBeltsPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Movement* movement;
    Pen* pen;
    public:
    RetractBeltsPhase(PhaseManager* manager, Movement* movement, Pen* pen);
    void handleCommand(AsyncWebServerRequest *request);
    void setServo(AsyncWebServerRequest *request);
    void doneWithPhase(AsyncWebServerRequest *request);
    void estepsCalibration(AsyncWebServerRequest *request);
    const char* getName();
};
#endif