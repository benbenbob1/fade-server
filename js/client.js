var colorsLocked;
var buttons = null;
var loc = document.location.origin;
var socket = io.connect(loc);
//var socket = io.connect("10.0.1.58:7890");
console.log("Socket connected to",loc);
var curFade = '';
var reachable = false;

var colorOverlay = null;
var selectedStripIdx = -1;

var config = {};


/*
stripStatus = [
    { //Strip 0
        "color": [
            h: 0-1 //percent hue
            s: 0-1 //percent saturation
            v: 0-1 //percent value (brightness or lightness)
        ]
        // OR (should not be both)
        "pattern": "waves"
    }, ...
]
*/
// For each led strip, first all multicolored, then single-color strips
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
    var strip = 0;

    if ('strip' in data) {
        strip = data.strip;
    }

    if ('color' in data) {
        setLocalColor(strip, [data.color[0], data.color[1], data.color[2]]);
    } else if ('pattern' in data) {
        setLocalPattern(strip, data.pattern);
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

function stripButtonPressed(buttonIdx, stripName="") {
    var curHSV = [0.0,0.0,0.0];
    if (serverCurStatus.length > buttonIdx) {
        if ("color" in serverCurStatus[buttonIdx]) {
            curHSV = serverCurStatus[buttonIdx]["color"];
        }
    }
    //console.log("Read color for strip "+index+" as "+curRGB);
    //console.log(serverCurStatus);
    showColorOverlay(true, curHSV, buttonIdx, stripName);
}

function setupStripButtons(numButtons, stripNames=[]) {
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
            stripButtonPressed(event.target.data_strip, event.target.innerText);
        }
        container.appendChild(button);
    }
    buttons = $(".colorbtn");
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

//Strip is #, Color is [h,s,v]
function setLocalColor(strip, hsv) {
    var elem = 'cc'+(strip+1);

    if (document.getElementById(elem)) {
        var rgb = hslToRgb(hsv[0], hsv[1], hsv[2])

        document.getElementById(elem).style.background = 
            rgbToHex(rgb[0], rgb[1], rgb[2]);
        $('#'+elem).css('color', 
            getTextColorForBackground(rgb[0], rgb[1], rgb[2])
        );
    }

    serverCurStatus[strip] = {"color": hsv};
    

    if (colorOverlay && colorOverlay.curStrip === strip) {
        colorOverlay.updatePreview(hsv);
    }
}

//Strip is #, Pattern is string
function setLocalPattern(strip, patternName) {
    var colorOverlayOpen = false;
    if (colorOverlay != null && colorOverlay.curStrip === strip) {
        colorOverlayOpen = true;
    }

    if (patternName != 'stop') {
        if (colorOverlayOpen) {
            colorOverlay.deselectPreset();
            colorOverlay.choosePreset(data.id, data.config);
        }
    } else {
        if (colorOverlayOpen) {
            colorOverlay.deselectPreset();
        }
        console.log("Got stop pattern message");
    }
}

function postColor(strip, [h,s,v]) {
    socketSend({
        'strip': strip,
        'color': [h, s, v]
    });
}

function postPattern(strip, id) {
    socketSend({
        'strip': strip,
        'pattern': id
    });
}

