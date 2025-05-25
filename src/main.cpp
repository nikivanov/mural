#include <Arduino.h>
#include <WiFiManager.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <FS.h>
#include <LittleFS.h>
#include <Wire.h>
#include <ESPmDNS.h>
#include "movement.h"
#include "runner.h"
#include "pen.h"
#include "display.h"
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

std::vector<const char *> menu = {"wifi", "sep"};
void setup()
{
    delay(10);
    Serial.begin(9600);

    if (!LittleFS.begin(true)) {
        Serial.println("An Error has occurred while mounting LittleFS");
        return;
    }

    display = new Display();
    Serial.println("Initialized display");

    // initialize movement right away or the motors can start creeping due to floating output
    movement = new Movement(display);
    Serial.println("Initialized steppers");

    bool resetAfterConnect = false;
    std::function<void()> serverCallback = [&] () {
        resetAfterConnect = true;
    };
    
    WiFiManager wifiManager;
    
    wifiManager.setConnectTimeout(20);
    wifiManager.setTitle("Connect to WiFi");
    wifiManager.setMenu(menu);
    wifiManager.setWebServerCallback(serverCallback);
    wifiManager.autoConnect("Mural");

    if (resetAfterConnect) {
        Serial.println("Connected to WiFi through captive portal, restarting...");
        ESP.restart();
    }
    
    Serial.println("Connected to wifi");

    MDNS.begin("mural");

    Serial.println("Started mDNS for mural");

    pen = new Pen();
    Serial.println("Initialized servo");

    runner = new Runner(movement, pen, display);
    Serial.println("Initialized runner");

    server.serveStatic("/", LittleFS, "/www/").setDefaultFile("index.html");

    server.on("/command", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->handleCommand(request); });

    server.on("/setTopDistance", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->setTopDistance(request); });

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
            request->send(LittleFS, "/commands", "text/plain");
        }
    );

    server.onNotFound(notFound);

    Serial.println("Finished setting up the server");

    phaseManager = new PhaseManager(movement, pen, runner, &server);

    server.begin();
    Serial.println("Server started");

    display->displayHomeScreen("http://" + WiFi.localIP().toString(), "or", "http://mural.local");
    
}

void loop()
{
    movement->runSteppers();
    runner->run();
    phaseManager->getCurrentPhase()->loopPhase();
}
