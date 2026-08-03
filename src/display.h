#ifndef Display_h
#define Display_h
#include <Adafruit_SSD1306.h>

class Display {
    private:
    Adafruit_SSD1306 *display;
    String ip;
    void drawLines(String lines[], int n);
    public:
    Display();
    void showStarting();
    void showHotspot();
    void showConnected(String ipAddress);
    void showCalibration(double x, double y);
    void showDrawing(int progress);
};
#endif
