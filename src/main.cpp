#include <Arduino.h>
#include <WiFiManager.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <FS.h>
#include "SPIFFS.h"

#include <ESPmDNS.h>
#include "movement.h"
#include "runner.h"
#include "pen.h";

AsyncWebServer server(80);

Movement *movement;
Runner *runner;
Pen *pen;

void handleFileRead(String path, AsyncWebServerRequest *request)
{
    Serial.println("Serving " + path);
    request->send(SPIFFS, path);
};

void handleCommand(String command, AsyncWebServerRequest *request)
{
    if (command == "l-ret")
    {
        movement->leftStepper(-1);
    }
    else if (command == "l-ext")
    {
        movement->leftStepper(1);
    }
    else if (command == "l-0")
    {
        movement->leftStepper(0);
    }
    else if (command == "r-ret")
    {
        movement->rightStepper(-1);
    }
    else if (command == "r-ext")
    {
        movement->rightStepper(1);
    }
    else if (command == "r-0")
    {
        movement->rightStepper(0);
    }
}

void notFound(AsyncWebServerRequest *request)
{
    request->send(404, "text/plain", "Not found");
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

    movement = new Movement();
    Serial.println("Initialized steppers");

    pen = new Pen();
    Serial.println("Initialized servo");

    runner = new Runner(movement, pen);
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
              { 
                  handleCommand(request->arg("command"), request); 
                  request->send(200, "text/plain", "OK"); 
              });

    server.on("/setTopDistance", HTTP_POST, [](AsyncWebServerRequest *request)
              { 
                AsyncWebParameter* p = request->getParam(0);
                int distance = p->value().toInt();
                Serial.println("Setting distance");
                movement->setTopDistance(distance); 
                request->send(200, "text/plain", "OK"); 
    });

    server.on("/extendToHome", HTTP_POST, [](AsyncWebServerRequest *request)
              { 
                  //movement->extendToHome(); 
                  request->send(200, "text/plain", "OK"); 
    });

    server.on("/setServo", HTTP_POST, [](AsyncWebServerRequest *request) {
        AsyncWebParameter* p = request->getParam(0);
        int angle = p->value().toInt();
        pen->setRawValue(angle);
        request->send(200, "text/plain", "OK"); 
    });
    
    server.on("/setPenDistance", HTTP_POST, [](AsyncWebServerRequest *request) { 
        AsyncWebParameter* p = request->getParam(0);
        int angle = p->value().toInt();
        pen->setPenDistance(angle);
        pen->up();
        request->send(200, "text/plain", "OK"); 
    });

    server.on("/estepsCalibration", HTTP_POST, [](AsyncWebServerRequest *request) { 
        //movement->extend100mm();
        request->send(200, "text/plain", "OK");
    });

    server.on("/isMoving", HTTP_GET, [](AsyncWebServerRequest *request)
              { request->send(200, "text/plain", movement->isMoving() ? "true" : "false"); });

    server.on("/run", HTTP_POST, [](AsyncWebServerRequest *request)
              { 
                runner->start();
                request->send(200, "text/plain", "OK"); });

    server.onNotFound(notFound);

    Serial.println("Finished setting up the server");

    server.begin();
    Serial.println("Server started");

    pen->setRawValue(70);
}

void loop()
{
    movement->runSteppers();
    runner->run();
}
