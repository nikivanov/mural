#ifndef PhaseManager_H
#define PhaseManager_H
#include "phase.h"
#include "movement.h"
#include "pen.h"
#include "runner.h"
#include "display.h"
#include <ESPAsyncWebServer.h>
class PhaseManager {
    private:
    Phase* currentPhase;
    Phase* retractBeltsPhase;
    Phase* setTopDistancePhase;
    Phase* extendToHomePhase;
    Phase* penCalibrationPhase;
    Phase* svgSelectPhase;
    Phase* beginDrawingPhase;
    Movement* movement;
    Display* display;
    int cachedFreeKb;
    public:
    enum PhaseNames {RetractBelts, SetTopDistance, ExtendToHome, PenCalibration, SvgSelect, BeginDrawing};
    PhaseManager(Movement* movement, Pen* pen, Runner* runner, AsyncWebServer* server, Display* display);
    Phase* getCurrentPhase();
    void setPhase(PhaseNames name);
    void respondWithState(AsyncWebServerRequest *request);
    void updateFreeKb();
    void reset();
};
#endif