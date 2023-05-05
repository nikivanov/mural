window.onload = function () {
    init();
};
function init() {
    var image;
    $("#svgFile").change(function() {
        const svgFile = this.files[0];
        const url = window.URL.createObjectURL(svgFile);
        $("#svgPreview").attr("src", url);
        $("#svgPreview").show();
        $.get(url, function(contents) {
            var $tmp = $('svg', contents);
            image = SVG().addTo("#svgImage").size(1000, 1000);
            image.svg($tmp.html());
            //$("#svgImage").show();
            $("#prepareSvg").show();
          }, 'xml');
    });

    $("#prepareSvg").click(function () {
        $("#svgImage").show();
        image.flatten();
        const path = image.findOne('path');
        const pathArray = path.array()
        const pathArrayEntries = pathArray.entries();
        
        let penDown = false;

        const untransformedCommands = [];
        for (const [index, cmd] of pathArrayEntries) {
            const commandType = cmd.shift();
            switch (commandType) {
                case 'M': {
                    if (penDown) {
                        untransformedCommands.push("p0");
                        penDown = false;
                    }

                    const x = cmd.shift();
                    const y = cmd.shift();

                    untransformedCommands.push({x, y});
                }
                    break;
                case 'L': {
                    if (!penDown) {
                        untransformedCommands.push("p1");
                        penDown = true;
                    }
                    const x = cmd.shift();
                    const y = cmd.shift();
                    //const transformedPoint = new SVG.Point(x, y).transform(path.transform());
                    untransformedCommands.push({x, y});
                }
                    break;
                case 'V': {
                    const previousEntry = untransformedCommands[untransformedCommands.length - 1];
                    const y = cmd.shift();
                    const x = previousEntry.x;
                    untransformedCommands.push({x, y});
                }
                    break;
                default:
                    throw new Error('unsupported svg command');
            }
        }
        untransformedCommands.push("p0");
        const transformedCommands = untransformedCommands.map(cmd => {
            if (typeof cmd == 'string') {
                return cmd;
            } else {
                const transformedPoint = new SVG.Point(cmd.x, cmd.y).transform(path.transform());
                return "" + transformedPoint.x + " " + transformedPoint.y;
            }
        });
        
        const commandString = transformedCommands.join("\n");
        $("#output").val(commandString);
        $("#svgImage").hide();
    });
}
