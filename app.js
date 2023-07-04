/**
 * Ben Brown : benbrown52@gmail.com
 * https://benbrown.science
 */

const bodyParser      = require('body-parser'),
    colorNamer        = require('color-namer'),
    express           = require('express'),
    fs                = require('fs'),
    http              = require('http'),
    path              = require('path'),
    tls               = require('tls'),
    WebSocket         = require('ws'), // to fc server and clients
    url               = require('url');
    
const patterns          = require('./js/patterns');
const Helpers           = require('./js/helpers');
const Config            = require('./js/config');
const Scheduler         = require('./js/scheduler');
const FunctionScheduler = Scheduler.FunctionScheduler;

var app = express();

var configFile = './config.json';
config = new Config(fs.readFileSync(path.resolve(__dirname, configFile)));
log("Starting with config: " + config);

var totalMulticolorStrips = 0;
var hasSingleColorStrip = false;
config.strips.forEach((strip, idx) => {
    if (strip.multiColor === true) {
        totalMulticolorStrips ++;
    } else {
        hasSingleColorStrip = true;
    }
});

var debug = config.debugMode === true;
if (debug) {
    log("Debug mode enabled");
}

var socketReady = false;

var PIBLASTER_DEV = '/dev/pi-blaster';
var piblaster = null;
fs.stat(PIBLASTER_DEV, function(err, stats) {
    if (stats) {
        piblaster = fs.createWriteStream(PIBLASTER_DEV);
        piblaster.on('error', function(err) {
            log("Error with piblaster stream", err);
        })
    }
});

var ledPins = {
    red: 17,
    green: 22,
    blue: 24
};

const OFF_COLOR_HSV = [0, 1, 0];
const ROUND_DECIMALS = 3; // Round signals to this many decimal places
const SV_MARGIN_CAP = 0.05; // sat & value stick to min/max at this margin 

/*
stripStatus = [
    { //Strip 0
        "color": [
            h: 0-1 //percent hue
            s: 0-1 //percent saturation
            v: 0-1 //percent value (brightness or lightness)
        ]
        // OR (must not be both)
        "pattern": {
            id: patternName,
            PID: patternPID
        }
    }, ...
]

savedPatternConfigs = {
    "patternName": {
        "configName": configValue
    }
}
*/

/*
    Socket messages (server<->client)

    out (to the client):
        {
            'channel': 'color',
            'strip': 0,
            'color': [0, 1, 0.5]
        }
        // OR
        {
            'channel': 'color',
            'strip': 0,
            'pattern': 'waves'
        }
        // OR
        {
            'channel': 'config',
            'pattern': 'waves',
            'config': {
                'key': value
            }
        }

        debug: {
            'multiPacket': Uint8ClampedArray
        }
        // OR
        debug: {
            'singlePacket': [r,g,b]
        }

    in (to the server, no channel):
        {
            'strip': 1,
            'pattern': 'waves'
        }
        // OR
        {
            'strip': 1,
            'color': [0.5, 1, 0.5]
        }
        // OR
        {
            'pattern': 'waves',
            'config': { 'config_name': new_config_value }
        }
        // OR
        {
            'pattern': 'random',
            'request': true <- indicates this socket would like config info for the pattern
        }

    Upon receiving the pattern message, that pattern repeat function is
    added to the scheduler at the specified interval

    // TODO: adjustable interval
    // TODO: "droplets" pattern, random position iterate outwards at decreasing power (brightness?)

*/

const OFF_STATUS = {"color": OFF_COLOR_HSV};

var stripStatus = Array(totalMulticolorStrips).fill(OFF_STATUS);
var savedPatternConfigs = {};
var oneColorStripStatus = OFF_STATUS;
var multiStripLastLeds = Array(config.strips.length * config.maxLedsPerStrip).fill([0,0,0]);

app.use(bodyParser.json());
app.use('/js',
    express.static(__dirname + '/js'));
app.use('/config',
    express.static(__dirname + '/config.json'));
app.use('/js/socketio', 
    express.static(path.join(__dirname, 
        '/node_modules/socket.io-client/dist/')));
app.use('/assets',
    express.static(__dirname + '/assets'));

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/page.html');
});

var wsColorPath = '/ws_color'; // Path to color websocket
var wsDebugPath = '/ws_debug';

