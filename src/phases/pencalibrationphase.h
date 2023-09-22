#ifndef PenCalibrationPhase_h
#define PenCalibrationPhase_h
#include "notsupportedphase.h"
class PenCalibrationPhase : public NotSupportedPhase {
    public:
    void setServo(AsyncWebServerRequest *request);
    void setPenDistance(AsyncWebServerRequest *request);
};
#endif