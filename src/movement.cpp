#include "movement.h"
#include "display.h"
#include <stdexcept>

Movement::Movement(Display *display)
{
    this->display = display;
    leftMotor = new TinyStepper_28BYJ_48();
    rightMotor = new TinyStepper_28BYJ_48();

    topDistance = -1;

    leftMotor->connectToPins(27, 14, 12, 13);
    rightMotor->connectToPins(26, 25, 33, 32);

    moving = false;
    homed = false;

    this->leftStepper(0);
    this->rightStepper(0);
};

void Movement::setTopDistance(int distance) {
    Serial.printf("Top distance set to %s\n", String(distance));
    topDistance = distance;

    minSafeY = safeYFraction * topDistance;
    minSafeXOffset = safeXFraction * topDistance;
    width = topDistance - 2 * minSafeXOffset;
    height = 609.6; // 2ft hardcoded for now
};

void Movement::setOrigin()
{
    leftMotor->setCurrentPositionInSteps(-homedStepsOffset);
    rightMotor->setCurrentPositionInSteps(homedStepsOffset);
    homed = true;
};

void Movement::leftStepper(int dir)
{
    leftMotor->setSpeedInStepsPerSecond(maxUnsafeSpeed);
    leftMotor->setAccelerationInStepsPerSecondPerSecond(acceleration);

    if (dir > 0)
    {
        leftMotor->setupRelativeMoveInSteps(-INFINITE_STEPS);
    }
    else if (dir < 0)
    {
        leftMotor->setupRelativeMoveInSteps(INFINITE_STEPS);
    }
    else
    {
        leftMotor->setupStop();
    }

    moving = true;
};

void Movement::rightStepper(int dir)
{
    rightMotor->setSpeedInStepsPerSecond(maxUnsafeSpeed);
    rightMotor->setAccelerationInStepsPerSecondPerSecond(acceleration);

    if (dir > 0)
    {
        rightMotor->setupRelativeMoveInSteps(INFINITE_STEPS);
    }
    else if (dir < 0)
    {
        rightMotor->setupRelativeMoveInSteps(-INFINITE_STEPS);
    }
    else
    {
        rightMotor->setupStop();
    }

    moving = true;
};

void Movement::extendToHome()
{
    setOrigin();

    beginLinearTravel(width / 2, height / 2);
};

void Movement::runSteppers()
{
    if (moving)
    {
        leftMotor->processMovement();
        rightMotor->processMovement();

        if (leftMotor->motionComplete() && rightMotor->motionComplete())
        {
            moving = false;
            //Serial.printf("Motion complete. Left steps: %ld, Right steps: %ld\n", leftMotor->getCurrentPositionInSteps(), rightMotor->getCurrentPositionInSteps());
        }
    }
};

void Movement::beginLinearTravel(double x, double y)
{
    X = x;
    Y = y;
    if (topDistance == -1 || !homed) {
        Serial.println("Not ready");
        throw std::invalid_argument("not ready");
    }

    if (x < 0 || x > width)
    {
        Serial.println("Invalid x");
        throw std::invalid_argument("Invalid x");
    }

    if (y < 0 || y > height)
    {
        Serial.println("Invalid y");
        throw std::invalid_argument("Invalid y");
    }

    auto unsafeX = x + minSafeXOffset;
    auto unsafeY = y + minSafeY;

    auto leftX = unsafeX - bottomDistance / 2;
    auto rightX = unsafeX + bottomDistance / 2;
    auto leftLeg = sqrt(pow(leftX, 2) + pow(unsafeY, 2));
    auto rightLeg = sqrt(pow(topDistance - rightX, 2) + pow(unsafeY, 2));
    auto leftLegSteps = int((leftLeg / circumference) * stepsPerRotation);
    auto rightLegSteps = int((rightLeg / circumference) * stepsPerRotation);

    auto deltaLeft = int(abs(abs(leftMotor->getCurrentPositionInSteps()) - leftLegSteps));
    auto deltaRight = int(abs(abs(rightMotor->getCurrentPositionInSteps()) - rightLegSteps));

    float leftSpeed, rightSpeed;
    if (deltaLeft >= deltaRight)
    {
        leftSpeed = printSpeedSteps;
        auto moveTime = deltaLeft / leftSpeed;
        rightSpeed = deltaRight / moveTime;
    }
    else
    {
        rightSpeed = printSpeedSteps;
        auto moveTime = deltaRight / rightSpeed;
        leftSpeed = deltaLeft / moveTime;
    }

    //Serial.printf("Begin movement: X(%s) Y(%s) UnsafeX(%s) UnsafeY(%s) leftLeg(%s) rightLeg(%s) deltaLeft(%s) deltaRight(%s) leftSpeed(%s) rightSpeed(%s) \n", String(x), String(y), String(unsafeX), String(unsafeY), String(leftLeg), String(rightLeg), String(deltaLeft), String(deltaRight), String(leftSpeed), String(rightSpeed));

    leftMotor->setSpeedInStepsPerSecond(leftSpeed);
    rightMotor->setSpeedInStepsPerSecond(rightSpeed);
    leftMotor->setupMoveInSteps(-leftLegSteps);
    rightMotor->setupMoveInSteps(rightLegSteps);

    //display->displayText(String(X) + ", " + String(Y));
    delay(sleepAfterMove);

    moving = true;
};

double Movement::getWidth() {
    if (topDistance == -1) {
        throw std::invalid_argument("not ready");
    }
    return width;
}

double Movement::getHeight() {
    if (topDistance == -1) {
        throw std::invalid_argument("not ready");
    }
    return height;
}

Movement::Point Movement::getCoordinates() {
    if (X == -1 || Y == -1) {
        Serial.println("Not ready to get coordinates");
        throw std::invalid_argument("not ready");
    }

    if (moving) {
        Serial.println("Can't get coordinates while moving");
        throw std::invalid_argument("not ready");
    }
    return Movement::Point(X, Y);
}

void Movement::extend100mm() {
    auto steps = int((100 / circumference) * stepsPerRotation);
    leftMotor->setSpeedInStepsPerSecond(printSpeedSteps);
    rightMotor->setSpeedInStepsPerSecond(printSpeedSteps);
    leftMotor->setupRelativeMoveInSteps(-steps);
    rightMotor->setupRelativeMoveInSteps(steps);
    moving = true;
}

Movement::Lengths Movement::getLengths() {
    return Movement::Lengths(leftMotor->getCurrentPositionInSteps(), rightMotor->getCurrentPositionInSteps());
    
}