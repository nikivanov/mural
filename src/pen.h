#ifndef Pen_h
#define Pen_h
#include <ESP32Servo.h>
const int RETRACT_DISTANCE = 20;
class Pen {
    private:
    Servo *servo;
    int penDistance = -1;
    int slowSpeedDegPerSec = 180;
    int currentPosition = 90;
    public:
    Pen();
    void setRawValue(int rawValue);
    void setPenDistance(int value);
    void slowUp();
    void slowDown();
    bool isDown();
};
#endif