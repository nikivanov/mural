#include <Arduino.h>
#include <WiFiManager.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <FS.h>
#include <LittleFS.h>
#include <SPI.h>
#include <SD.h>
#include <Wire.h>
#include <ESPmDNS.h>
#include "movement.h"
#include "runner.h"
#include "pen.h"
#include "display.h"
#include "sdcard.h"
#include "portalhtml.h"
#include "phases/phasemanager.h"

AsyncWebServer server(80);

Movement *movement;
Runner *runner;
Pen *pen;
Display *display;

PhaseManager* phaseManager;

void notFound(AsyncWebServerRequest *request)
{
    request->send(404, "text/plain", "Not found");
}

void handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    phaseManager->getCurrentPhase()->handleUpload(request, filename, index, data, len, final);
}

void handleGetState(AsyncWebServerRequest *request) {
    phaseManager->respondWithState(request);
}

const char *HOTSPOT_SSID = "Mural";

// Survives ESP.restart() but not a power cycle, so "use without WiFi" only applies to the next boot.
// RTC memory holds garbage after power-on, hence the magic value rather than a plain bool.
const uint32_t HOTSPOT_BOOT_MAGIC = 0x4D555241; // "MURA"
RTC_NOINIT_ATTR uint32_t hotspotBootFlag;

void setup()
{
    delay(10);
    Serial.begin(9600);

    if (!LittleFS.begin(true)) {
        Serial.println("An Error has occurred while mounting LittleFS");
        return;
    }

    display = new Display();
    display->showStarting();
    Serial.println("Initialized display");

    initSdCardOrHalt(display);
    Serial.println("Initialized SD card");

    // initialize movement right away or the motors can start creeping due to floating output
    movement = new Movement(display);
    Serial.println("Initialized steppers");

    // Consume the flag so any later restart goes back to the normal WiFi flow
    bool hotspotMode = hotspotBootFlag == HOTSPOT_BOOT_MAGIC;
    hotspotBootFlag = 0;

    String ipAddress;
    if (hotspotMode) {
        Serial.println("Running without WiFi, starting hotspot");
        WiFi.mode(WIFI_AP);
        WiFi.softAP(HOTSPOT_SSID);
        ipAddress = WiFi.softAPIP().toString();
    } else {
        WiFiManager wifiManager;

        bool resetAfterConnect = false;
        std::function<void()> serverCallback = [&] () {
            resetAfterConnect = true;
            // Lets the user skip WiFi setup and run Mural off its own hotspot after a restart
            wifiManager.server->on("/offline", HTTP_POST, [&] () {
                hotspotBootFlag = HOTSPOT_BOOT_MAGIC;
                wifiManager.server->send(200, "text/html", OFFLINE_PAGE_HTML);
                wifiManager.stopConfigPortal();
            });
        };

        wifiManager.setConnectTimeout(20);
        applyPortalTheme(wifiManager);
        wifiManager.setWebServerCallback(serverCallback);
        wifiManager.setAPCallback([](WiFiManager*) {
            display->showHotspot();
        });

        display->showConnecting();
        Serial.println("Connecting to wifi");

        wifiManager.autoConnect(HOTSPOT_SSID);

        if (resetAfterConnect) {
            Serial.println(hotspotBootFlag == HOTSPOT_BOOT_MAGIC
                ? "Hotspot mode chosen in captive portal, restarting..."
                : "Connected to WiFi through captive portal, restarting...");
            ESP.restart();
        }

        Serial.println("Connected to wifi");
        ipAddress = WiFi.localIP().toString();
    }

    MDNS.begin("mural");

    Serial.println("Started mDNS for mural");

    pen = new Pen();
    Serial.println("Initialized servo");

    runner = new Runner(movement, pen, display);
    Serial.println("Initialized runner");

    server.serveStatic("/", LittleFS, "/www/").setDefaultFile("index.html").setCacheControl("no-cache");

    server.on("/command", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->handleCommand(request); });

    server.on("/setTopDistance", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->setTopDistance(request); });

    server.on("/setPulleyDiameter", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->setPulleyDiameter(request); });

    server.on("/extendToHome", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->extendToHome(request); });

    server.on("/setServo", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->setServo(request); });

    server.on("/setPenDistance", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->setPenDistance(request); });

    server.on("/estepsCalibration", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->estepsCalibration(request); });

    server.on("/doneWithPhase", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->doneWithPhase(request); });

    server.on("/run", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->run(request); });

    server.on("/resume", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->resumeTopDistance(request); });

    server.on("/getState", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleGetState(request); });

    server.on(
        "/uploadCommands", HTTP_POST,
        [](AsyncWebServerRequest *request) {
            handleGetState(request);
        }, 
        handleUpload
    );

    server.on(
        "/downloadCommands", HTTP_GET,
        [](AsyncWebServerRequest *request) {
            request->send(SD, "/commands", "text/plain");
        }
    );

    server.onNotFound(notFound);

    Serial.println("Finished setting up the server");

    phaseManager = new PhaseManager(movement, pen, runner, &server, display);

    server.begin();
    Serial.println("Server started");

    if (hotspotMode) {
        display->showHotspotReady(ipAddress);
    } else {
        display->showConnected(ipAddress);
    }
}

void loop()
{
    movement->runSteppers();
    runner->run();
    phaseManager->getCurrentPhase()->loopPhase();
}
