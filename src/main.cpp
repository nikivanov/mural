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

String processor(const String& var)
{
  if(var == "RESUME_DISTANCE") {
    auto distance = DistanceState::readStoredDistance();
    return String(distance);
  } else if (var == "PHASE") {
      return phaseManager->getCurrentPhase()->getName();
  } else {
    throw std::invalid_argument(var.c_str());
  }
}

void handleTemplatedReadMainJs(AsyncWebServerRequest *request) {
    Serial.println("Serving templated main.js");
    request->send(SPIFFS, "/main.js", "text/html", false, processor);
}

void notFound(AsyncWebServerRequest *request)
{
    request->send(404, "text/plain", "Not found");
}

void handleUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    phaseManager->getCurrentPhase()->handleUpload(request, filename, index, data, len, final);
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
              { handleTemplatedReadMainJs(request); });

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

    server.onFileUpload(handleUpload);

    server.onNotFound(notFound);

    Serial.println("Finished setting up the server");

    phaseManager = new PhaseManager(movement, pen, runner, &server);

    Serial.println("Phase manager initialized");

    server.begin();
    Serial.println("Server started");

    display->displayText("http://" + WiFi.localIP().toString());
}

void loop()
{
    movement->runSteppers();
    runner->run();
}
