#ifndef SvgSelectPhase_h
#define SvgSelectPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "runner.h"
class SvgSelectPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Runner* runner;
    AsyncWebServer* server;
    public:
    SvgSelectPhase(PhaseManager* manager, Runner* runner, AsyncWebServer* server);
    void handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
    void run(AsyncWebServerRequest *request);
    const char* getName();
};
#endif