app.get('/debug', function(req, res) {
    if (debug) {
        res.sendFile(__dirname + '/debug.html');
    } else {
        res.statusCode = 403; // Forbidden
        res.send('App must have debug mode enabled');
    }
});
/*

// POST /api/color
{
    'r': 0-255,
    'g': 0-255,
    'b': 0-255,
    ['strip': -1, 0+]
}
OR
{
    'h': 0.0-1.0,
    's': 0.0-1.0,
    'v': 0.0-1.0,
    ['strip': -1, 0+]
} 

*/
// TODO: needs error catching
app.post('/api/color', function(req, res) {
    var r = req.body['r'] || 0;
    var g = req.body['g'] || 0;
    var b = req.body['b'] || 0;

    var h = req.body['h'] || 0;
    var s = req.body['s'] || 0;
    var v = req.body['v'] || 0;

    var strip = req.body['strip'] || -1;

    endPattern();

    if (h === 0 && s === 0 && v === 0) {
        [h,s,v] = Helpers.rgbToHsl(r, g, b);
    }

    log("Got API call. Setting to hsv ("+h+", "+s+", "+v+").");

    setStripColorHSV(strip, [h, s, v], true, false, true);
    res.send({
        "operation": "success",
        "strip": strip,
        "HSV": [h, s, v].join(", ")
    });
});

app.post('/api/endpoint/dialogflow', function(req, res) {
    var r = req.body;
    var output = {
        "fulfillmentText": "Sorry, that is not a valid command"
    };

    if (!r || !('queryResult' in r)) {
        log("Invalid request sent to /dialogflow: "+r);
        res.send("Invalid request");
        return;
    }

    var queryResult = r.queryResult;

    log("Request from dialogflow. Text: "+queryResult.queryText);
    log(JSON.stringify(queryResult));

    var color;
    var colorName = "";
    var strip = -1;
    var stripName = "";

    try {
        if (queryResult.intent.name == ("projects/fade-server/agent/intents/" + 
            "8631d9c3-ab67-4cde-b878-ec0d89d68bbf")) { // Set color
            var colorParam = queryResult.parameters.color;
            var stripParam = queryResult.parameters.strip;
            if (colorParam) {
                colorName = colorParam;
                color = getColorFromCommonName(
                    colorName.split(" ").join("")
                );
                if (!color) {
                    output.fulfillmentText = "Could not find color "+colorName;
                }
            }

            if (stripParam) {
                config.strips.forEach((strip, idx) => {
                    if (strip.name.toLowerCase() == stripParam.toLowerCase()) {
                        stripName = sName;
                        strip = idx;
                        // Should break here but that's not allowed in forEach
                    }
                });
            }
        }
    }
    finally {}

    if (color) {
        setStripColorHSV(
            strip,
            Helpers.rgbToHsl(color.r, color.g, color.b),
            true,
            false,
            true
        );
        var outputText = "Color set to " + colorName;


        if (strip != -1) {
            outputText += " on " + stripName;
        }

        output.fulfillmentText = outputText;
    }

    res.send(output);
});

app.post('/api/endpoint/echo', function(req, res) {
    var r = req.body.request;
    var color = null;
    var colorName = ''

    var output = {
        "version": "1.0",
        "sessionAttributes": {},
        "response": {
            "outputSpeech": {
              "type": "PlainText",
              "text": ""
            }
        }
    };

    if (r && r.type == "IntentRequest") {
        if (r.intent.name == "SetColor") {
            var slots = r.intent.slots;
            var type = null
            if (slots.Type) {
                type = slots.Type.value;
            }
            var colorName = r.intent.slots.Color.value;
            if (colorName) {
                color = getColorFromCommonName(
                    colorName.split(" ").join(""), type
                );
                if (color !== null) {
                    log("Setting color to ["+
                        color.r + "," +
                        color.g + "," +
                        color.b +
                        "] from echo '"+colorName + "'");
                    setStripColorHSV(
                        -1, 
                        Helpers.rgbToHsl(color.r, color.g, color.b), 
                        true,
                        false,
                        true
                    );
                    output.response.outputSpeech.text = "Color set to " + 
                    colorName;
                } else {
                    output.response.outputSpeech.text = "I could not find " +
                    colorName;
                }
                res.send(output);
                return;
            }
        }
    }
    
    output.response.outputSpeech.text = "Sorry, that is not a valid command";
    res.send(output);
});

