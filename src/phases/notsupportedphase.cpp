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

void NotSupportedPhase::resumeTopDistance(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::run(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::doneWithPhase(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

void NotSupportedPhase::estepsCalibration(AsyncWebServerRequest *request) {
    handleNotSupported(request);
}

const char* NotSupportedPhase::getName() {
    throw std::invalid_argument("should be overridden");
}

void NotSupportedPhase::handleNotSupported(AsyncWebServerRequest *request) {
    request->send(400, "Request is not supported by the current server phase");
}

void NotSupportedPhase::loopPhase() {
    // don't throw here - most phases dont need to do anything on loop()
}