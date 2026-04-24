#include "pen.h"
#include <LittleFS.h>
#include <ArduinoJson.h>

static const char* PEN_CONFIG_PATH = "/pen_config.json";

bool shouldStop(int currentDegree, int targetDegree, bool positive) {
    if (positive) {
        return currentDegree > targetDegree;
    } else {
        return currentDegree < targetDegree;
    }
}

void doSlowMove(Pen* pen, int startDegree, int targetDegree, int speedDegPerSec) {
    if (startDegree == targetDegree) {
        return;
    }

    auto startTime = millis();

    bool positive;
    if (targetDegree > startDegree) {
        positive = true;
    } else {
        positive = false;
    }

    auto currentDegree = startDegree;

    while (!(shouldStop(currentDegree, targetDegree, positive))) {
        pen->setRawValue(currentDegree);
        delay(10);

        auto currentTime = millis();
        auto deltaTime = currentTime - startTime;
        auto progressDegrees = int(double(deltaTime) / 1000 * speedDegPerSec);

        if (!positive) {
            progressDegrees = progressDegrees * -1;
        }

        currentDegree = startDegree + progressDegrees;
    }
    pen->setRawValue(targetDegree);
    delay(200);
}


Pen::Pen()
{
    servo = new Servo();
    servo->attach(8);

    if (LittleFS.exists(PEN_CONFIG_PATH)) {
        File f = LittleFS.open(PEN_CONFIG_PATH, "r");
        if (f) {
            DynamicJsonBuffer buf;
            JsonObject& cfg = buf.parseObject(f);
            if (cfg.success()) {
                if (cfg.containsKey("upAngle"))   penUpAngle  = (int)cfg["upAngle"];
                if (cfg.containsKey("downAngle")) penDistance = (int)cfg["downAngle"];
            }
            f.close();
        }
    }

    servo->write(penUpAngle);
    currentPosition = penUpAngle;
}

void Pen::saveConfig() {
    File f = LittleFS.open(PEN_CONFIG_PATH, "w");
    if (!f) return;
    DynamicJsonBuffer buf;
    JsonObject& cfg = buf.createObject();
    cfg["upAngle"]   = penUpAngle;
    cfg["downAngle"] = penDistance;
    cfg.printTo(f);
    f.close();
}

void Pen::setRawValue(int rawValue) {
    this->servo->write(rawValue);
    currentPosition = rawValue;
}

void Pen::setPenDistance(int value) {
    Serial.println("Pen distance angle set to " + String(value));
    penDistance = value;
    saveConfig();
}

void Pen::setPenUpAngle(int value) {
    Serial.println("Pen up angle set to " + String(value));
    penUpAngle = value;
    saveConfig();
}

void Pen::slowUp() {
    doSlowMove(this, currentPosition, penUpAngle, slowSpeedDegPerSec);
    currentPosition = penUpAngle;
}

void Pen::slowDown() {
    doSlowMove(this, currentPosition, penDistance, slowSpeedDegPerSec);
    currentPosition = penDistance;
}

bool Pen::isDown() {
    return currentPosition == penDistance;
}