var serverOptions = (function(){
    var keyFile = "/etc/letsencrypt/live/lit.benbrown.science/privkey.pem";
    var certFile ="/etc/letsencrypt/live/lit.benbrown.science/fullchain.pem";
    try {
        var kContents = fs.readFileSync(keyFile, 'utf8');
        var cContents = fs.readFileSync(certFile, 'utf8');
        return {
            key: kContents,
            cert: cContents
        }
    } catch (ex) {
        return {}
    }
})();

//node app.js 8080
var port = process.argv[2] || config.port;
if (!serverOptions.key || !config.https) {
    log("Private/Public key files not found or HTTPS set to false." +
        " Reverting to HTTP.");
    server = http.Server(app);
} else {
    //Redirect all incoming HTTP traffic to HTTPS
    http.createServer(function (req, res) {
        res.writeHead(301, { 
            "Location": "https://" + req.headers['host'] + req.url 
        });
        res.end();
    }).listen(port);

    port = 443;
    log("Using HTTPS/TLS with certs.");
    server = require('https').Server(serverOptions, app);
}

log("Starting function scheduler (t=0)");
var scheduler = new FunctionScheduler();
scheduler.timerBegin();

server.listen(port, function() {
    tryNum = 1;
    connectSocket();
    log("Fade-server is listening on port "+port);
});

server.on('upgrade', (req, socket, head) => {
    const pathname = req.url;

    if (serverSocket && pathname === wsColorPath) {
        serverSocket.handleUpgrade(req, socket, head, (ws) => {
            serverSocket.emit('connection', ws, req);
        });
    } else if (debugServerSocket && pathname === wsDebugPath) {
        debugServerSocket.handleUpgrade(req, socket, head, (ws) => {
            debugServerSocket.emit('connection', ws, req);
        });
    } else {
        socket.destroy();
    }
});



if (serverSocket != null)
{
    log("Destructing serverSocket");
    serverSocket.close();
    serverSocket = null;
}

if (debugServerSocket != null)
{
    log("Destructing debugServerSocket");
    debugServerSocket.close();
    debugServerSocket = null;
}
serverSocket = new WebSocket.Server({ noServer: true });
if (debug) {
    debugServerSocket = new WebSocket.Server({ noServer: true });

    debugServerSocket.on('connection', function(socket, req) {
        let connAddr = req.socket.remoteAddress;
        log("Debug socket connected "+connAddr);
    });
}

serverSocket.on('connection', function(socket, req) {
    let connAddr = req.socket.remoteAddress;
    log("Socket connected " + connAddr);
    
    // Small delay so we're sure the socket is ready to receive
    setTimeout(() => broadcastAllStrips(socket), 100);
    
    socket.on('message', function(dataStr) {
        var data = JSON.parse(dataStr);
        var strip = data.strip || 0;

        if ('color' in data) {
            setStripColorHSV(
                Number.parseInt(strip),
                [Number.parseFloat(data.color[0]), Number.parseFloat(data.color[1]), Number.parseFloat(data.color[2])],
                true
            );
        } else if ('pattern' in data) {
            let patternId = data.pattern;
            if ('config' in data) {
                if (data.pattern != null && data.config != null) {
                    adjustPatternConfig(patternId, data.config, true);
                }
            } else if ('request' in data) {
                log('Recd data request for '+patternId);
                if (patternId in savedPatternConfigs) {
                    emitConfigToSocket(socket, patternId, savedPatternConfigs[patternId]);
                }
            } else if ('strip' in data) {
                // Start pattern
                startPattern(
                    patternId, //pattern id
                    Number.parseInt(strip)
                );
            }
        } 
    });
});

// \/ functions

var clientSocket, serverSocket, debugServerSocket;
var tryNum, socketTimeout = null, maxTries = 7;

function log(text) {
    process.stdout.write(text+"\n");
}

function socketErr() {
    clearTimeout(socketTimeout);
    socketTimeout = null;
    socketReady = false;
    if (tryNum > maxTries) {
        if (debug) {
            log("Websocket failed to open after " + maxTries 
                + " attempts but we're in debug mode. Restarting at 0 attempts.");
            tryNum = 0;
            socketReady = true;
            connectSocket();
        } else {
            log(
                "Websocket failed to open after "
                + maxTries
                + " attempts. Exiting..."
            );
            process.exit();
        }
    }
    else {
        var numSec = (5*Math.pow(2, tryNum));
        var retryTime = numSec + " seconds";
        if (Math.round(numSec/60) > 1) {
            retryTime = Math.round(numSec/60) + " minutes";
        }
        log("Websocket failed to open. Retrying in " + retryTime
            + ". [" + tryNum + " / " + maxTries + "] ...");
        tryNum ++;
        socketTimeout = setTimeout(function() {
            connectSocket();
        }, numSec*1000);
    }
}

