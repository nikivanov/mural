#include <Arduino.h>
#include <WiFiManager.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <FS.h>
#include "SPIFFS.h"

AsyncWebServer server(80);

void initSteppers();
void moveSteppers();

void leftStepper(int dir);
void rightStepper(int dir);

void run1();
void run2();

void handleFileRead(String path, AsyncWebServerRequest *request)
{
    Serial.println("Serving " + path);
    request->send(SPIFFS, path);
};

void handleCommand(String command, AsyncWebServerRequest *request)
{
    if (command == "l-ret")
    {
        leftStepper(-1);
    }
    else if (command == "l-ext")
    {
        leftStepper(1);
    }
    else if (command == "l-0")
    {
        leftStepper(0);
    }
    else if (command == "r-ret")
    {
        rightStepper(-1);
    }
    else if (command == "r-ext")
    {
        rightStepper(1);
    }
    else if (command == "r-0")
    {
        rightStepper(0);
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
    wifiManager.autoConnect("Mural");
    Serial.println("Connected to wifi");

    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
        handleFileRead("/index.html", request); 
    });

    server.on("/index.html", HTTP_GET, [](AsyncWebServerRequest *request) {
        handleFileRead("/index.html", request); 
    });

    server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request) {
        handleFileRead("/script.js", request); 
    });
    
    server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request) {
        handleFileRead("/style.css", request); 
    });

    server.on("/command", HTTP_POST, [](AsyncWebServerRequest *request) {
        handleCommand(request->arg("command"), request); 
    });

    server.on("/run1", HTTP_POST, [](AsyncWebServerRequest *request) {
        run1();
    });

    server.on("/run2", HTTP_POST, [](AsyncWebServerRequest *request) {
        run2();
    });

    server.onNotFound(notFound);

    Serial.println("Finished setting up the server");

    initSteppers();
    Serial.println("Finished initializing steppers");

    server.begin();
    Serial.println("Server started");
}

void loop()
{
    moveSteppers();
}
