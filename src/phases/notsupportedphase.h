#ifndef NotSupportedPhase_h
#define NotSupportedPhase_h
#include "phase.h"
class NotSupportedPhase : public Phase {
    private:
    void handleNotSupported(AsyncWebServerRequest *request);
    public:
    void handleCommand(AsyncWebServerRequest *request);
    void handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
    void setTopDistance(AsyncWebServerRequest *request);
    void extendToHome(AsyncWebServerRequest *request);
    void setServo(AsyncWebServerRequest *request);
    void setPenDistance(AsyncWebServerRequest *request);
    void resumeTopDistance(AsyncWebServerRequest *request);
    void run(AsyncWebServerRequest *request);
    void doneWithPhase(AsyncWebServerRequest *request);
    void estepsCalibration(AsyncWebServerRequest *request);
    const char* getName();
    void loopPhase();
};
#endif