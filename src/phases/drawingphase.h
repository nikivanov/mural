#ifndef DrawingPhase_h
#define DrawingPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "../runner.h"
// Active for the whole duration of a drawing job. Unlike BeginDrawing (which the
// firmware used to sit in with the web server torn down - see server->end() removal
// in begindrawingphase.cpp), the server stays fully alive here: /getState and the
// /events SSE stream keep working, and every other mutating endpoint 400s via
// NotSupportedPhase's defaults except the two overridden below.
class DrawingPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Runner* runner;
    public:
    DrawingPhase(PhaseManager* manager, Runner* runner);
    void pauseDrawing(AsyncWebServerRequest *request);
    void resumeDrawing(AsyncWebServerRequest *request);
    const char* getName();
};
#endif
