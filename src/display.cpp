#include "display.h"
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define TEXT_HEIGHT 8

Display::Display() {
    display = new Adafruit_SSD1306(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
    if (!display->begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println(F("SSD1306 allocation failed"));
        throw std::invalid_argument("not ready");
    }
    display->setRotation(2);
    display->clearDisplay();
    display->setTextColor(WHITE);
    display->setTextSize(1);
    display->display();
}

void Display::drawLines(String lines[], int n) {
    display->clearDisplay();
    int16_t x1, y1;
    uint16_t w, h;
    int zoneH = SCREEN_HEIGHT / n;
    for (int i = 0; i < n; i++) {
        int y = i * zoneH + (zoneH - TEXT_HEIGHT) / 2;
        display->getTextBounds(lines[i], 0, 0, &x1, &y1, &w, &h);
        display->setCursor((SCREEN_WIDTH - w) / 2, y);
        display->print(lines[i]);
    }
    display->display();
}

void Display::showStarting() {
    String lines[] = {"Starting up..."};
    drawLines(lines, 1);
}

void Display::showHotspot() {
    String lines[] = {"Connect to WiFi Hotspot", "SSID: Mural"};
    drawLines(lines, 2);
}

void Display::showConnected(String ipAddress) {
    ip = ipAddress;
    String lines[] = {ip, "Connected"};
    drawLines(lines, 2);
}

void Display::showCalibration(double x, double y) {
    String lines[] = {ip, "X:" + String(x, 1) + " Y:" + String(y, 1)};
    drawLines(lines, 2);
}

void Display::showDrawing(double x, double y, int progress) {
    String lines[] = {ip, "X:" + String((int)x) + " Y:" + String((int)y), String(progress) + "%"};
    drawLines(lines, 3);
}
