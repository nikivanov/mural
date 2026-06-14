#include "begindrawingphase.h"
BeginDrawingPhase::BeginDrawingPhase(PhaseManager* manager, Runner* runner, AsyncWebServer* server) {
    this->manager = manager;
    this->runner = runner;
    this->server = server;
}

void BeginDrawingPhase::run(AsyncWebServerRequest *request) {
    int speed = 800;
    if (request->hasParam("speed", true)) {
        speed = request->getParam("speed", true)->value().toInt();
        speed = max(300, min(3000, speed));
    }
    runner->start(speed);
    request->send(200, "text/plain", "OK"); 
    server->end();
}

void BeginDrawingPhase::doneWithPhase(AsyncWebServerRequest *request) {
    manager->reset();
    manager->respondWithState(request);
}

const char* BeginDrawingPhase::getName() {
    return "BeginDrawing";
}