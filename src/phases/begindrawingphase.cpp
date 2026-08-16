#include "begindrawingphase.h"
BeginDrawingPhase::BeginDrawingPhase(PhaseManager* manager, Runner* runner) {
    this->manager = manager;
    this->runner = runner;
}

void BeginDrawingPhase::run(AsyncWebServerRequest *request) {
    if (!runner->start()) {
        String error = runner->getLastError();
        if (error.length() == 0) {
            error = "Not ready";
        }
        request->send(400, "text/plain", error);
        return;
    }

    // The server used to be torn down here (server->end()) because drawing was
    // assumed to be an opaque, unmonitorable operation. It now stays alive for the
    // whole job - see DrawingPhase - so /getState, /events (live progress), and
    // /pauseDrawing/resumeDrawing keep working while the runner streams the
    // command file from loop().
    manager->setPhase(PhaseManager::Drawing);
    manager->respondWithState(request);
}

void BeginDrawingPhase::doneWithPhase(AsyncWebServerRequest *request) {
    manager->reset();
    manager->respondWithState(request);
}

const char* BeginDrawingPhase::getName() {
    return "BeginDrawing";
}
