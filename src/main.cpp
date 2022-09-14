#include <Arduino.h>
#include <WiFiManager.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <FS.h>
#include "SPIFFS.h"
#include <ESP32Servo.h>
#include <ESPmDNS.h>

AsyncWebServer server(80);

void setupMovement();
void runSteppers();

bool isMoving();

void leftStepper(int dir);
void rightStepper(int dir);

void home();
void startDrawSquare(int penDownAngle, int penUpAngle, Servo *servo);

void extend100mm();

Servo myservo;
int penDistanceAngle;

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

void setPenDistance(int angle) {
    penDistanceAngle = angle;
    Serial.printf("Pen distance angle set to %i", angle);
    Serial.println();
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

    server.on("/extendToHome", HTTP_POST, [](AsyncWebServerRequest *request)
              { 
                  home(); 
                  request->send(200, "text/plain", "OK"); 
    });

    server.on("/setServo", HTTP_POST, [](AsyncWebServerRequest *request) { 
        AsyncWebParameter* p = request->getParam(0);
        int angle = p->value().toInt();
        myservo.write(angle); 
        request->send(200, "text/plain", "OK"); 
    });
    
    server.on("/setPenDistance", HTTP_POST, [](AsyncWebServerRequest *request) { 
        AsyncWebParameter* p = request->getParam(0);
        int angle = p->value().toInt();
        setPenDistance(angle);
        myservo.write(penDistanceAngle - 30);
        request->send(200, "text/plain", "OK"); 
    });

    server.on("/estepsCalibration", HTTP_POST, [](AsyncWebServerRequest *request) { 
        extend100mm();
        request->send(200, "text/plain", "OK");
    });

    server.on("/isMoving", HTTP_GET, [](AsyncWebServerRequest *request)
              { request->send(200, "text/plain", isMoving() ? "true" : "false"); });

    server.on("/run", HTTP_POST, [](AsyncWebServerRequest *request)
              { startDrawSquare(penDistanceAngle + 10, penDistanceAngle - 30, &myservo); 
    });

    server.onNotFound(notFound);

    Serial.println("Finished setting up the server");

    setupMovement();
    Serial.println("Finished initializing steppers");

    server.begin();
    Serial.println("Server started");

    myservo.attach(2);
    myservo.write(50);
}

void loop()
{
    runSteppers();
}
