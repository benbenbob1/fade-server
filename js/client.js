var colorsLocked;
var buttons = null;
var loc = document.location.host;
var socket = io('ws://'+loc, {transports: ['websocket']});
console.log('Socket connected to', loc);
var curFade = '';
var reachable = false;

var colorOverlay = null;
var selectedStripIdx = -1;

var config = {};
var debug = false;

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

    $.getJSON('/config', function(data) {
        config = data;
        debug = config.debugMode === true;
        setupStripButtons(config.strips);
    });
});


socket.on('color', function(data) {
    var strip = 0;

    if (debug) {
        console.log("[DEBUG] Received: ", data);
    }

    if ('strip' in data) {
        strip = data.strip;
    }

    if ('color' in data) {
        setLocalColor(strip, [data.color[0], data.color[1], data.color[2]]);
    } else if ('pattern' in data) {
        setLocalColor(strip, [0, 1, 0]);
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
    var curPattern;
    if (serverCurStatus.length > buttonIdx) {
        console.log("SCS", serverCurStatus[buttonIdx]);
        if ("color" in serverCurStatus[buttonIdx]) {
            curHSV = serverCurStatus[buttonIdx]["color"];
        } else if ("pattern" in serverCurStatus[buttonIdx]) {
            curPattern = serverCurStatus[buttonIdx]["pattern"];
        }
    }
    console.log("Read pattern for strip "+buttonIdx+" as "+curPattern);
    //console.log("Read color for strip "+index+" as "+curRGB);
    //console.log(serverCurStatus);
    showColorOverlay(true, curHSV, buttonIdx, stripName);
    if (curPattern != null && curPattern != 'stop') {
        colorOverlay.choosePreset(curPattern);
    }
}

function setupStripButtons(strips) {
    var container = document.getElementById('strip-buttons');
    for (var i=0; i<strips.length; i++) {
        var button = document.createElement('button');
        button.className = 'colorbtn';
        button.id = 'cc'+(i+1);
        button.data_strip = i;
        button.innerText = strips[i].name;
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
    var elem = document.getElementById('cc'+(strip+1));

    var hadPatternPreviously = (serverCurStatus.length > strip && "pattern" in serverCurStatus[strip]);

    if (elem) {
        var rgb = Helpers.hslToRgb(hsv[0], hsv[1], hsv[2])

        elem.style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        elem.style.color = Helpers.getTextColorForBackground(rgb[0], rgb[1], rgb[2]);

        if (hadPatternPreviously) {
            Helpers.removeElemStyleDict(elem);
        }
    }    

    if (colorOverlay && colorOverlay.curStrip === strip) {
        if (hadPatternPreviously) {
            colorOverlay.deselectPreset();
        }

        colorOverlay.updateToHSV(hsv);
    }

    serverCurStatus[strip] = {"color": hsv};
}

//Strip is #, Pattern is string
function setLocalPattern(strip, patternName) {
    var colorOverlayOpen = false;
    if (colorOverlay != null && colorOverlay.curStrip === strip) {
        colorOverlayOpen = true;
    }

    var elem = document.getElementById('cc'+(strip+1));
    if (elem && patterns[patternName]) {
        Helpers.setElemStyleToMatchStyleDict(patterns[patternName].display, elem, true);
    }

    serverCurStatus[strip] = {"pattern": patternName};

    if (colorOverlayOpen) {
        if (serverCurStatus.length > strip && "color" in serverCurStatus[strip]) {
            colorOverlay.updatePreview([0,1,0]);
        }

        colorOverlay.deselectPreset();
        colorOverlay.choosePreset(patternName);
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
            (hsv, chosenStripId) => postColor(chosenStripId, hsv),
            (patternId, chosenStripId) => postPattern(chosenStripId, patternId),
            startHSV
        );
        colorOverlay.curStrip = stripId;
        colorOverlay.setPreviewName(stripName);

        var availablePatterns = {};
        var oneColorStrip = config.strips[stripId].multiColor !== true;

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

        colorOverlay.deselectPreset();
        colorOverlay.setAvailablePatterns(availablePatterns);

    } else {
        colorOverlay = null;
    }
}