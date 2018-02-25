var colorsLocked;
var buttons = null;
var loc = document.location.origin;
var socket = io.connect(loc);
console.log("Socket connected to",loc);
var curFade = '';
var reachable = false;

var colorOverlay = null;

var config = {};

// Each status can be: { "pattern": "xxx" } or { "color": [r, g, b] }
// For each led strip, first all multicolored, then one-color strips
var serverCurStatus = []

$(document).ready(function() {
    colorsLocked = localStorage.getItem('locked');

    if (colorsLocked === 'false') {
        colorsLocked = true;
        //Reverse so the function will act naturally
    } else {
        colorsLocked = false;
    }

    //disableButtons(true);

    $.getJSON('js/config.json', function(data) {
        config = data;
        setupStripButtons(
            config.numStrips + config.numOneColorStrips, 
            (config.stripNames || [])
        );
    });
});


socket.on('color', function(data) {
    //console.log('Rec: '+JSON.stringify(data));
    if ('strip' in data) {
        deselectPreset();
        setLocalColor(data.strip, [data.r, data.g, data.b]);
    } else if ('id' in data) {
        deselectPreset();
        if (data.id != 'stop') {
            choosePreset(data.id, data.config);
        } else {
            removeConfig();
            console.log("Got stop pattern message");
        }
    }
});

socket.on('connect', function() {
    console.log("Connected");
    reachable = true;
    disableButtons(false);
});

socket.on('disconnect', function() {
    reachable = false;
    disableButtons(true);
});

socket.on('error', function(err) {
    reachable = false;
    disableButtons(true);
    console.log(err);
});

function setupStripButtons(numButtons, stripNames=[]) {
    var buttonFunc = function(index) {
        var curRGB = [0,0,0];
        if (serverCurStatus.length > index) {
            if ("color" in serverCurStatus[index]) {
                curRGB = serverCurStatus[index]["color"];
            }
        }
        console.log("Read color for strip "+index+" as "+curRGB);
        console.log(serverCurStatus);
        showColorOverlay(true, curRGB, index)
    };
    var container = document.getElementById('strip-buttons');
    for (var i=0; i<numButtons; i++) {
        var button = document.createElement('button');
        button.className = 'colorbtn';
        button.id = 'cc'+(i+1);
        button.data_strip = i;
        var stripName = 
            stripNames.length-1 >= i ? 
                stripNames[i] :
                "Strip "+(i+1)
        button.innerText = stripName;
        button.onclick = function(event) {
            buttonFunc(event.target.data_strip);
        }
        container.appendChild(button);

        /*
        var colorPicker = new jscolor(button, {
            width: ($(button).innerWidth()*0.8),
            position: "center",
            valueElement: null,
            styleElement: null
        });
        colorPicker.onFineChange = colorUpdated.bind(null, colorPicker, i);
        */
    }
    buttons = $(".colorbtn");
    lockIconClicked();
}

function disableButtons(enabled) {
    if (!buttons) {
        return;
    }
    if (enabled) {
        buttons.each(function(idx) {
            $(this).addClass("offline");
            $(this).addClass("button-disabled");
            $(this).prop("disabled", true);
        })
    } else {
        buttons.each(function(idx) {
            $(this).removeClass("offline");
            $(this).removeClass("button-disabled");
            $(this).prop("disabled", false);
        })
    }
}

//Strip is #, Color is [r,g,b]
function setLocalColor(strip, color) {
    var elem = 'cc'+(strip+1);

    if (document.getElementById(elem)) {
        document.getElementById(elem).style.background = 
            rgbToHex(color[0], color[1], color[2]);
        $('#'+elem).css('color', 
            getTextColorForBackground(color[0], color[1], color[2])
        );
    }

    serverCurStatus[strip] = {"color": color};
    

    if (colorOverlay && colorOverlay.curStrip === strip) {
        colorOverlay.updateToRGB(color);
    }
}

var bufferOpen = true;
function post(data) {
    if (bufferOpen) {
        //console.log('Posting '+JSON.stringify(data))
        socket.emit('newcolor', data);
        bufferOpen = false;
        setTimeout(function() {
            bufferOpen = true;
        }, 100);
    }
}

/*
function lockIconClicked() {
    if (!buttons) {
        return;
    }
    var locked = 'locked.png',
        unlocked = 'unlocked.png';

    colorsLocked = !colorsLocked;
    $('#lock-strips').attr('src', '/assets/'+(colorsLocked?locked:unlocked));
    var notFirst = $(".strip-button:gt(0)");
    notFirst.prop('disabled', colorsLocked);
    var z = 9;
    for (var i=0; i<notFirst.length; i++) {
        notFirst[i].style.zIndex = z--;
    }
    
    localStorage.setItem('locked', colorsLocked);

    var cls = "button-locked";
    if (colorsLocked) {
        buttons.addClass(cls);
    } else {
        buttons.removeClass(cls);
    }
}
*/

