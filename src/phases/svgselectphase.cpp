#include "svgselectphase.h"
#include "LittleFS.h"

SvgSelectPhase::SvgSelectPhase(PhaseManager* manager) {
    this->manager = manager;
}

void SvgSelectPhase::handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
{
    if (!index)
    {
        if (LittleFS.exists("/commands")) {
            LittleFS.remove("/commands");
        }

        Serial.printf("%d bytes total, %d bytes free\n",  LittleFS.totalBytes(), LittleFS.totalBytes() - LittleFS.usedBytes());
        Serial.printf("Upload size: %d bytes\n", request->contentLength());

        if (LittleFS.totalBytes() -  LittleFS.usedBytes() < request->contentLength()) {
            Serial.println("Not enough space on LittleFS");
            request->send(400, "text/plain", "Not enough space for upload");
            return;
        }
            
        request->_tempFile = LittleFS.open("/commands", "w");
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
    }
}

const char* SvgSelectPhase::getName() {
    return "SvgSelect";
}