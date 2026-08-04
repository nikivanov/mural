#include "svgselectphase.h"
#include "SD.h"

SvgSelectPhase::SvgSelectPhase(PhaseManager* manager) {
    this->manager = manager;
}

void SvgSelectPhase::handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
{
    if (!index)
    {
        if (SD.exists("/commands")) {
            SD.remove("/commands");
        }

        Serial.printf("%d bytes total, %d bytes free\n",  SD.totalBytes(), SD.totalBytes() - SD.usedBytes());
        Serial.printf("Upload size: %d bytes\n", request->contentLength());

        if (SD.totalBytes() -  SD.usedBytes() < request->contentLength()) {
            Serial.println("Not enough space on SD card");
            request->send(400, "text/plain", "Not enough space for upload");
            return;
        }

        request->_tempFile = SD.open("/commands", "w");
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
        manager->updateFreeKb();
        manager->setPhase(PhaseManager::RetractBelts);
    }
}

const char* SvgSelectPhase::getName() {
    return "SvgSelect";
}