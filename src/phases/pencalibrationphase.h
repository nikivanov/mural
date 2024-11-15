#ifndef PenCalibrationPhase_h
#define PenCalibrationPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "pen.h"
class PenCalibrationPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Pen* pen;
    Runner* runner;
    AsyncWebServer* server;
    public:
    PenCalibrationPhase(PhaseManager* manager, Pen* pen, Runner* runner, AsyncWebServer* server);
    void setServo(AsyncWebServerRequest *request);
    void setPenDistance(AsyncWebServerRequest *request);
    const char* getName();
    void run(AsyncWebServerRequest *request);
};
#endif