#ifndef SvgSelectPhase_h
#define SvgSelectPhase_h
#include "notsupportedphase.h"
class SvgSelectPhase : public NotSupportedPhase {
    public:
    void handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
    void run(AsyncWebServerRequest *request);
};
#endif