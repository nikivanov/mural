#ifndef Pen_h
#define Pen_h
#include <ESP32Servo.h>
const int RETRACT_DISTANCE = 20;
class Pen {
    private:
    Servo *servo;
    int penDistance = -1;
    int penUpAngle = 90;
    int slowSpeedDegPerSec = 90;
    int currentPosition = 90;
    void saveConfig();
    public:
    Pen();
    void setRawValue(int rawValue);
    void setPenDistance(int value);
    void setPenUpAngle(int value);
    void slowUp();
    void slowDown();
    bool isDown();
    int getPenDistance() { return penDistance; }
    int getPenUpAngle() { return penUpAngle; }
};
#endif