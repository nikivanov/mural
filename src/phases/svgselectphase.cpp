#include "svgselectphase.h"
#include "SD.h"

SvgSelectPhase::SvgSelectPhase(PhaseManager* manager) {
    this->manager = manager;
}

// Upload is done in chunks
void SvgSelectPhase::handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final)
{
    if (!index)
    {
        size_t offset = request->hasParam("offset")
            ? strtoul(request->getParam("offset")->value().c_str(), nullptr, 10)
            : 0;
        isLastChunk = request->hasParam("final") && request->getParam("final")->value() == "true";

        if (offset == 0)
        {
            if (SD.exists("/commands")) {
                SD.remove("/commands");
            }

            size_t totalBytes = request->hasParam("totalBytes")
                ? strtoul(request->getParam("totalBytes")->value().c_str(), nullptr, 10)
                : request->contentLength();

            Serial.printf("%d bytes total, %d bytes free\n",  SD.totalBytes(), SD.totalBytes() - SD.usedBytes());
            Serial.printf("Upload size: %d bytes\n", totalBytes);

            if (SD.totalBytes() -  SD.usedBytes() < totalBytes) {
                Serial.println("Not enough space on SD card");
                request->send(400, "text/plain", "Not enough space for upload");
                return;
            }

            request->_tempFile = SD.open("/commands", "w");
            Serial.println("Upload started");
        }
        else
        {
            request->_tempFile = SD.open("/commands", "r+");
            if (!request->_tempFile || !request->_tempFile.seek(offset)) {
                Serial.println("Failed to seek to chunk offset, ask client to restart upload");
                request->send(409, "text/plain", "Upload out of order, restart upload");
                return;
            }
        }
    }

    if (len)
    {
        // stream the incoming chunk to the opened file
        request->_tempFile.write(data, len);
    }

    if (final)
    {
        request->_tempFile.close();
        if (isLastChunk) {
            Serial.println("Upload finished");
            manager->updateFreeKb();
            manager->setPhase(PhaseManager::RetractBelts);
        }
    }
}

const char* SvgSelectPhase::getName() {
    return "SvgSelect";
}