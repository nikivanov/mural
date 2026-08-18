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
    virtual void installTestPattern(AsyncWebServerRequest *request) = 0;
    // Pause/resume primitive (generalized - see docs/multi-color.md section 4): only
    // meaningful during the Drawing phase, 400s everywhere else via NotSupportedPhase.
    virtual void pauseDrawing(AsyncWebServerRequest *request) = 0;
    virtual void resumeDrawing(AsyncWebServerRequest *request) = 0;
    // Confirms a resume-after-power-loss offer (see ResumeDrawingPhase); discarding it
    // reuses the existing generic doneWithPhase().
    virtual void confirmResume(AsyncWebServerRequest *request) = 0;
    // Confirms a multi-color pen swap (docs/multi-color.md sections 2-3): only
    // meaningful during the Drawing phase while Runner::isAwaitingPenSwap() is true,
    // 400s everywhere else via NotSupportedPhase's default.
    virtual void confirmPenSwap(AsyncWebServerRequest *request) = 0;
    virtual const char* getName() = 0;
    virtual void loopPhase() = 0;
};
#endif