#ifndef PenCalibrationPhase_h
#define PenCalibrationPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "pen.h"
#include "movement.h"
#include "display.h"

class PenCalibrationPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Pen* pen;
    Movement* movement;
    Display* display;
    public:
    PenCalibrationPhase(PhaseManager* manager, Pen* pen, Movement* movement, Display* display);
    void handleCommand(AsyncWebServerRequest *request);
    void setServo(AsyncWebServerRequest *request);
    void setPenDistance(AsyncWebServerRequest *request);
    const char* getName();
};
#endif
