#include "phasemanager.h"
#include "resumeorstartoverphase.h"
#include "retractbeltsphase.h"
#include "settopdistancephase.h"
#include "extendtohomephase.h"
#include "pencalibrationphase.h"
#include "svgselectphase.h"
#include <stdexcept>
PhaseManager::PhaseManager(Movement* movement, Pen* pen, Runner* runner, AsyncWebServer* server) {
    resumeOrStartOverPhase = new ResumeOrStartOverPhase(this, movement);
    retractBeltsPhase = new RetractBeltsPhase(this, movement, pen);
    setTopDistancePhase = new SetTopDistancePhase(this, movement);
    extendToHomePhase = new ExtendToHomePhase(this, movement);
    penCalibrationPhase = new PenCalibrationPhase(this, pen);
    svgSelectPhase = new SvgSelectPhase(this, runner, server);
}

Phase* PhaseManager::getCurrentPhase() {
    return currentPhase;
}

void PhaseManager::setPhase(PhaseNames name) {
    switch (name) {
        case PhaseNames::ResumeOrStartOver:
            currentPhase = resumeOrStartOverPhase;
            break;
        case PhaseNames::RetractBelts:
            currentPhase = retractBeltsPhase;
            break;
        case PhaseNames::SetTopDistance:
            currentPhase = setTopDistancePhase;
            break;
        case PhaseNames::ExtendToHome:
            currentPhase = extendToHomePhase;
            break;
        case PhaseNames::PenCalibration:
            currentPhase = penCalibrationPhase;
            break;
        case PhaseNames::SvgSelect:
            currentPhase = svgSelectPhase;
            break;
        default:
            throw std::invalid_argument("Invalid Phase");
    }
}