function objectToString(obj)
{
    let outStr = "{";
    var allPublicNames = Object.getOwnPropertyNames(obj);
    for (let keyIdx in allPublicNames) {
        let keyName = allPublicNames[keyIdx];
        let value = JSON.stringify(obj[keyName]);
        if (Array.isArray(value)) {
            value = value.join(", ");
        } else if (value instanceof String) {
            value = "\"" + value + "\"";
        }

        try {
            outStr += "\n\t" + keyName + ": " + value;
        }
        catch (e) {
            outStr += "\n\t" + keyName + ": ??";
        }
    }

    outStr += "\n}\n";

    return outStr;
}

function connectSocket() {
    if (socketReady)
    {
        log("connectSocket called but socket is ready");
        return;
    }

    var addr = 'ws://127.0.0.1:7890';
    log("Connecting to FC client websocket "+addr);

    if (clientSocket != null)
    {
        clientSocket.close();
        clientSocket = null;
    }

    clientSocket = new WebSocket(addr);
    clientSocket.on('open', function() {
        socketReady = true;
        log("FC websocket opened successfully!");
    });
    
    clientSocket.on('error', socketErr);
}

function roundDecimal(value) {
    return Number(value.toFixed(ROUND_DECIMALS));
}

function capAndRound(value, min, max) {
    var out = roundDecimal(value);
    if (out > max - SV_MARGIN_CAP) { 
        return max;
    } else if (out < min + SV_MARGIN_CAP) {
        return min;
    }
    
    return out;
}

function isOneStrip(stripIdx=-1)
{
    if (stripStatus.length <= stripIdx)
    {
        return true;
    }

    if (config.strips[stripIdx].multiColor !== true) {
        return true;
    }
    
    return false;
}

function setStripColorHSV(stripIdx=-1, [h=0, s=0, v=0], 
    broadcast=true, socket=false, instant=false) {
    var out = socket || serverSocket;

    h = roundDecimal(h, ROUND_DECIMALS);
    s = capAndRound(s, 0, 1);
    v = capAndRound(v, 0, 1);

    // if (debug) {
    //     log("[DEBUG] setStripColorHSV(stripIdx="+stripIdx+", [h="+h+", s="+s+", v="+v+"]"+
    //         ", broadcast="+broadcast+", socket="+socket+")");
    // }

    let writeTheColor = (aStripIdx) => {
        let stripDict = getStripStatus(stripIdx);
        if (stripDict == null) {
            return;
        }

        if ("pattern" in stripDict) {
            endPattern(true, aStripIdx);
        }

        writeAndBroadcast([h,s,v], socket, aStripIdx, broadcast, instant);
    };

    if (!Number.isSafeInteger(stripIdx) || stripIdx < 0) {
        for (var strip=0; strip<config.strips.length; strip++) {
            writeTheColor(strip);
        }
    } else {
        writeTheColor(stripIdx);
    }
}

function writeAndBroadcast([h,s,v], socket=false, stripIdx=0, broadcast=false, 
    instant=false) {
    
    //if (debug) {
    //    log("[DEBUG] writeAndBroadcast([h="+h+",s="+s+",v="+v+"], socket="+socket+
    //    ", stripIdx="+stripIdx+", broadcast="+broadcast+")");
    //}
    
    _writeColorHSV(
        [ h, s, v ],
        stripIdx
    );
    // Replay event to eliminate fadecandy's auto dithering
    if (instant) {
        _writeColorHSV(
            [ h, s, v ],
            stripIdx
        );  
    }
    
    if (broadcast) {
        var status = { "color": [h, s, v] };
        setStripStatus(stripIdx, status);

        broadcastColorHSV(socket, stripIdx);
    }
}

function getStripStatus(stripIdx=0) {
    if (isOneStrip(stripIdx)) {
        return oneColorStripStatus;
    }

    if (stripIdx >= 0 && stripIdx < stripStatus.length) { // If it's equal here then isOneStrip failed to detect
        return stripStatus[stripIdx];
    }

    return null;
}

