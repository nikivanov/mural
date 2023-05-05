from xml.dom import minidom
import re

matrixTransformRE = re.compile('matrix\\((.+?),(.+?),(.+?),(.+?),(.+?),(.+?)\\)')

def transformCoordinates(x, y, xF, yF, xT, yT):
    tX = x * xF + xT
    tY = y * yF + yT
    return (tX, tY)

if __name__ == "__main__":
    svg = minidom.parse("giraffe-flattened.svg")
    path = svg.getElementsByTagName('path')[0]

    transform = path.attributes['transform']
    matrixREMatches = matrixTransformRE.match(transform.nodeValue)

    xFactor = float(matrixREMatches.group(1))
    yFactor = float(matrixREMatches.group(4))
    xTrans = float(matrixREMatches.group(5))
    yTrans = float(matrixREMatches.group(6))

    dAttribute = path.attributes['d']
    pathVal = dAttribute.nodeValue
    pathVals = pathVal.split(' ')

    index = 0
    currentToken = None
    points = []
    knownTokens = set(['m', 'v', 'l'])

    currentAbsolutePosition = None
    
    while index < len(pathVals):
        token = pathVals[index]
        if str.isalpha(token):
            if token not in knownTokens:
                raise Exception('unrecognized token')
            else:
                currentToken = token
        else:
            if currentToken == 'm' or currentToken == 'l':
                coords = token.split(',')
                x = float(coords[0])
                y = float(coords[1])
                if currentAbsolutePosition is None:
                    transformedPoint = transformCoordinates(x, y, xFactor, yFactor, xTrans, yTrans)
                    currentAbsolutePosition = transformedPoint
                    points.append(transformedPoint)
                else:
                    transformedPoint = transformCoordinates(x, y, xFactor, yFactor, 0, 0)
                    absoluteX = currentAbsolutePosition[0] + transformedPoint[0]
                    absoluteY = currentAbsolutePosition[1] + transformedPoint[1]
                    points.append((absoluteX, absoluteY))
                    currentAbsolutePosition = (absoluteX, absoluteY)
            elif currentToken == 'v':
                y = float(token)
                transformedPoint = transformCoordinates(0, y, 0, yFactor, 0, 0)
                absoluteX = currentAbsolutePosition[0]
                absoluteY = currentAbsolutePosition[1] + transformedPoint[1]
                points.append((absoluteX, absoluteY))
                currentAbsolutePosition = (absoluteX, absoluteY)
            else:
                raise Exception('todo')
        index = index + 1

    with open('output.txt', 'w') as output:
        output.writelines(map(lambda point: str(point[0]) + " " + str(point[1]) + "\n", points))
    print("Done")
    #print(points)
