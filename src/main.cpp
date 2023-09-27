#include <Arduino.h>
#include <WiFiManager.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <FS.h>
#include "SPIFFS.h"
#include <Wire.h>
#include <ESPmDNS.h>
#include "movement.h"
#include "runner.h"
#include "pen.h"
#include "display.h"
#include "distancestate.h"
#include "phases/phasemanager.h"

AsyncWebServer server(80);

Movement *movement;
Runner *runner;
Pen *pen;
Display *display;

PhaseManager* phaseManager;

void handleFileRead(String path, AsyncWebServerRequest *request)
{
    Serial.println("Serving " + path);
    request->send(SPIFFS, path);
};

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

void setup()
{
    delay(10);
    Serial.begin(9600);

    if (!SPIFFS.begin())
    {
        Serial.println("An Error has occurred while mounting SPIFFS");
        return;
    }

    WiFiManager wifiManager;
    wifiManager.setConnectTimeout(20);
    wifiManager.autoConnect("Mural");
    Serial.println("Connected to wifi");

    MDNS.begin("mural");

    Serial.println("Started mDNS for mural");

    display = new Display();
    Serial.println("Initialized display");

    movement = new Movement(display);
    Serial.println("Initialized steppers");

    pen = new Pen();
    Serial.println("Initialized servo");

    runner = new Runner(movement, pen, display);
    Serial.println("Initialized runner");

    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleFileRead("/index.html", request); });

    server.on("/index.html", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleFileRead("/index.html", request); });

    server.on("/client.js", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleFileRead("/client.js", request); });

    server.on("/main.js", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleFileRead("/main.js", request); });

    server.on("/main.css", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleFileRead("/main.css", request); });

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

    server.onFileUpload(handleUpload);

    server.onNotFound(notFound);

    Serial.println("Finished setting up the server");

    phaseManager = new PhaseManager(movement, pen, runner, &server);
    if (DistanceState::readStoredDistance() == -1) {
        phaseManager->setPhase(PhaseManager::RetractBelts);
        Serial.println("Phase manager initialized with Retract Belts as the first phase");
    } else {
        phaseManager->setPhase(PhaseManager::ResumeOrStartOver);
        Serial.println("Phase manager initialized with Resume Or Start Over as the first phase");
    }

    server.begin();
    Serial.println("Server started");

    display->displayText("http://" + WiFi.localIP().toString());
}

void loop()
{
    movement->runSteppers();
    runner->run();
}
