#ifndef Pen_h
#define Pen_h
#include <ESP32Servo.h>
const int RETRACT_DISTANCE = 20;
class Pen {
    private:
    Servo *servo;
    int penDistance = -1;
    public:
    Pen();
    void setRawValue(int rawValue);
    void setPenDistance(int value);
    void up();
    void down();
};
#endif