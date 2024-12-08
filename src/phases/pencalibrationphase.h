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
    public:
    PenCalibrationPhase(PhaseManager* manager, Pen* pen);
    void setServo(AsyncWebServerRequest *request);
    void setPenDistance(AsyncWebServerRequest *request);
    const char* getName();
    
};
#endif