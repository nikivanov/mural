#ifndef ResumeOrStartOverPhase_h
#define ResumeOrStartOverPhase_h
#include "notsupportedphase.h"
class ResumeOrStartOverPhase : public NotSupportedPhase {
    public:
    void resumeTopDistance(AsyncWebServerRequest *request);
    void startOver(AsyncWebServerRequest *request);
};
#endif