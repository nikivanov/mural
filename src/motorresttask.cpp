#include "motorresttask.h"
#include "pen.h"
MotorRestTask::MotorRestTask(Movement *movement, Display *display, Pen *pen, int progress) {
    this->movement = movement;
    this->display = display;
    this->pen = pen;
    this->progress = progress;
}

void MotorRestTask::startRunning() {
    if (pen->isDown()) {
        Serial.println("Pen is down, raising for motor cooldown");
        penDownAfterRest = true;
        pen->slowUp();
    }
    
    movement->disableMotors();
    display->displayText("Motor cooldown");
    startTime = millis();
}

bool MotorRestTask::isDone() {
    delay(100);
    auto done = (millis() - startTime) / 1000 >= REST_SECONDS;
    if (done && penDownAfterRest) {
        Serial.println("Restoring pen down state");
        pen->slowDown();
    }

    if (done) {
        display->displayText(String(progress) + "%");
    } 
    
    return done;
}