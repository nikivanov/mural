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
    virtual void isMoving(AsyncWebServerRequest *request) = 0;
    virtual void resumeTopDistance(AsyncWebServerRequest *request) = 0;
    virtual void startOver(AsyncWebServerRequest *request) = 0;
    virtual void run(AsyncWebServerRequest *request) = 0;
};
#endif