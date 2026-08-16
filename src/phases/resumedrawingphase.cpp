#include "resumedrawingphase.h"
#include "../runner.h"

ResumeDrawingPhase::ResumeDrawingPhase(PhaseManager* manager, Movement* movement, Pen* pen) {
    this->manager = manager;
    this->movement = movement;
    this->pen = pen;
}

void ResumeDrawingPhase::confirmResume(AsyncWebServerRequest *request) {
    Runner::Checkpoint cp = manager->getPendingCheckpoint();

    // Restore the calibration the checkpointed job was drawn with, so the upcoming
    // RetractBelts -> ExtendToHome flow (reused unchanged from the normal start) has
    // a topDistance to compute against, and so the pen-down angle is correct once
    // the file resumes past the next pen-down command.
    movement->setTopDistance(cp.topDistance);
    pen->setPenDistance(cp.penAngle);

    manager->setPhase(PhaseManager::RetractBelts);
    manager->respondWithState(request);
}

void ResumeDrawingPhase::doneWithPhase(AsyncWebServerRequest *request) {
    Runner::clearCheckpoint();
    manager->reset();
    manager->respondWithState(request);
}

const char* ResumeDrawingPhase::getName() {
    return "ResumeDrawing";
}
