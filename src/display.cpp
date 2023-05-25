#include "display.h"
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
Display::Display() {
    display = new Adafruit_SSD1306(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
    if (!display->begin(SSD1306_SWITCHCAPVCC, 0x3C))
    { // Address 0x3D for 128x64
        Serial.println(F("SSD1306 allocation failed"));
        throw std::invalid_argument("not ready");
    }
    delay(2000);
    display->setRotation(2);
    display->clearDisplay();
    display->setTextColor(WHITE);
    display->setTextSize(1);
    display->display();
}

void Display::displayText(String text)
{
    int16_t x1;
    int16_t y1;
    uint16_t width;
    uint16_t height;

    display->getTextBounds(text, 0, 0, &x1, &y1, &width, &height);

    // display on horizontal and vertical center
    display->clearDisplay(); // clear display
    display->setCursor((SCREEN_WIDTH - width) / 2, (SCREEN_HEIGHT - height) / 2);
    display->println(text); // text to display
    display->display();
    Serial.println("Displayed " + text);
}