#ifndef SvgSelectPhase_h
#define SvgSelectPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
class SvgSelectPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    public:
    SvgSelectPhase(PhaseManager* manager);
    void handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
    const char* getName();
};
#endif