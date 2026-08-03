#include "display.h"
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define TEXT_HEIGHT 8

Display::Display() {
    auto i2c_valid = Wire.begin(15, 4);
    Serial.printf("I2C changed OK to pins 15 and 4: %d\n", i2c_valid);
    display = new Adafruit_SSD1306(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
    if (!display->begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println(F("SSD1306 allocation failed"));
        throw std::invalid_argument("not ready");
    }
    display->setRotation(0);
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
    String lines[] = {"Connect to hotspot", "SSID: Mural"};
    drawLines(lines, 2);
}

void Display::showConnected(String ipAddress) {
    ip = ipAddress;
    String lines[] = {ip, "http://mural.local"};
    drawLines(lines, 2);
}

void Display::showCalibration(double x, double y) {
    String lines[] = {"X:" + String(x, 1) + " Y:" + String(y, 1)};
    drawLines(lines, 1);
}

void Display::showDrawing(int progress) {
   display->clearDisplay();

    const int x = 8;
    const int y = 8;
    const int width = SCREEN_WIDTH - 16;
    const int height = SCREEN_HEIGHT - 16;

    display->drawRect(x, y, width, height, WHITE);

    int fillWidth = (width - 2) * progress / 100;
    if (fillWidth > 0) {
        display->fillRect(x + 1, y + 1, fillWidth, height - 2, WHITE);
    }

    String label = String(progress) + "%";
    int16_t x1, y1;
    uint16_t w, h;
    display->getTextBounds(label, 0, 0, &x1, &y1, &w, &h);
    display->setCursor(x + (width - w) / 2, y + (height - h) / 2 - y1);
    display->setTextColor(INVERSE);
    display->print(label);
    display->setTextColor(WHITE);

    display->display();
}
