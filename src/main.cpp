#include <Arduino.h>
#include <WiFiManager.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <FS.h>
#include <LittleFS.h>
#include <Wire.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include "movement.h"
#include "runner.h"
#include "pen.h"
#include "display.h"
#include "phases/phasemanager.h"
#include <stdexcept>

AsyncWebServer server(80);
AsyncEventSource events("/events");

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

// Runtime-configurable physics constants (see KinematicModel.md / movement.h). These are
// available regardless of the current phase, same as /getState.
void handleGetPhysicsConstants(AsyncWebServerRequest *request) {
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    DynamicJsonBuffer jsonBuffer;
    JsonObject &root = jsonBuffer.createObject();

    root["massBot"] = movement->getMassBot();
    root["beltElongationCoefficient"] = movement->getBeltElongationCoefficient();
    root["effectiveDiameter"] = movement->getEffectiveDiameter();
    root["homedStepOffsetMM"] = movement->getHomedStepOffsetMM();

    root.printTo(*response);
    request->send(response);
}

void handleSetPhysicsConstants(AsyncWebServerRequest *request) {
    if (request->hasParam("massBot", true)) {
        movement->setMassBot(request->getParam("massBot", true)->value().toDouble());
    }
    if (request->hasParam("beltElongationCoefficient", true)) {
        movement->setBeltElongationCoefficient(request->getParam("beltElongationCoefficient", true)->value().toDouble());
    }
    if (request->hasParam("effectiveDiameter", true)) {
        movement->setEffectiveDiameter(request->getParam("effectiveDiameter", true)->value().toDouble());
    }
    if (request->hasParam("homedStepOffsetMM", true)) {
        movement->setHomedStepOffsetMM(request->getParam("homedStepOffsetMM", true)->value().toDouble());
    }

    handleGetPhysicsConstants(request);
}

// Hooks the existing E-steps calibration flow (see Movement::extend1000mm()): given the
// distance the user actually measured after that extension, backs out and persists a
// corrected effective pulley diameter.
void handleEstepsCalibrationApply(AsyncWebServerRequest *request) {
    if (!request->hasParam("measuredDistanceMM", true)) {
        request->send(400, "text/plain", "Missing measuredDistanceMM");
        return;
    }

    double measuredDistanceMM = request->getParam("measuredDistanceMM", true)->value().toDouble();
    double correctedDiameter;
    if (!movement->calibrateEffectiveDiameterFromMeasurement(measuredDistanceMM, correctedDiameter)) {
        request->send(400, "text/plain", "No calibration extension has been performed yet");
        return;
    }

    handleGetPhysicsConstants(request);
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

    // Also initialize the pen servo right away, before the blocking WiFi connect
    // below (which can take 20+ seconds). Pen's constructor immediately writes the
    // neutral/up angle, so a pen left resting on the wall from a prior session lifts
    // as soon as power comes back, instead of sitting on the wall ink-down for the
    // whole WiFi connect window.
    pen = new Pen();
    Serial.println("Initialized servo");

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

    // Disable WiFi modem sleep: with it on, every packet waits for a DTIM
    // beacon (~0.5-1s RTT), which made OTA uploads crawl at ~2KB/s and time
    // out, and adds the same latency to every web UI request. The board is
    // wall-powered, so the extra idle draw doesn't matter.
    WiFi.setSleep(false);

    MDNS.begin("mural");

    Serial.println("Started mDNS for mural");

    // Wireless firmware/filesystem updates (`pio run -e esp32dev-ota -t
    // upload` / `-t uploadfs`), so reflashing doesn't require detaching the
    // wiring to get at USB. Motors are left disabled/idle during an update:
    // OTA writes stall loop() (no runSteppers() calls), so don't push an
    // update mid-draw.
    ArduinoOTA.setHostname("mural");
    ArduinoOTA.onStart([]() {
        if (ArduinoOTA.getCommand() == U_SPIFFS) {
            // Filesystem image update: unmount so the partition isn't
            // written while LittleFS has it open.
            LittleFS.end();
        }
    });
    ArduinoOTA.begin();

    runner = new Runner(movement, pen, display);
    runner->setEventSource(&events);
    Serial.println("Initialized runner");

    server.serveStatic("/", LittleFS, "/www/").setDefaultFile("index.html").setCacheControl("no-cache");

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

    server.on("/getPhysicsConstants", HTTP_GET, [](AsyncWebServerRequest *request)
              { handleGetPhysicsConstants(request); });

    server.on("/setPhysicsConstants", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleSetPhysicsConstants(request); });

    server.on("/estepsCalibrationApply", HTTP_POST, [](AsyncWebServerRequest *request)
              { handleEstepsCalibrationApply(request); });

    server.on("/installTestPattern", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->installTestPattern(request); });

    // Pause/resume primitive (see docs/multi-color.md section 4) - only accepted
    // during the Drawing phase, 400s ("busy drawing" style) everywhere else via
    // NotSupportedPhase's defaults.
    server.on("/pauseDrawing", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->pauseDrawing(request); });

    server.on("/resumeDrawing", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->resumeDrawing(request); });

    // Confirms a resume-after-power-loss offer (see ResumeDrawingPhase); the
    // existing generic /doneWithPhase is reused for discarding it.
    server.on("/confirmResume", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->confirmResume(request); });

    // Confirms a multi-color pen swap (see docs/multi-color.md sections 2-4 and
    // DrawingPhase) - only accepted while Drawing with a swap pending, 400s
    // everywhere else via NotSupportedPhase's default.
    server.on("/confirmPenSwap", HTTP_POST, [](AsyncWebServerRequest *request)
              { phaseManager->getCurrentPhase()->confirmPenSwap(request); });

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

    // Live drawing status (see Runner::pushProgressEvent). Sends a fresh snapshot to
    // each newly (re)connected client immediately, rather than waiting for the next
    // throttled push, so a page reload/EventSource reconnect mid-drawing shows
    // correct progress right away instead of a stale/empty bar for up to ~1s.
    events.onConnect([](AsyncEventSourceClient *client) {
        if (runner != NULL) {
            char buffer[192];
            runner->buildProgressJson(buffer, sizeof(buffer));
            client->send(buffer, "progress", millis());
        }
    });
    server.addHandler(&events);

    Serial.println("Finished setting up the server");

    phaseManager = new PhaseManager(movement, pen, runner);

    server.begin();
    Serial.println("Server started");

    display->displayHomeScreen("http://" + WiFi.localIP().toString(), "or", "http://mural.local");
    
}

void loop()
{
    // Only service OTA while the machine is idle: an OTA transfer blocks
    // loop() for its duration, which would freeze step generation (pen
    // down against the wall, belts stalled mid-move). Gating on both the
    // Drawing phase and any active movement means an update request simply
    // waits (espota retries) until the machine isn't doing anything.
    if (!movement->isMoving() &&
        strcmp(phaseManager->getCurrentPhase()->getName(), "Drawing") != 0)
    {
        ArduinoOTA.handle();
    }
    movement->runSteppers();
    runner->run();
    phaseManager->getCurrentPhase()->loopPhase();
}
