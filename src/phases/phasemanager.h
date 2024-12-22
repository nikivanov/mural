#ifndef PhaseManager_H
#define PhaseManager_H
#include "phase.h"
#include "movement.h"
#include "pen.h"
#include "runner.h"
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
    public:
    enum PhaseNames {RetractBelts, SetTopDistance, ExtendToHome, PenCalibration, SvgSelect, BeginDrawing};
    PhaseManager(Movement* movement, Pen* pen, Runner* runner, AsyncWebServer* server);
    Phase* getCurrentPhase();
    void setPhase(PhaseNames name);
    void respondWithState(AsyncWebServerRequest *request);
    void reset();
};
#endif