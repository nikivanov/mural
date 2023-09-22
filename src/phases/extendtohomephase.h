#ifndef ExtendToHomePhase_h
#define ExtendToHomePhase_h
#include "notsupportedphase.h"
class ExtendToHomePhase : public NotSupportedPhase {
    public:
    void extendToHome(AsyncWebServerRequest *request);
};
#endif