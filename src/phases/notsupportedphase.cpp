#include "notsupportedphase.h"
void NotSupportedPhase::handleCommand(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    handleNotSupported(request);
}

void NotSupportedPhase::setTopDistance(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::extendToHome(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::setServo(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::setPenDistance(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::isMoving(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::resumeTopDistance(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::startOver(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::run(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::handleNotSupported(AsyncWebServerRequest *request) {
    request->send(400, "Request is not supported by the current server phase");
}