function deselectPreset() {
    $('.button-selected').blur();
    return $('.button-selected').removeClass('button-selected').attr('id');
}

//Called by external preset updating
function choosePreset(id, options) {
    $('#pattern-'+id).addClass('button-selected');
    var config = options || patterns[id].config;
    if (config) {
        setupConfig(config);
    }
}

function chosePreset(id) {
    console.log("Preset: "+ id);
    if (!reachable) {
        return;
    }
    var last = deselectPreset();
    if (id !== last) {
        var submission = id.substring("pattern-".length);
        //setupConfig(patterns[submission].options || null);
        post({id: submission});
    } else {
        removeConfig();
        post({id: "stop"});
    }
}

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? '0' + hex : hex;
}

function rgbToHex(r, g, b) {
    return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function getTextColorForBackground(r, g, b) {
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    //Using a weight system for each color, determine the darkness
    var bOrW = (yiq >= 128) ? 0 : 1;
    return bOrW ? '#FFF' : '#000';
}

/*
function colorUpdated(picker, buttonNum) {
    console.log("Picker", picker);
    console.log("BN", buttonNum);

    var color = {};
    color.r = Math.round(picker.rgb[0]);
    color.g = Math.round(picker.rgb[1]);
    color.b = Math.round(picker.rgb[2]);
    color.strip = [];

    if (colorsLocked) {
        color.strip = arrayOfNumbersUpTo(
            config.numStrips + config.numOneColorStrips);
        post(color);
    } else {
        color.strip = buttonNum
        post(color);
    }
}
*/

// If strip num > number of strips or < 0, sets all strips
function colorUpdated(stripNum, newRGB) {

    var color = {};
    color.r = Math.round(newRGB[0]);
    color.g = Math.round(newRGB[1]);
    color.b = Math.round(newRGB[2]);
    color.strip = [];

    var allStrips = config.numStrips + config.numOneColorStrips || 0;

    if (stripNum < 0 || stripNum >= allStrips) {
        color.strip = arrayOfNumbersUpTo(
            config.numStrips + config.numOneColorStrips);
        post(color);
    } else {
        color.strip = stripNum
        post(color);
    }
}

function arrayOfNumbersUpTo(max) {
    var output = [];
    for (var i=0; i<max; i++) {
        output.push(i);
    }
    return output;
}

/*

Config Space

*/

function rangeAdjusted(item, toUpdate) {
    if (toUpdate && toUpdate.length>0) {
        var elem = document.getElementById(toUpdate);
        elem.innerText = item.value + "%";
    }
}

function rangeSet(element) {
    post({
        config: element.id,
        value: parseInt(element.value)
    });
}

function checkboxSet(element) {
    post({
        config: element.id,
        value: element.checked
    });
}

function removeConfig() {
    var container = document.getElementById("config-space");
    if (!$(container).is(":visible")) {
        return;
    }
    $(container).empty();
}

function setupConfig(options) {
    var container = document.getElementById("config-space");
    if (!options) {
        removeConfig();
        return;
    } else if ($(container).is(":visible")) {
        $(container).empty();
    }
    var docFrag = document.createDocumentFragment();
    var option, config;
    for (var index in options) {
        option = options[index];
        config = option.config;
        var rowElem = document.createElement("div");
        rowElem.className = "config-item-row";
        var lLabel = document.createElement("span");
        var rLabel = document.createElement("span");
        lLabel.className = "config-item item-left";
        rLabel.className = "config-item item-right";
        var elem = document.createElement("input");
        elem.type = config.input.type;
        if (config.label.left) {
            lLabel.id = config.label.left.id;
            lLabel.innerText = config.label.left.text;
        }
        if (config.label.right) {
            rLabel.id = config.label.right.id;
            if (config.input.valueType && 
                config.input.valueType === "percent" && 
                option.displayValue != null) {
                rLabel.innerText = option.displayValue + "%";
            } else {
                rLabel.innerText = config.label.right.text;
            }
        }

        elem.id = index;
        elem.toChange = (config.label.right && config.label.right.id) || null;
        
        if (config.input.type == "range") {
            if (elem.toChange) {
                elem.addEventListener("input", function(event) {
                    rangeAdjusted(event.target, event.target.toChange);
                });
            }

            elem.addEventListener("change", function(event) {
                rangeSet(event.target);
            });

            if (config.input.range != null) {
                elem.setAttribute("min", config.input.range.min);
                elem.setAttribute("max", config.input.range.max);
            }

            if (option.displayValue != null) {
                $(elem).val(option.displayValue);
            }

        } else if (config.input.type == "checkbox") {
            elem.addEventListener("change", function(event) {
                checkboxSet(event.target);
            });
            if (option.displayValue != null) {
                elem.checked = option.displayValue;
            }
        }
        
        rowElem.appendChild(lLabel);
        rowElem.appendChild(rLabel);
        rowElem.appendChild(elem);
        docFrag.appendChild(rowElem);
    }
    container.appendChild(docFrag);
}

function showColorOverlay(visible, startRGB, stripId=-1) {
    var overlayContainer = document.getElementById("color-overlay-container");
    overlayContainer.style.visibility = visible ? "visible":"hidden";

    overlayContainer.onclick = function(e) {
        if (e.target === overlayContainer) {
            showColorOverlay(false);
        }
    }

    if (visible) {
        colorOverlay = new ColorPicker(
            "color-picker-canvas", 
            "color-preview-div",
            function(rgb, chosenStripId) {
                colorUpdated(chosenStripId, rgb);
            },
            startRGB
        );
        colorOverlay.curStrip = stripId;
    } else {
        colorOverlay = null;
    }
}

function rgbStringFromColorArray(colorArr=[0,0,0]) {
    if (colorArr.length > 3) {
        return "rgba(" +
            colorArr[0]+","+
            colorArr[1]+","+
            colorArr[2]+","+
            colorArr[3]+
            ")";
    }

    return "rgba(" +
        colorArr[0]+","+
        colorArr[1]+","+
        colorArr[2]+",1.0)";
}

class ColorPicker {
    constructor(canvasId, previewElemId=null, 
        onColorPicked=null, startRGB=[0,0,0]) {

        this.canvas = document.getElementById(canvasId);
        var hsv = rgbToHsl(startRGB[0], startRGB[1], startRGB[2]);
        this.hue = hsv[0] || 0.;        // 0 - 1
        this.saturation = 1.0;     // 0 - 1
        this.brightness = hsv[2] || 0.; // 0 - 1
        this.createColorOverlay();
        this.updatePreview();
        this.me = this;
        this.previewElem = document.getElementById(previewElemId) || null;
        this.curStrip = -1;

        this.hueCircleDrawn = false;

        //Callback function, ([R,G,B], stripId)
        this.onColorPicked = onColorPicked;
    }

    //Returns [r, g, b]
    getCurRGB() {
        return hslToRgb(
            this.hue,
            this.saturation,
            this.brightness
        );
    }

    updateToRGB(newRGB) {
        var hsv = rgbToHsl(newRGB[0], newRGB[1], newRGB[2]);
        this.hue = hsv[0];
        this.saturation = hsv[1];
        this.brightness = hsv[2];

        this.createColorOverlay();
        this.updatePreview(false);
    }

    createHuePicker(context, centerX, centerY, radius) {
        var PI2 = Math.PI * 2.;
        context.lineWidth = 1;

        var radIncr = Math.PI / 40.;
        for (var rad=0.0; rad<PI2; rad += radIncr) {
            var hue = ( rad / PI2 ) * 1.0;
            var rgb = hslToRgb(hue, 1.0, 0.5);

            context.fillStyle = rgbStringFromColorArray(rgb);
            context.strokeStyle = context.fillStyle;

            context.beginPath();
            context.moveTo(centerX, centerY);
            var endX = (radius * Math.cos(rad)) + centerX;
            var endY = (radius * Math.sin(rad)) + centerY;
            context.lineTo(endX, endY);

            endX = (radius * Math.cos(rad+radIncr)) + centerX;
            endY = (radius * Math.sin(rad+radIncr)) + centerY;
            context.lineTo(endX, endY);
            context.lineTo(centerX, centerY);
            context.fill();
            context.stroke();

            context.closePath();
        }

        this.hueCircleDrawn = true;
    }

    createColorOverlay() {
        var ctx = this.canvas.getContext('2d');

        var width = this.canvas.offsetWidth, height = this.canvas.offsetHeight;

        var pageMargin = 50; //px

        var pickerCenter = width / 2.;
        var brightnessBarWidth = (width - (pageMargin * 2.)) * .15;

        var circleRadius = Math.min(
            (width - (pageMargin * 3.) - brightnessBarWidth) / 2.,
            (height - (pageMargin * 2.)) / 2.
        );
        var circleCenterX = pageMargin + circleRadius;
        var circleCenterY = height / 2.;

        var clearMinX = circleCenterX + circleRadius + 2;

        ctx.clearRect(
            clearMinX, 0,
            width - clearMinX, height
        );

        if (!this.hueCircleDrawn) {
            this.createHuePicker(
                ctx, circleCenterX, circleCenterY, circleRadius
            );
        }

        ctx.lineWidth = 1;

        var brightnessBarHeight = height - (pageMargin * 2.);
        var brightnessBarXMin = width - pageMargin - brightnessBarWidth;

        var rgbFullSat = hslToRgb(this.hue, 1.0, 0.5);
        var gradient = ctx.createLinearGradient(
            0, pageMargin,
            0, pageMargin + brightnessBarHeight
        );
        gradient.addColorStop(0, "white");
        gradient.addColorStop(0.5, rgbStringFromColorArray(rgbFullSat));
        gradient.addColorStop(1, "black");
        ctx.beginPath();
        ctx.rect(
            brightnessBarXMin, pageMargin,
            brightnessBarWidth, brightnessBarHeight
        );
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = "black";
        ctx.stroke();
        ctx.closePath();

        ctx.beginPath();
        ctx.rect(
            brightnessBarXMin - 4, 
            (pageMargin - 5) + ((1-this.brightness) * brightnessBarHeight),
            brightnessBarWidth + 8, 10
        )

        ctx.lineWidth = 2;
        ctx.strokeStyle = rgbStringFromColorArray([100, 100, 100]);
        ctx.stroke();
        ctx.closePath();

        var me = this; // me = current object

        var mouseEvent = function(e) {
            var clickX = e.offsetX;
            var clickY = e.offsetY;

            if (e.buttons == 1) {
                if (clickX >= pageMargin &&
                    clickX <= pageMargin + (circleRadius * 2.) &&
                    clickY >= pageMargin &&
                    clickY <= pageMargin + (circleRadius * 2.)
                    ) {

                    me.colorWheelClick(
                        clickX, clickY,
                        circleCenterX, circleCenterY, circleRadius
                    );
                } else if (
                    clickX >= width - pageMargin - brightnessBarWidth &&
                    clickX <= width - pageMargin &&
                    clickY >= pageMargin &&
                    clickY <= height - pageMargin
                    ) {
                    me.brightnessBarClick(
                        clickX, clickY, 
                        pageMargin, pageMargin + brightnessBarHeight
                    );
                }
            }
        }

        this.canvas.onmousemove = mouseEvent;
        this.canvas.onmousedown = mouseEvent;
    }

    colorWheelClick(clickX, clickY, 
        colorWheelCenterX, colorWheelCenterY, colorWheelRadius) {

        var wheelOffsetX = clickX - colorWheelCenterX;
        var wheelOffsetY = clickY - colorWheelCenterY;

        var distanceClickFromCenter = Math.sqrt(
            Math.pow( wheelOffsetX, 2.0 ) +
            Math.pow( wheelOffsetY, 2.0 )
        );

        if (distanceClickFromCenter > colorWheelRadius) {
            //Click was outside of color wheel
            return
        }

        var angle = Math.atan2(wheelOffsetY, wheelOffsetX);

        var hue = angle/(Math.PI * 2.);

        var rgb = hslToRgb(hue, 1.0, 0.5);
        this.setHue(hue);
        this.createColorOverlay();
    }

    brightnessBarClick(clickX, clickY, 
        brightnessBarMinY, brightnessBarMaxY) {
        var brightness = 
            (clickY-brightnessBarMinY) /
            (brightnessBarMaxY-brightnessBarMinY);
        this.setBrightness(1 - brightness);
        this.createColorOverlay();
    }

    setHue(hue) {
        this.hue = hue;
        this.updatePreview();
    }

    setBrightness(brightness) {
        var brightnessDeadZone = 0.05;
        if (brightness > (1.0 - brightnessDeadZone)) { brightness = 1.0; }
        else if (brightness < brightnessDeadZone) { brightness = 0.0; }
        this.brightness = brightness;
        this.updatePreview();
    }

    //Should send return function?
    updatePreview(sendToDelegate=true) {
        var rgb = this.getCurRGB();

        if (this.previewElem) {
            if (this.brightness >= 0.5) {
                var gray = Math.round(
                    255.-(255.*((this.brightness - .5)/.5))
                );

                this.previewElem.style.border = "1px solid " + 
                    rgbStringFromColorArray([gray, gray, gray]);
            } else {
                this.previewElem.style.border = "none";
            }

            this.previewElem.style.backgroundColor = 
                rgbStringFromColorArray(rgb);
        }

        if (sendToDelegate && this.onColorPicked) {
            this.onColorPicked(rgb, this.curStrip >= 0 ? this.curStrip : -1);
        }
    }
}

/**
 * https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation [r,g,b]
 */
function hslToRgb(h, s, l){
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        var hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   {number}  r       The red color value
 * @param   {number}  g       The green color value
 * @param   {number}  b       The blue color value
 * @return  {Array}           The HSL representation
 */
function rgbToHsl(r, g, b){
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}