function setStripStatus(stripIdx=0, newStatusDict) {
    if (isOneStrip(stripIdx)) {
        oneColorStripStatus = newStatusDict;
    }

    if (stripIdx >= 0 && stripIdx < stripStatus.length) { // If it's equal here then isOneStrip failed to detect
        stripStatus[stripIdx] = newStatusDict;
    }
}

// Broadcast all info about all strips to one socket (or every socket if false)
function broadcastAllStrips(socket=false) {
    let out = socket || serverSocket;

    for (let strip = 0; strip < stripStatus.length + hasSingleColorStrip; strip++) {
        outDict = {};
        let stripDict = getStripStatus(strip);
        if ('pattern' in stripDict) {
            emitPatternToSocket(out, strip, stripDict.pattern.id);
        } else {
            emitColorToSocket(out, strip, stripDict.color);
        }
    }

}

function emitColorToSocket(socket, stripIdx, colorRgbArr) {
    let data = {
        strip: stripIdx,
        color: colorRgbArr
    };
    _emitDataToSocket(socket, "color", data);
}

function emitPatternToSocket(socket, stripIdx, patternId) {
    let data = {
        strip: stripIdx,
        pattern: patternId
    };

    _emitDataToSocket(socket, "color", data);
}

function emitConfigToSocket(socket, patternId, config) {
    let data = {
        pattern: patternId,
        config: config
    };

    _emitDataToSocket(socket, "config", data);
}

function emitDebugPacket(data) {
    _emitRawDataToSocket(debugServerSocket, data);
}

function _emitDataToSocket(socket, channel, data) {
    data["channel"] = channel;

    var strToSend = JSON.stringify(data);
    if (debug) {
        log("[DEBUG] _emitDataToSocket Emitting: "+strToSend);
    }
    _emitRawDataToSocket(socket, strToSend);
}

function _emitRawDataToSocket(socket, data) {
    // Broadcast to all clients
    try {
        if (typeof socket.send !== "function") {
            socket.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(data);
                }
            });
        } else {
            socket.send(data);
        }
    } catch (e) {
        log("Error sending to socket: " + e);
    }
}

//Socket or false, stripIdx
//Broadcast the strip status to a socket about a strip
function broadcastColorHSV(socket=false, stripIdx=-1) {
    var out = socket || serverSocket;

    var emit = function(stripIdxToSend) {
        try {
            emitColorToSocket(out, stripIdxToSend, getStripStatus(stripIdxToSend).color);
        } catch (e) {
            log("broadcastColorHSV, emit | Could not emitColorToSocket: " + e);
        }
    }

    if (stripIdx >= 0 && stripIdx <= stripStatus.length) {
        emit(stripIdx);
    } else {
        for (var s=0; s<=stripStatus.length; s++) {
            emit(s);
        }
    }
}

function getColors() {
    var colorArr = [];
    for (var s=0; s<stripStatus.length; s++) {
        colorArr.push([
            stripStatus[s][0],
            stripStatus[s][1],
            stripStatus[s][2],
        ]);
    }
    return colorArr;
}

//{r: 0-255, g: 0-255, b: 0-255} or null
/**
 * Converts a color name into discrete r, g, b values using color-namer
 * https://www.npmjs.com/package/color-namer
 * Hex to RGB taken from:
 * http://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
 *
 * @param   colorName   Query to try
 * @param   type        One of roygbiv, basic, html, x11, pantone, 
 *                      or ntc (default)
 * @return  {r: 0-255, g: 0-255, b: 0-255} or null
 */
function getColorFromCommonName(colorName, type="ntc") {
    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    var name;
    try {
        name = colorNamer(colorName);    
    } catch (e) {
        // Couldn't find color
        return null;
    }
    
    if (name === null) {
        return null;
    }
    var col = {};
    if (!type) {
        var minDist = 300;
        for (let typ in name) {
            if (name[typ].length > 0) {
                var dist = name[typ][0].distance;
                if (dist === 0) {
                    type = typ;
                    break;
                }
                if (dist < minDist) {
                    minDist = dist;
                    type = typ;
                }
            }
        }
    }

    if (!name[type] || name[type].length == 0) {
        return null;
    }

    col = name[type][0];

    var rgb = hexToRgb(col.hex);
    if (rgb) {
        return rgb;
    }
    return null;
}

