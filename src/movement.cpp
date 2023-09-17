#include "movement.h"
#include "display.h"
#include <stdexcept>

Movement::Movement(Display *display)
{
    this->display = display;
   
    leftMotor = new AccelStepper(AccelStepper::FULL4WIRE, LEFT_MOTOR_PIN_1, LEFT_MOTOR_PIN_3, LEFT_MOTOR_PIN_2, LEFT_MOTOR_PIN_4);
    leftMotor->setMaxSpeed(printSpeedSteps);
    leftMotor->disableOutputs();

    rightMotor = new AccelStepper(AccelStepper::FULL4WIRE, RIGHT_MOTOR_PIN_1, RIGHT_MOTOR_PIN_3, RIGHT_MOTOR_PIN_2, RIGHT_MOTOR_PIN_4);
    rightMotor->setMaxSpeed(printSpeedSteps);
    rightMotor->disableOutputs();

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
    height = 1000; //hardcoded for now
};

void Movement::resumeTopDistance(int distance) {
    setTopDistance(distance);
    homed = true;

    auto homeCoordinates = getHomeCoordinates();
    X = homeCoordinates.x;
    Y = homeCoordinates.y;

    auto lengths = getBeltLengths(homeCoordinates.x, homeCoordinates.y);
    leftMotor->setCurrentPosition(lengths.left);
    rightMotor->setCurrentPosition(-lengths.right);

    moving = false;
}

void Movement::setOrigin()
{
    leftMotor->setCurrentPosition(homedStepsOffset);
    rightMotor->setCurrentPosition(-homedStepsOffset);
    homed = true;
};

void Movement::leftStepper(int dir)
{
    if (dir > 0)
    {
        leftMotor->move(INFINITE_STEPS);
        leftMotor->setSpeed(printSpeedSteps);
    }
    else if (dir < 0)
    {
        leftMotor->move(-INFINITE_STEPS);
        leftMotor->setSpeed(printSpeedSteps);
    }
    else
    {
        leftMotor->setAcceleration(acceleration);
        leftMotor->stop();
    }

    moving = true;
};

void Movement::rightStepper(int dir)
{
    if (dir > 0)
    {
        rightMotor->move(-INFINITE_STEPS);
        rightMotor->setSpeed(printSpeedSteps);
    }
    else if (dir < 0)
    {
        rightMotor->move(INFINITE_STEPS);
        rightMotor->setSpeed(printSpeedSteps);
    }
    else
    {
        rightMotor->setAcceleration(acceleration);
        rightMotor->stop();
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
        leftMotor->runSpeedToPosition();
        rightMotor->runSpeedToPosition();

        if (leftMotor->distanceToGo() == 0 && rightMotor->distanceToGo() == 0)
        {
            moving = false;
            //Serial.printf("Motion complete. Left steps: %ld, Right steps: %ld\n", leftMotor->currentPosition(), rightMotor->currentPosition());
        }
    }
};

Movement::Lengths Movement::getBeltLengths(double x, double y) {
    auto unsafeX = x + minSafeXOffset;
    auto unsafeY = y + minSafeY;

    // auto leftX = unsafeX - bottomDistance / 2;
    // auto rightX = unsafeX + bottomDistance / 2;
    // auto leftLeg = sqrt(pow(leftX, 2) + pow(unsafeY, 2));
    // auto rightLeg = sqrt(pow(topDistance - rightX, 2) + pow(unsafeY, 2));

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
    leftMotor->moveTo(leftLegSteps);
    leftMotor->setSpeed(leftSpeed);
    
    rightMotor->moveTo(-rightLegSteps);
    rightMotor->setSpeed(rightSpeed);

    //display->displayText(String(X) + ", " + String(Y));
    //delay(sleepAfterMove);

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
    
    leftMotor->move(steps);
    leftMotor->setSpeed(printSpeedSteps);

    rightMotor->move(-steps);
    rightMotor->setSpeed(printSpeedSteps);

    moving = true;
}

void Movement::disableMotors() {
    leftMotor->disableOutputs();
    rightMotor->disableOutputs();
}
