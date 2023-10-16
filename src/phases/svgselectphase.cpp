#include "svgselectphase.h"
#include "SPIFFS.h"

SvgSelectPhase::SvgSelectPhase(PhaseManager* manager, Runner* runner, AsyncWebServer* server) {
    this->manager = manager;
    this->runner = runner;
    this->server = server;
}

void SvgSelectPhase::handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    if (!index) {
        request->_tempFile = SPIFFS.open("/commands", "w");
        Serial.println("Upload started");
    }
    
    if (len) {
      // stream the incoming chunk to the opened file
      request->_tempFile.write(data, len);
    }

    if (final) {
      request->_tempFile.close();
      Serial.println("Upload finished");
      auto validationResult = runner->validate();
      if (validationResult) {
        Serial.println("Validation passed");
        request->send(200, "text/plain", "OK");
      } else {
        Serial.println("Validation failed");
        request->send(400, "text/plain", "Validation failed");
      }
      
    }
}

void SvgSelectPhase::run(AsyncWebServerRequest *request) {
    runner->start();
    request->send(200, "text/plain", "OK"); 
    server->end();
}

const char* SvgSelectPhase::getName() {
    return "SvgSelect";
}