//TODO: buffer queue, with a max height
var bufferOpen = true;
function socketSend(data) {
    if (bufferOpen) {
        socket.emit('newcolor', data);
        bufferOpen = false;
        setTimeout(function() {
            bufferOpen = true;
        }, 50);
        return true;
    } else {
        setTimeout(function() {
            if (bufferOpen) {
                socketSend(data);
            }
        }, 50);
    }
    return false;
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

// If strip num > number of strips or < 0, sets all strips
function colorUpdated(stripNum, newHSV) {
    postColor(stripNum, newHSV);
}

function arrayOfNumbersUpTo(max) {
    var output = [];
    for (var i=0; i<max; i++) {
        output.push(i);
    }
    return output;
}

//startHSV is [h, s, v]
function showColorOverlay(visible, startHSV, stripId=-1, stripName="") {
    var overlayContainer = document.getElementById("color-overlay-container");
    var closeButton = document.getElementById("color-overlay-button-close");

    var modalElemId = "color-overlay-modal";
    var modalElem = document.getElementById(modalElemId);
    var modalOpenClass = "modal-open";

    if (visible) {
        overlayContainer.style.visibility = "visible";
        overlayContainer.style.opacity = "1.0";

        selectedStripIdx = stripId;

        modalElem.classList.add(modalOpenClass);
    } else {
        modalElem.classList.remove(modalOpenClass);

        overlayContainer.style.opacity = "0.0";
        setTimeout(function(){
            overlayContainer.style.visibility = "hidden";
        }, 100);
    }

    overlayContainer.onclick = function(event) {
        if (event.target === overlayContainer) {
            showColorOverlay(false);
        }
    };
    closeButton.onclick = function(event) {
        showColorOverlay(false);
    };

    if (visible) {
        colorOverlay = new ColorPicker(
            "color-picker-canvas", 
            "color-preview-div",
            "color-overlay-modal",
            function(hsv, chosenStripId) {
                colorUpdated(chosenStripId, hsv);
            },
            startHSV
        );
        colorOverlay.curStrip = stripId;
        colorOverlay.setPreviewName(stripName);

        var availablePatterns = {};
        var oneColorStrip = 
            stripId >= config.numStrips && 
            stripId < config.numStrips + config.numOneColorStrips;

        for (var pattern in patterns) {
            var curPattern = patterns[pattern];
            if (curPattern.requiresMultipleColors) {
                if (!oneColorStrip) {
                    availablePatterns[pattern] = curPattern;
                }
            } else {
                availablePatterns[pattern] = curPattern;
            }
        }

        colorOverlay.setAvailablePatterns(availablePatterns);

    } else {
        colorOverlay = null;
    }
}

function rgbStringFromColorArray(colorArr=[0,0,0], alpha=1.0) {
    if (colorArr.length < 3) { return "rgba(0,0,0,0)"; }
    var alphaOut = (colorArr.length > 3 ? colorArr[3] : alpha);

    return "rgba(" +
        colorArr[0]+","+
        colorArr[1]+","+
        colorArr[2]+","+
        alphaOut+
    ")";
}

class ColorPicker {
    constructor(canvasId, previewElemId=null, modalElemId=null, 
        onColorPicked=null, startHSV=[0.,0.,0.]) {
        this.canvas = document.getElementById(canvasId);
        this.modal = document.getElementById(modalElemId);
        this.hue = startHSV[0] || 0.;        // 0 - 1
        this.saturation = 1.0;     // 0 - 1
        this.brightness = startHSV[2] || 0.; // 0 - 1
        this.createColorOverlay();
        this.previewElem = document.getElementById(previewElemId) || null;
        this.curStrip = -1;

        this.hueCircleDrawn = false;

        //Callback function, ([R,G,B], stripId)
        this.onColorPicked = onColorPicked;

        this.updatePreview(startHSV);

        var me = this; // me = current object
        window.onresize = function(e) {
            me.resizeModal();
        }

        this.resizeModal();

        this.modal.classList.add("modal-open");
    }

    resizeModal() {
        var smallClass = "modal-container-short"
        if (this.modal) {
            if (window.innerHeight < this.modal.offsetHeight) {
                //Window too short for modal
                this.modal.classList.add(smallClass);
            } else {
                this.modal.classList.remove(smallClass);
            }
        }
    }

    //Returns [r, g, b]
    getCurRGB() {
        return hslToRgb(
            this.hue,
            this.saturation,
            this.brightness
        );
    }

    //Returns [h, s, v]
    getCurHSV() {
        return [this.hue, this.saturation, this.brightness];
    }

    updateToHSV(newHSV) {
        console.log("Calling remote update "+newHSV);
        this.hue = newHSV[0];
        //should be this.saturation = hsv[1];
        //but instead
        this.saturation = 1.0;
        this.brightness = newHSV[2];

        this.createColorOverlay();
        this.updatePreview(newHSV);
    }

    createHuePicker(context, centerX, centerY, radius) {
        var PI2 = Math.PI * 2.;
        
        context.lineWidth = 4;
        context.strokeStyle = "gray";
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, PI2, false);
        context.stroke();
        context.closePath();

        context.lineWidth = 1;

        var radIncr = Math.PI / 40.;
        var toRad = PI2; //second to last
        for (var rad=0.0; rad<toRad; rad += radIncr) {
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
            (width - (pageMargin * 2.) - brightnessBarWidth) / 2.,
            (height - (pageMargin * 2.)) / 2.
        );
        var circleCenterX = pageMargin + circleRadius; //relative to canvas(0,0)
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
        gradient.addColorStop(0.1, "white");
        gradient.addColorStop(0.5, rgbStringFromColorArray(rgbFullSat));
        gradient.addColorStop(0.9, "black");
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

        var didTouchCanvas = function(touchX, touchY) {
            if (touchX >= pageMargin &&
                touchX <= pageMargin + (circleRadius * 2.) &&
                touchY >= pageMargin &&
                touchY <= pageMargin + (circleRadius * 2.)
                ) {

                me.colorWheelClick(
                    touchX, touchY,
                    circleCenterX, circleCenterY, circleRadius
                );
            } else if (
                touchX >= width - pageMargin - brightnessBarWidth &&
                touchX <= width - pageMargin &&
                touchY >= pageMargin &&
                touchY <= height - pageMargin
                ) {
                me.brightnessBarClick(
                    touchX, touchY, 
                    pageMargin, pageMargin + brightnessBarHeight
                );
            }
        }

        var mouseEvent = function(e) {
            var clickX = e.offsetX;
            var clickY = e.offsetY;

            if (e.buttons == 1) {
                didTouchCanvas(clickX, clickY);
            }
        }

        var touchEvent = function(e) {
            if (e.touches.length <= 0) { return; }
            var firstTouch = e.touches[0];

            var canvasOffsetY = 
                me.canvas.parentElement.parentElement.parentElement.offsetTop -
                me.canvas.parentElement.parentElement.offsetHeight / 2.;
            var canvasOffsetX = 
                me.canvas.parentElement.parentElement.parentElement.offsetLeft -
                me.canvas.parentElement.parentElement.offsetWidth / 2.;

            var canvasY = firstTouch.pageY - canvasOffsetY;
            var canvasX = firstTouch.pageX - canvasOffsetX;

            didTouchCanvas(canvasX, canvasY);
        }

        var mobileTouch = function(e) {
            e.preventDefault();
            touchEvent(e);
        }

        this.canvas.ontouchstart = mobileTouch;
        this.canvas.ontouchmove = mobileTouch;
        this.canvas.ontouchend = mobileTouch;

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
        this.onParamSet();
    }

    setBrightness(brightness) {
        var brightnessDeadZone = 0.05;
        if (brightness > (1.0 - brightnessDeadZone)) { brightness = 1.0; }
        else if (brightness < brightnessDeadZone) { brightness = 0.0; }
        this.brightness = brightness;
        this.onParamSet();
    }

    onParamSet() {
        var hsv = this.getCurHSV();
        if (this.onColorPicked) {
            this.onColorPicked(hsv, this.curStrip >= 0 ? this.curStrip : -1);
        }
    }

    updatePreview(hsv) {
        if (this.previewElem) {
            this.previewElem.style.borderColor = rgbStringFromColorArray(
                [128, 128, 128, this.brightness]
            );
            var rgb = hslToRgb(hsv[0], hsv[1], hsv[2]);
            this.previewElem.style.backgroundColor = 
                rgbStringFromColorArray(rgb);
            this.previewElem.style.color = 
                getTextColorForBackground(rgb[0], rgb[1], rgb[2]);
        }
    }

    setPreviewName(newName) {
        if (this.previewElem) {
            this.previewElem.innerText = newName;
        }
    }

    /*
    dictionaryOfPatternDicts:
    {
        "pattern1": {
            requiresMultipleColors: true,
            display: {
                title: "The best pattern",
                backgroundDivCSS: {
                    "background": {
                        backgroundColor: "red"
                    },
                    "foreground": {
                        content: "x",
                        color: "white"
                    }
                }
            }
        }
    }
    */

    addPatternButton(patternName, dict, containerElem) {
        if (!containerElem) { return; }
        var displayDict = dict.display || {};
        var patternButton = document.createElement("div");
        patternButton.id = "pattern-"+patternName;
        patternButton.classList.add("preset-button");
        if ("title" in displayDict) {
            patternButton.title = displayDict.title;
        }
        if ("backgroundDivCSS" in displayDict) {
            var innerElems = displayDict.backgroundDivCSS;
            for (var div in innerElems) {
                var innerElem = document.createElement("div");
                innerElem.id = patternButton.id + "-inner-" + div;
                innerElem.style.height = "100%";
                innerElem.style.width = "100%";
                innerElem.style.borderRadius = "2px";
                for (var cssItem in innerElems[div]) {
                    innerElem.style[cssItem] = innerElems[div][cssItem];
                }
                patternButton.appendChild(innerElem);
            }
        }
        var selectedClass = "button-selected";
        var me = this;
        patternButton.onclick = function(e) {
            /*if (patternButton.classList.contains(selectedClass)) {
                patternButton.classList.remove(selectedClass);
            } else {
                patternButton.classList.add(selectedClass);
            } */
            me.chosePreset(patternName); 
        };
        containerElem.appendChild(patternButton);
    }

    setAvailablePatterns(dictionaryOfPatternDicts) {
        var patternContainer = document.getElementById(
            "preset-container"
        );

        if (!patternContainer) { return; }

        while (patternContainer.firstChild) {
            patternContainer.removeChild(patternContainer.firstChild);
        }

        var me = this;
        for (var pattern in dictionaryOfPatternDicts) {
            me.addPatternButton(
                pattern, dictionaryOfPatternDicts[pattern], patternContainer
            );
        }

        this.resizeModal();
    }

    deselectPreset() {
        this.removeConfig();
        $('.button-selected').blur();
        return $('.button-selected').removeClass('button-selected').attr('id');
    }

    // Called by external preset updating (from server)
    choosePreset(id, options) {
        $('#pattern-'+id).addClass('button-selected');
        var config = options || patterns[id].config;
        if (config) {
            this.setupConfig(config);
        }
    }

    chosePreset(id) {
        console.log("Preset: "+ id);
        if (!reachable) {
            return;
        }
        var last = this.deselectPreset();
        if (id !== last) {
            var submission = id.substring("pattern-".length);
            //setupConfig(patterns[submission].options || null);
            postPattern(selectedStripIdx, submission);
        } else {
            removeConfig();
            postPattern(selectedStripIdx, "stop");
        }
    }

    /*

    Pattern config Space

    */

    rangeAdjusted(item, toUpdate) {
        if (toUpdate && toUpdate.length>0) {
            var elem = document.getElementById(toUpdate);
            elem.innerText = item.value + "%";
        }
    }

    rangeSet(element) {
        post({
            config: element.id,
            value: parseInt(element.value)
        });
    }

    checkboxSet(element) {
        post({
            config: element.id,
            value: element.checked
        });
    }

    removeConfig() {
        var container = document.getElementById("config-space");
        if (!$(container).is(":visible")) {
            return;
        }
        $(container).empty();
    }

    setupConfig(options) {
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