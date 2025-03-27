#ifndef SetDistancePhase_h
#define SetDistancePhase_h
#include "commandhandlingphase.h"
#include "phasemanager.h"
#include "movement.h"
class SetTopDistancePhase : public CommandHandlingPhase {
    private:
    PhaseManager* manager;
    Movement* movement;
    Pen* pen;
    public:
    SetTopDistancePhase(PhaseManager* manager, Movement* movement, Pen* pen);
    void setTopDistance(AsyncWebServerRequest *request);
    void setServo(AsyncWebServerRequest *request);
    void estepsCalibration(AsyncWebServerRequest *request);
    const char* getName();
};
#endif