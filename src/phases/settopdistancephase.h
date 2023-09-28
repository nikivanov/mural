#ifndef SetDistancePhase_h
#define SetDistancePhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
#include "movement.h"
class SetTopDistancePhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    Movement* movement;
    public:
    SetTopDistancePhase(PhaseManager* manager, Movement* movement);
    void setTopDistance(AsyncWebServerRequest *request);
    const char* getName();
};
#endif