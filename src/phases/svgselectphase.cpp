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

// Installs the canned calibration test pattern (bundled as a static asset at
// data/calibrationPattern.txt, i.e. LittleFS "/calibrationPattern.txt") as the active
// /commands file, then advances the phase machine exactly like a normal upload does.
void SvgSelectPhase::installTestPattern(AsyncWebServerRequest *request) {
    if (!LittleFS.exists("/calibrationPattern.txt")) {
        request->send(404, "text/plain", "Calibration pattern asset missing");
        return;
    }

    if (LittleFS.exists("/commands")) {
        LittleFS.remove("/commands");
    }

    File source = LittleFS.open("/calibrationPattern.txt", "r");
    File dest = LittleFS.open("/commands", "w");

    uint8_t buffer[512];
    while (source.available()) {
        size_t bytesRead = source.read(buffer, sizeof(buffer));
        dest.write(buffer, bytesRead);
    }

    source.close();
    dest.close();

    Serial.println("Installed calibration test pattern");
    manager->setPhase(PhaseManager::RetractBelts);
    manager->respondWithState(request);
}

const char* SvgSelectPhase::getName() {
    return "SvgSelect";
}