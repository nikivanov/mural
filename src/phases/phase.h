#ifndef Phase_h
#define Phase_h
#include <ESPAsyncWebServer.h>
class Phase {
    public:
    virtual void handleCommand(AsyncWebServerRequest *request) = 0;
    virtual void handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) = 0;
    virtual void setTopDistance(AsyncWebServerRequest *request) = 0;
    virtual void extendToHome(AsyncWebServerRequest *request) = 0;
    virtual void setServo(AsyncWebServerRequest *request) = 0;
    virtual void setPenDistance(AsyncWebServerRequest *request) = 0;
    virtual void resumeTopDistance(AsyncWebServerRequest *request) = 0;
    virtual void run(AsyncWebServerRequest *request) = 0;
    virtual void doneWithPhase(AsyncWebServerRequest *request) = 0;
    virtual void estepsCalibration(AsyncWebServerRequest *request) = 0;
    virtual const char* getName() = 0;
    virtual void loopPhase() = 0;
};
#endif