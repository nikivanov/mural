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
    height = 1000; //hardcoded for now
};

void Movement::resumeTopDistance(int distance) {
    setTopDistance(distance);
    homed = true;

    auto homeCoordinates = getHomeCoordinates();
    X = homeCoordinates.x;
    Y = homeCoordinates.y;

    auto lengths = getBeltLengths(homeCoordinates.x, homeCoordinates.y);
    leftMotor->setCurrentPositionInSteps(-lengths.left);
    rightMotor->setCurrentPositionInSteps(lengths.right);

    moving = false;
}

void Movement::setOrigin()
{
    leftMotor->setCurrentPositionInSteps(-homedStepsOffset);
    rightMotor->setCurrentPositionInSteps(homedStepsOffset);
    homed = true;
};

void Movement::leftStepper(int dir)
{
    leftMotor->setSpeedInStepsPerSecond(printSpeedSteps);
    leftMotor->setAccelerationInStepsPerSecondPerSecond(acceleration);

    if (dir > 0)
    {
        leftMotor->setupRelativeMoveInSteps(INFINITE_STEPS);
    }
    else if (dir < 0)
    {
        leftMotor->setupRelativeMoveInSteps(-INFINITE_STEPS);
    }
    else
    {
        leftMotor->setupStop();
    }

    moving = true;
};

void Movement::rightStepper(int dir)
{
    rightMotor->setSpeedInStepsPerSecond(printSpeedSteps);
    rightMotor->setAccelerationInStepsPerSecondPerSecond(acceleration);

    if (dir > 0)
    {
        rightMotor->setupRelativeMoveInSteps(-INFINITE_STEPS);
    }
    else if (dir < 0)
    {
        rightMotor->setupRelativeMoveInSteps(INFINITE_STEPS);
    }
    else
    {
        rightMotor->setupStop();
    }

    moving = true;
};

Movement::Point Movement::getHomeCoordinates() {
    if (topDistance == -1) {
        throw std::invalid_argument("not ready");
    }

    return Point(width / 2, height * 0.25);
}

void Movement::extendToHome()
{
    setOrigin();

    auto homeCoordinates = getHomeCoordinates();

    beginLinearTravel(homeCoordinates.x, homeCoordinates.y);
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

Movement::Lengths Movement::getBeltLengths(double x, double y) {
    auto unsafeX = x + minSafeXOffset;
    auto unsafeY = y + minSafeY;

    auto xDev = topDistance / 2 - unsafeX;

    // we're rotated 90 degrees here, so x is Y and y is X for this function
    auto devAngle = atan2(abs(xDev), unsafeY);

    auto xComp = cos(devAngle) * bottomDistance;
    auto yComp = sin(devAngle) * bottomDistance;

    auto leftX = unsafeX - xComp / 2;
    auto rightX = unsafeX + xComp / 2;

    double leftY, rightY;
    if (xDev < 0) {
        leftY = unsafeY - yComp / 2;
        rightY = unsafeY + yComp / 2;
    } else {
        leftY = unsafeY + yComp / 2;
        rightY = unsafeY - yComp / 2;
    }

    auto leftLeg = sqrt(pow(leftX, 2) + pow(leftY, 2));
    auto rightLeg = sqrt(pow(topDistance - rightX, 2) + pow(rightY, 2));
    auto leftLegSteps = int((leftLeg / circumference) * stepsPerRotation);
    auto rightLegSteps = int((rightLeg / circumference) * stepsPerRotation);

    return Lengths(leftLegSteps, rightLegSteps);
}

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

    auto lengths = getBeltLengths(x, y);
    auto leftLegSteps = lengths.left;
    auto rightLegSteps = lengths.right;

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
    leftMotor->setupMoveInSteps(leftLegSteps);
    rightMotor->setupMoveInSteps(-rightLegSteps);

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
    leftMotor->setupRelativeMoveInSteps(steps);
    rightMotor->setupRelativeMoveInSteps(-steps);
    moving = true;
}