function adjustPatternConfig(patternId, newConfig={}, broadcast=true) {
    if (!newConfig || newConfig === {}) {
        return;
    }

    if (!savedPatternConfigs[patternId]) {
        savedPatternConfigs[patternId] = {};
    }

    for (let configName in newConfig) {
        savedPatternConfigs[patternId][configName] = newConfig[configName];

        // Special case(s)
        if (configName === "__interval") {
            adjustSpeedIntervalForPattern(patternId, savedPatternConfigs[patternId][configName]);
        }
    }

    if (broadcast) {
        emitConfigToSocket(serverSocket, patternId, savedPatternConfigs[patternId]);
    }
}

function adjustSpeedIntervalForPattern(patternId, newInterval) {
    let PIDs = [];
    for (let strip = 0; strip < stripStatus.length + hasSingleColorStrip; strip++) {
        const stripDict = getStripStatus(strip);
        if ("pattern" in stripDict) {
            if (stripDict.pattern.id === patternId) {
                PIDs.push(stripDict.pattern.PID);
            }
        }
    }

    log("Changing interval of PID ["+PIDs.join(", ")+"] to "+newInterval);

    for (let pid in PIDs) {
        scheduler.changeTaskInterval(pid, newInterval);
    }
}

//Starts a pattern, or stops it if given an id of "stop"
function startPattern(id, stripIdx=0, broadcast=true) {
    const stripDict = getStripStatus(stripIdx);
    let newStripDict = {};

    if (id == 'stop') {
        endPattern(false, stripIdx);
        return;
    } else if ("pattern" in stripDict) {
        let stopOnly = false;
        if (stripDict.pattern.id == id) {
            stopOnly = true;
        }
        endPattern(false, stripIdx);
        if (stopOnly) {
            return;
        }
    }

    let patternObj = patterns[id];
    let runningPatternInfo = { "id": id };
    if (patternObj != null) {
        let patternContext = {
            getColors: getColors,
            writeColorHSV: _writeColorHSV,
            writeStripLeds: _writeStripLeds,
            hslToRgb: Helpers.hslToRgb,
            options: {},
            variables: {},
            stripIdx: stripIdx,
            numLeds: isOneStrip(stripIdx) ? 1 : config.strips[stripIdx].numLeds
        };


        if (id in savedPatternConfigs) {
            patternObj.options = savedPatternConfigs[id];
        } else if (patternObj.options) {
            savedPatternConfigs[id] = {};
            
            for (let option in patternObj.options) {
                let item = patternObj.options[option];
                if (("defaultValue" in item) && typeof item.value === "undefined") {
                    savedPatternConfigs[id][option] = item.defaultValue;
                }
            }

            patternContext.options = savedPatternConfigs[id];
        }

        let patternInterval = savedPatternConfigs[id].__interval > 0 ? savedPatternConfigs[id].__interval : 1000; // default is 1 tick per second

        if (patternObj.start) {
            patternObj.start.call(patternContext);
        }

        let newPID = scheduler.addTask(patternObj.function, patternInterval, patternContext);
        runningPatternInfo.PID = newPID;
        newStripDict.pattern = runningPatternInfo;
        
        log("Started pattern: "+id+" on strip "+stripIdx+" at interval "+patternInterval+": "+objectToString(newStripDict.pattern));
    }

    setStripStatus(stripIdx, newStripDict);

    if (broadcast) {
        emitPatternToSocket(serverSocket, stripIdx, id);
    }
}

function endPattern(dontEmit=false, stripIdx=-1) {
    let stripDict = getStripStatus(stripIdx);

    log("Stopping pattern on strip " + stripIdx);
    var thePattern;

    if ("pattern" in stripDict) {
        thePattern = stripDict.pattern;
    } else {
        // Not running any pattern on this strip
        log("Not running any pattern on this strip");
        return;
    }

    if (!isNaN(thePattern.PID)) { //thePattern has PID of type #
        scheduler.removeTask(thePattern.PID);
    }

    delete stripDict.pattern;
    stripDict.color = OFF_COLOR_HSV;
    if (!dontEmit) {
        emitColorToSocket(serverSocket, stripIdx, stripDict.color);
    }
}

