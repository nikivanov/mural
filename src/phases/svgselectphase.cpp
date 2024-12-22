#include "svgselectphase.h"
#include "SPIFFS.h"

SvgSelectPhase::SvgSelectPhase(PhaseManager* manager) {
    this->manager = manager;
}

void SvgSelectPhase::handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
{
    if (!index)
    {
        request->_tempFile = SPIFFS.open("/commands", "w");
        Serial.println("Upload started");
    }

    if (len)
    {
        // stream the incoming chunk to the opened file
        request->_tempFile.write(data, len);
    }

    if (final)
    {
        request->_tempFile.close();
        Serial.println("Upload finished");
        manager->setPhase(PhaseManager::RetractBelts);
        manager->respondWithState(request);
    }
}

const char* SvgSelectPhase::getName() {
    return "SvgSelect";
}