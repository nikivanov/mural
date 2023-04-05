#ifndef Display_h
#define Display_h
#include <Adafruit_SSD1306.h>

class Display {
    private:
    Adafruit_SSD1306 *display;
    public:
    Display();
    void displayText(String text);
};
#endif