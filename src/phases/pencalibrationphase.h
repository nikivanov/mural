#ifndef PenCalibrationPhase_h
#define PenCalibrationPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "pen.h"
#include "movement.h"

class PenCalibrationPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Pen* pen;
    Movement* movement;
    bool jogInitialized;
    double jogX;
    double jogY;
    public:
    PenCalibrationPhase(PhaseManager* manager, Pen* pen, Movement* movement);
    void handleCommand(AsyncWebServerRequest *request);
    void setServo(AsyncWebServerRequest *request);
    void setPenDistance(AsyncWebServerRequest *request);
    const char* getName();
};
#endif
