#ifndef RetractBelts_h
#define RetractBelts_h
#include "notsupportedphase.h"
class RetractBeltsPhase : public NotSupportedPhase {
    public:
    void handleCommand(AsyncWebServerRequest *request);
};
#endif