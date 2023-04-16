#include "movement.h"
#include "display.h"
#include <stdexcept>

Movement::Movement(Display *display)
{
    this->display = display;

    // pin patter is 1-3-2-4 per http://42bots.com/tutorials/28byj-48-stepper-motor-with-uln2003-driver-and-arduino-uno/
    leftMotor = new AccelStepper(AccelStepper::HALF4WIRE, LEFT_MOTOR_PIN_1, LEFT_MOTOR_PIN_3, LEFT_MOTOR_PIN_2, LEFT_MOTOR_PIN_4);
    rightMotor = new AccelStepper(AccelStepper::HALF4WIRE, RIGHT_MOTOR_PIN_1, RIGHT_MOTOR_PIN_3, RIGHT_MOTOR_PIN_2, RIGHT_MOTOR_PIN_4);

    leftMotor->setMaxSpeed(maxUnsafeSpeed);
    rightMotor->setMaxSpeed(maxUnsafeSpeed);
    leftMotor->setAcceleration(acceleration);
    rightMotor->setAcceleration(acceleration);

    topDistance = -1;

    moving = false;
    homed = false;
};

void Movement::setTopDistance(int distance) {
    Serial.printf("Top distance set to %s\n", String(distance));
    topDistance = distance;

    minSafeY = safeYFraction * topDistance;
    minSafeXOffset = safeXFraction * topDistance;
    width = topDistance - 2 * minSafeXOffset;
    height = width * 9 / 16;
};

void Movement::setOrigin()
{
    leftMotor->setCurrentPosition(-homedStepsOffset);
    rightMotor->setCurrentPosition(homedStepsOffset);
    homed = true;
};

void Movement::leftStepper(int dir)
{
    if (dir > 0)
    {
        leftMotor->move(-INFINITE_STEPS);
    }
    else if (dir < 0)
    {
        leftMotor->move(INFINITE_STEPS);
    }
    else
    {
        leftMotor->stop();
    }

    leftMotor->setSpeed(maxUnsafeSpeed);

    moving = true;
};

void Movement::rightStepper(int dir)
{
    if (dir > 0)
    {
        rightMotor->move(INFINITE_STEPS);
    }
    else if (dir < 0)
    {
        rightMotor->move(-INFINITE_STEPS);
    }
    else
    {
        rightMotor->stop();
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
        leftMotor->runSpeedToPosition();
        rightMotor->runSpeedToPosition();

        if (leftMotor->distanceToGo() == 0 && rightMotor->distanceToGo() == 0)
        {
            delay(sleepPerStep); // delay the full gap between steps to let the final step complete
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

    auto deltaLeft = int(abs(abs(leftMotor->currentPosition()) - leftLegSteps));
    auto deltaRight = int(abs(abs(rightMotor->currentPosition()) - rightLegSteps));

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

    leftMotor->setSpeed(leftSpeed);
    rightMotor->setSpeed(rightSpeed);
    leftMotor->moveTo(-leftLegSteps);
    rightMotor->moveTo(rightLegSteps);

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
    leftMotor->setSpeed(printSpeedSteps);
    rightMotor->setSpeed(printSpeedSteps);
    leftMotor->move(-steps);
    rightMotor->move(steps);
    moving = true;
}