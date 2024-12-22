#include "commandhandlingphase.h"

CommandHandlingPhase::CommandHandlingPhase(Movement* movement) {
    this->movement = movement;
}

void CommandHandlingPhase::handleCommand(AsyncWebServerRequest *request) {
    auto command = request->arg("command");
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
    else {
        request->send(400, "text/plain", "Unsupported command");    
        return;
    }

    request->send(200, "text/plain", "OK");
}