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

    // The pen may be a different length than when the checkpoint was written -
    // e.g. it was removed/swapped while powered off (docs/multi-color.md). If
    // the user already recalibrated via setPenDistance() below, that live
    // value wins; otherwise fall back to the checkpointed angle exactly as
    // before.
    if (!penDistanceOverridden) {
        pen->setPenDistance(cp.penAngle);
    }

    manager->setPhase(PhaseManager::RetractBelts);
    manager->respondWithState(request);
}

void ResumeDrawingPhase::setPenDistance(AsyncWebServerRequest *request) {
    const AsyncWebParameter* p = request->getParam(0);
    int angle = p->value().toInt();
    pen->setPenDistance(angle);
    if (!pen->slowUp()) {
        request->send(400, "text/plain", "Pen not ready");
        return;
    }
    penDistanceOverridden = true;
    request->send(200, "text/plain", "OK");
}

void ResumeDrawingPhase::doneWithPhase(AsyncWebServerRequest *request) {
    Runner::clearCheckpoint();
    penDistanceOverridden = false;
    manager->reset();
    manager->respondWithState(request);
}

const char* ResumeDrawingPhase::getName() {
    return "ResumeDrawing";
}
