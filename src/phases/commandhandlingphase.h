#ifndef CommandHandlingPhase_h
#define CommandHandlingPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
class CommandHandlingPhase : public NotSupportedPhase {
    private:
    Movement* movement;
    public:
    CommandHandlingPhase(Movement* movement);
    void handleCommand(AsyncWebServerRequest *request);
};
#endif