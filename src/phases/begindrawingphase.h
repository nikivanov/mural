#ifndef BeginDrawingPhase_h
#define BeginDrawingPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
class BeginDrawingPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Runner* runner;
    AsyncWebServer* server;
    public:
    BeginDrawingPhase(PhaseManager* manager, Runner* runner, AsyncWebServer* server);
    const char* getName();
    void run(AsyncWebServerRequest *request);
    void doneWithPhase(AsyncWebServerRequest *request);
};
#endif