var loc = document.location.origin;
var socket = io('ws://'+loc);

var config = {};
var debug = false;
var stripLeds = [];

$(document).ready(function() {
    colorsLocked = localStorage.getItem('locked');

    if (colorsLocked === 'false') {
        colorsLocked = true;
        //Reverse so the function will act naturally
    } else {
        colorsLocked = false;
    }

    $.getJSON('/config', function(data) {
        config = data;
        displayConfig(config);
        setupStrips(config.strips);
    });
});

socket.on('debug', function(data) {
    if ('singlePacket' in data) {
        updateFromSinglePacket(data.singlePacket);
    } else if ('multiPacket' in data) {
        updateFromMultiPacket(data.multiPacket);
    }
});

socket.on('connect', function() {
    displayConnectionStatus(loc, true);
});
  
socket.on('disconnect', function() {
    displayConnectionStatus(loc, false);
});

socket.on('error', function(err) {
    displayConnectionStatus(loc, false);
    console.log(err);
});

function displayConnectionStatus(connected=false) {
    var connectStr = (connected ? 'Connected to' : 'Disconnected from') + ' ' + document.location.host;
    document.getElementById('debug-main-header').innerText = connectStr;
}

function updateFromSinglePacket(singlePacket) {
    config.strips.forEach((strip, idx) => {
        if (strip.multiColor !== true) {
            setStripLedTo(singlePacket, idx, 0);
        }
    });
}

function updateFromMultiPacket(multiPacket) {
    var headerLen = 4;

    var packetLeds = new Uint8ClampedArray(multiPacket, 0, multiPacket.length);
    var ledCt = Math.floor((packetLeds.length-headerLen)/3.0);

    var allMultiLeds = new Array(ledCt);
    var ledIdx = 0;
    var maxLedsPerStrip = config.maxLedsPerStrip;

    for (var led = 0; led < ledCt; led++) {
        allMultiLeds[ledIdx] = [
            packetLeds[(led*3)+headerLen+0],
            packetLeds[(led*3)+headerLen+1],
            packetLeds[(led*3)+headerLen+2]
        ];

        var stripIdx = Math.floor(ledIdx / maxLedsPerStrip);
        var ledIdxInStrip = ledIdx % maxLedsPerStrip;
        
        if (config.strips[stripIdx].numLeds > ledIdxInStrip) {
            setStripLedTo(allMultiLeds[ledIdx], stripIdx, ledIdxInStrip);
        }

        ledIdx ++;
    }
}

function setStripLedTo([r,g,b], stripIdx, ledIdx) {
    if (stripLeds.length > stripIdx) {
        stripLeds[stripIdx][ledIdx].style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    }
}

function setupStrips(stripInfo) {
    stripLeds = [];

    var container = document.getElementById('strips-debug-container');
    for (var stripId in stripInfo) {
        var thisStripLedElems = [];

        var strip = stripInfo[stripId];

        var header = document.createElement('h3');
        header.innerText = strip.name;

        var stripElem = document.createElement('div');
        stripElem.className = 'debug-strip';
        stripElem.id = 'debug-strip-' + stripId;

        if (strip.multiColor !== true) {
            strip.numLeds = 1;
        }

        for (var stripLed = 0; stripLed < strip.numLeds; stripLed++) {
            var led = document.createElement('div');
            led.className = 'debug-strip-led';

            thisStripLedElems.push(led);

            stripElem.appendChild(led);
        }

        stripLeds.push(thisStripLedElems);

        container.appendChild(header);
        container.appendChild(stripElem);
    }
}

function displayConfig(config) {
    var tableRow = (key, value, classModifier='') => {
        var extraClass = '';
        if (classModifier) {
            extraClass = ' ' + classModifier;
        }

        return '<tr><td class="config-key' + extraClass + '">' 
            + key 
            + '</td><td class="config-value' + extraClass + '">' 
            + value 
            + '</td></tr>';
    };

    var configTable = '<table id="config-table"><tr><th>{</th></tr>';
    for (var key in config) {
        var valueStr = config[key];
        if (key == 'strips' || (Array.isArray(valueStr) && typeof(valueStr[0]) === 'object')) {
            valueStr = '';
            for (var stripId in config[key]) {
                valueStr += '<table class="config-table-inner"><tr><th>{</th></tr>';
                var stripInfo = config[key][stripId];
                for (var stripKey in stripInfo) {
                    valueStr += tableRow(stripKey, stripInfo[stripKey], 'inner-table');
                }

                var extra = '';
                if (config[key].length - 1 > stripId) {
                    extra = ',';
                }

                valueStr += '<tr><th>}' + extra + '</th></tr></table>';
            }
        }
        configTable += tableRow(key, valueStr);
    }

    configTable += '<tr><th>}</th></tr></table>';

    document.getElementById('strips-config').innerHTML = configTable;
}