#include "sdcard.h"
#include <SPI.h>
#include <SD.h>
#include <sd_diskio.h>

namespace {
    constexpr int SD_SCK_PIN = 18;
    constexpr int SD_MISO_PIN = 19;
    constexpr int SD_MOSI_PIN = 23;
    constexpr int SD_CS_PIN = 5;
    constexpr uint32_t SD_FREQUENCY = 4000000;
    constexpr int FORMAT_COUNTDOWN_SECONDS = 10;

    void haltWithNoCard(Display *display) {
        display->showNoCard();
        while (true) {
            delay(1000);
        }
    }
}

void initSdCardOrHalt(Display *display) {
    SPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);

    if (SD.begin(SD_CS_PIN, SPI, SD_FREQUENCY, "/sd", 5, false)) {
        return;
    }

    // SD.begin() doesn't say whether the card is missing or just needs
    // formatting, since it resets its driver state on any mount failure.
    // Probe the hardware directly to tell those two cases apart.
    uint8_t pdrv = sdcard_init(SD_CS_PIN, &SPI, SD_FREQUENCY);
    if (pdrv == 0xFF) {
        haltWithNoCard(display);
    }
    sdcard_uninit(pdrv);

    for (int secondsLeft = FORMAT_COUNTDOWN_SECONDS; secondsLeft > 0; secondsLeft--) {
        display->showFormatCountdown(secondsLeft);
        delay(1000);
    }

    display->showFormatting();

    if (!SD.begin(SD_CS_PIN, SPI, SD_FREQUENCY, "/sd", 5, true)) {
        haltWithNoCard(display);
    }
}
