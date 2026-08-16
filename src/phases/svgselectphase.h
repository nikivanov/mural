#ifndef SvgSelectPhase_h
#define SvgSelectPhase_h
#include "notsupportedphase.h"
#include "phasemanager.h"
class SvgSelectPhase : public NotSupportedPhase {
    private:
    PhaseManager* manager;
    uint32_t crcState;
    uint32_t lastUploadCrc32 = 0;
    public:
    SvgSelectPhase(PhaseManager* manager);
    void handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
    const char* getName();
    // CRC32 of the most recently completed upload, streamed incrementally while
    // the file was written to LittleFS. Used by the client to verify the upload
    // without re-downloading and diffing the whole file.
    uint32_t getUploadCrc32();
};
#endif