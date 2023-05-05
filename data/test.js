window.onload = function () {
    init();
};
function init() {
    var image;
    $("#svgFile").change(function() {
        const svgFile = this.files[0];
        const url = window.URL.createObjectURL(svgFile);

        $.get(url, function(contents) {
            var $tmp = $('svg', contents);
            image = SVG().addTo("#svgImage").size(690, 690);
            image.svg($tmp.html());
            $("#svgImage").show();
            $("#prepareSvg").show();
          }, 'xml');
    });

    $("#prepareSvg").click(function() {
        image.flatten();
        const path = image.findOne('path');
        const pathArray = path.array()

        for (const cmd of pathArray) {
        // this will not work for h, v and z commands 
            const y = cmd.pop();
            const x = cmd.pop();
            const p = new SVG.Point(x,y).transform(path.transform());
            cmd.push(p.x, p.y);
            console.log(cmd);
        }

        path.untransform().plot(pathArray);

    });
}