// Write an array of rgb colors to a multi-color strip
function _writeStripLeds(arr, stripIdx=0) {
    // Write only to stripIdx slice with arr of [[r,g,b], [r,g,b], ...]
    _writeLEDs(arr, stripIdx, false, true);
}

//[[[r,g,b], [r,g,b], ...], [[r,g,b], [r,g,b], ...]]
//  or array of [r,g,b] if oneColorToStrip is true
//  or array of [[r,g,b], [r,g,b], ...] if rgbArrToStrip is true
function _writeLEDs(arr, stripIdx=0, oneColorToStrip=false, rgbArrToStrip=false) {
    //log("_writeLEDs: [" + arr+ "], oCTS: " + oneColorToStrip + ", rATS: "+rgbArrToStrip);
    var headerLen = 4;
    var packet = new Uint8ClampedArray(
        headerLen + (config.maxLedsPerStrip * config.strips.length) * 3
    );

    if (clientSocket.readyState != 1 && !debug) { // if socket is not open
        // The server connection isn't open. Nothing to do.
        log("socket err! attempting to reconnect...");
        scheduler.stopTimer(); //Stop pattern from trying to run
        tryNum = 1;
        connectSocket();
        return false;
    }

    if (clientSocket.bufferedAmount > packet.length) {
        // The network is lagging, and we still haven't sent the previous frame.
        // Don't flood the network, it will just make us laggy.
        // If fcserver is running on the same computer, it should always be able
        // to keep up with the frames we send, so we shouldn't reach this point.
        return false;
    }

    // Dest position in our packet. Start right after the header.
    let dest = headerLen;
    let ledDest = 0;

    if (oneColorToStrip || rgbArrToStrip) {
        ledDest = config.maxLedsPerStrip*stripIdx;
        if (oneColorToStrip) {
            let channel = 0;
            for (let led = 0; led < config.strips[stripIdx].numLeds; led++)
            {
                multiStripLastLeds[ledDest++] = arr;
            }
        } else if (rgbArrToStrip) {
            for (let led = 0; led < config.strips[stripIdx].numLeds && led < arr.length; led++)
            {
                multiStripLastLeds[ledDest++] = arr[led];
            }
        }
        
    } else {
        for (let strip = 0; strip < arr.length; strip++) {
            for (let led = 0; led < arr[strip].length; led++) {
                multiStripLastLeds[ledDest++] = arr[strip][led];
            }

            let toGo = config.maxLedsPerStrip - led;
            ledDest += toGo;
        }
    }

    for (let led = 0; led < multiStripLastLeds.length; led++) {
        packet[dest++] = multiStripLastLeds[led][0];
        packet[dest++] = multiStripLastLeds[led][1];
        packet[dest++] = multiStripLastLeds[led][2];
    }

    if (debug) {
        emitDebugPacket( packet.buffer );
    }
    
    if (clientSocket.readyState === 1) { // check one more time
        clientSocket.send(packet.buffer);
        return true;
    }

    return false;
}

//For writing to a non-fadecandy strip
//rgb = [r,g,b]
function _writeOneColorStrip(rgb) {
    var red = rgb[0]/255.0;
    var green = rgb[1]/255.0;
    var blue = rgb[2]/255.0;
    function write(pin, value) {
        return pin+"="+value+"\n";
    }
    if (piblaster) {
        piblaster.write(write(ledPins.red, red));
        piblaster.write(write(ledPins.green, green));
        piblaster.write(write(ledPins.blue, blue));
    }

    if (debug) {
        var rgbBuffer = new Uint8ClampedArray(rgb);
        emitDebugPacket(rgbBuffer.buffer);
    }
}

//h/s/v out of 1.0, strip must be valid index or array of indices
function _writeColorHSV([h, s, v], strip) {
    var rgb = Helpers.hslToRgb(h, s, v);
    var sendColor = (rgb, stripIdx) => {
        if (isOneStrip(strip)) {
            _writeOneColorStrip(rgb);
        } else {
            _writeLEDs(rgb, stripIdx, true, false);
        }
    };

    if (Array.isArray(strip)) {
        for (var i=0; i<strip.length; i++) {
            //stripLeds[strip[i]] = [h, s, v];
            sendColor(rgb, strip[i]);
        }
    } else {
        if (strip < 0 || strip > config.strips.length) {
            strip = 0;
        }

        sendColor(rgb, strip);
    }

    return true;
}
