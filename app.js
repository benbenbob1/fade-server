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
    
var patterns          = require('./js/patterns');
var Helpers           = require('./js/helpers');
var Config            = require('./js/config');
var FunctionScheduler = require('./js/scheduler');

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

var socketReady = true;

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
    red: 23,
    green: 18,
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
        "pattern": copy of pattern object (from patterns.js) 
            WITH pid value
    }, ...
]
*/

/*
    Socket messages (server<->client)

    out (to the client):
        color: {
            'strip': 0,
            'color': [0, 1, 0.5]
        }
        // OR
        color: {
            'strip': 0,
            'pattern': 'waves',
            'config': {...}
        }

        debug: {
            'multiPacket': Uint8ClampedArray
        }
        // OR
        debug: {
            'singlePacket': [r,g,b]
        }


        config: {
            'pattern': 'waves',
            CONFIG_ID: NEW_VALUE
        }

    in (to the server): /color
        newcolor: {
            'strip': 1,
            'pattern': 'waves'
        }
        // OR
        newcolor: {
            'strip': 1,
            'color': [0.5, 1, 0.5]
        }
    


        newconfig: {
            'pattern': 'waves',
            CONFIG_ID: NEW_VALUE
        }

    Upon receiving the newcolor pattern message, that pattern repeat function is
    added to the scheduler at the specified interval

    //TODO make PID non static per pattern object, make options static
    //TODO: update scheduled task interval (need to add feature to scheduler)
*/

var stripStatus = Array(totalMulticolorStrips).fill({"color": OFF_COLOR_HSV});
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
                    }
                });
            }
        }
    }
    finally {}

    if (color) {
        setStripColorHSV(
            -1,
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
            socketReady = true;
            connectSocket();
        }, numSec*1000);
    }
}

function connectSocket() {
    if (!socketReady) {
        return;
    }

    var addr = 'ws://127.0.0.1:7890';
    log("Connecting to FC client websocket "+addr)
    clientSocket = new WebSocket(addr);
    clientSocket.on('open', function() {
        log("FC websocket opened successfully!");
    });

    clientSocket.on('error', socketErr);

    log("Starting ws server");
    serverSocket = new WebSocket.Server({ noServer: true });
    if (debug) {
        debugServerSocket = new WebSocket.Server({ noServer: true });
        debugServerSocket.on('connection', function(socket, req) {
            var connAddr = req.connection.remoteAddress;
            log("Debug socket connected "+connAddr);
        });
    }

    server.on('upgrade', (req, socket, head) => {
        const pathname = url.parse(req.url).pathname;

        try {
            if (pathname === wsColorPath) {
                serverSocket.handleUpgrade(req, socket, head, (ws) => {
                    serverSocket.emit('connection', ws, req);
                });
            } else if (debugServerSocket && pathname === wsDebugPath) {
                debugServerSocket.handleUpgrade(req, socket, head, (ws) => {
                    debugServerSocket.emit('connection', ws, req);
                });
            }
        }
        catch (e) {}
    });

    serverSocket.on('connection', function(socket, req) {
        var connAddr = req.connection.remoteAddress;
        socketReady = true;
        log("Socket connected "+connAddr);

        broadcastAllStrips(socket);
        
        socket.on('message', function(dataStr) {
            var data = JSON.parse(dataStr);
            //console.log("rec: ", data);
            if (!('strip' in data)) {
                return;
            }
            var strip = data.strip || 0;

            if ('color' in data) {
                setStripColorHSV(
                    strip,
                    data.color,
                    true
                );
            } else if ('pattern' in data) {
                // Start pattern
                startPattern(
                    data.pattern, //pattern id
                    strip
                );
            } else if ('config' in data) {
                //TODO:FIXCONFIG
                if (pattern && pattern.options &&
                    pattern.options[data.config]) {
                    var input = pattern.options[data.config].config.input;
                    if (input && typeof input.update !== undefined) {
                        pattern.options[data.config].displayValue = data.value;
                        input.update.call(pattern, data.value);
                    }
                }
            }
        });
    });
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

function setStripColorHSV(stripIdx=-1, [h=0, s=0, v=0], 
    broadcast=true, socket=false, instant=false) {
    var out = socket || serverSocket;

    h = roundDecimal(h, ROUND_DECIMALS);
    s = capAndRound(s, 0, 1);
    v = capAndRound(v, 0, 1);

    if (debug) {
        log("[DEBUG] setStripColorHSV(stripIdx="+stripIdx+", [h="+h+", s="+s+", v="+v+"]"+
            ", broadcast="+broadcast+", socket="+socket+")");
    }

    if (!Number.isSafeInteger(stripIdx) || stripIdx < 0) {
        for (var strip=0; strip<config.strips.length; strip++) {
            writeAndBroadcast([h,s,v], socket, strip, broadcast, instant);
        }
    } else {
        writeAndBroadcast([h,s,v], socket, stripIdx, broadcast, instant);
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
        stripStatus[stripIdx] = { "color": [h, s, v] }
        broadcastColorHSV(socket, stripIdx);
    }
}

//Broadcast all info about all strips to one socket (or every socket if false)
function broadcastAllStrips(socket=false, stripStatusArr=false) {
    var out = socket || serverSocket;
    var stripStatusOut = stripStatusArr || stripStatus;

    var stripDict;
    for (var strip = 0; strip < stripStatusOut.length; strip++) {
        outDict = {};
        stripDict = stripStatusOut[strip];
        if ('pattern' in stripDict) {
            emitPatternToSocket(out, strip, stripDict.pattern.id, stripDict.pattern.config);
        } else {
            emitColorToSocket(out, strip, stripDict.color);
        }
    }
}

function emitColorToSocket(socket, stripIdx, colorRgbArr) {
    var data = {
        strip: stripIdx,
        color: colorRgbArr
    };
    _emitDataToSocket(socket, "color", data);
}

function emitPatternToSocket(socket, stripIdx, patternId, configData) {
    var data = {
        strip: stripIdx,
        pattern: patternId,
        config: configData
    };
    _emitDataToSocket(socket, "color", data);
}

function emitDebugPacket(data) {
    _emitRawDataToSocket(debugServerSocket, data);
}

function _emitDataToSocket(socket, channel, data) {
    data["channel"] = channel;

    if (debug) {
        var dictStr = "{";
        for (var key in data) {
            dictStr += "\n\t"+key+": "+data[key];
        }
        dictStr += "\n}";
        log("[DEBUG] Emitting: "+dictStr);
    }

    var strToSend = JSON.stringify(data);
    _emitRawDataToSocket(socket, strToSend);
}

function _emitRawDataToSocket(socket, data) {
    // Broadcast to all clients
    if (typeof socket.send !== "function") {
        socket.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    } else {
        socket.send(data);
    }
}

//Socket or false, stripIdx
//Broadcast the strip status to a socket about a strip
function broadcastColorHSV(socket=false, stripIdx=-1) {
    var out = socket || serverSocket;

    var emit = function(stripIdxToSend) {
        emitColorToSocket(out, stripIdxToSend, stripStatus[stripIdxToSend].color);
    }

    if (stripIdx >= 0 && stripIdx < stripStatus.length) {
        emit(stripIdx);
    } else {
        for (var s=0; s<stripStatus.length; s++) {
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

//Returns true if any patterns are currently active
function showingPatterns() {
    for (var strip=0; strip<stripStatus.length; strip++) {
        if ('pattern' in stripStatus[strip]) {
            return true;
        }
    }

    return false;
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
        for (var typ in name) {
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

//Starts a pattern, or stops it if given an id of "stop"
function startPattern(id, stripIdx=0, broadcast=true) {
    if (id == 'stop') {
        endPattern(false, stripIdx);
        return;
    } else if ("pattern" in stripStatus[stripIdx]) {
        var stopOnly = false;
        if (stripStatus[stripIdx].pattern.id == id) {
            stopOnly = true;
        }
        endPattern(false, stripIdx);
        if (stopOnly) {
            return;
        }
    }

    log("Starting pattern: "+id);

    var pattern = patterns[id];
    delete stripStatus[stripIdx].color;
    stripStatus[stripIdx].pattern = pattern;
    stripStatus[stripIdx].pattern.id = id;
    var options = pattern.options || {};
    var patternInterval = 1000; // 1 tick per second
    if (pattern != null && patternInterval) {
        var me = {};
        patternStart = function() { //Start pattern
            if (options) {
                var item;
                for (var option in options) {
                    item = options[option];
                    if (item.defaultValue && typeof item.value === "undefined") {
                        item.value = item.defaultValue;
                    }
                }
            }
            if (pattern.start) {
                pattern.start.call(me);
            }
        };
        me = {
            getColors: getColors,
            writeColorHSV: _writeColorHSV,
            writeStripLeds: _writeStripLeds,
            hslToRgb: Helpers.hslToRgb,
            options: options,
            variables: {},
            stripIdx: stripIdx
        };
        var justStarted = true;
        callPattern = function() {
            justStarted = false;
            pattern.function.call(me);
        };
        patternStart();
        pattern.PID = scheduler.addTask(callPattern, patternInterval);
    }

    if (broadcast) {
        broadcastAllStrips(serverSocket);
    }
}

function endPattern(dontEmit=false, stripIdx=-1) {
    log("Stopping pattern");
    var thePattern;
    if ("pattern" in stripStatus[stripIdx]) {
        thePattern = stripStatus[stripIdx].pattern;
    } else {
        // Not running any pattern on this strip
        log("Not running any pattern on this strip");
        return;
    }

    if (!isNaN(thePattern.PID)) { //thePattern has PID of type #
        scheduler.removeTask(thePattern.PID);
    }

    delete stripStatus[stripIdx].pattern;
    stripStatus[stripIdx].color = OFF_COLOR_HSV;
    if (!dontEmit) {
        broadcastAllStrips(serverSocket);
    }
}

function _writeStripLeds(arr, stripIdx=0) {
    _writeLEDs(arr, true, stripIdx);
}

//[[[r,g,b], [r,g,b], ...], [[r,g,b], [r,g,b], ...]]
//  or array of rgb if oneStrip is true (will send signal to stripIdx)
function _writeLEDs(arr, oneStrip, stripIdx=0) {
    var headerLen = 4;
    var packet = new Uint8ClampedArray(
        headerLen + (config.maxLedsPerStrip * config.strips.length) * 3
    );

    if (clientSocket.readyState != 1 && !debug) { //if socket is not open
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
    var dest = headerLen;
    var ledDest = 0;

    if (oneStrip) {
        //packet[dest+=config.maxLedsPerStrip*stripIdx*3] = 0;
        ledDest = config.maxLedsPerStrip*stripIdx;
        for (var led = 0; led < config.strips[stripIdx].numLeds; led++)
        {
            /*packet[dest++] = arr[led][0];
            packet[dest++] = arr[led][1];
            packet[dest++] = arr[led][2];*/
            multiStripLastLeds[ledDest++] = arr;
        }
    } else {
        for (var strip = 0; strip < arr.length; strip++) {
            for (var led = 0; led < arr[strip].length; led++) {
                // packet[dest++] = arr[strip][led][0];
                // packet[dest++] = arr[strip][led][1];
                // packet[dest++] = arr[strip][led][2];
                multiStripLastLeds[ledDest++] = arr[strip][led];
            }

            var toGo = config.maxLedsPerStrip - led;
            //dest += (toGo*3);
            ledDest += toGo;
        }
    }

    for (var led = 0; led < multiStripLastLeds.length; led++) {
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
        if (config.strips[stripIdx].multiColor === true) {
            _writeLEDs(rgb, true, stripIdx);
        } else {
            _writeOneColorStrip(rgb);
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
        //stripLeds[strip] = [h, s, v];
    }

    /*var stripLedsRGB = [];
    for (var s=0; s<stripLeds.length; s++) {
        stripLedsRGB[s] = Helpers.hslToRgb(
            stripLeds[s][0],
            stripLeds[s][1],
            stripLeds[s][2]
        );
    }

    var wroteOneColorStrip = false;
    var hasMultiColorStrip = false;

    var packet = [];
    config.strips.forEach((strip, idx) => {
        if (strip.multiColor === true) {
            hasMultiColorStrip = true;
            var stripPacket = [];
            for (var j=0; j<strip.numLeds; j++) {
                stripPacket.push(stripLedsRGB[idx]);
            }
            packet.push(stripPacket);
        }
        else if (!wroteOneColorStrip) {
            _writeOneColorStrip(stripStatusRGB[idx]);
            wroteOneColorStrip = true; // we only need to write this once
        }
    });

    if (hasMultiColorStrip) {
        return _writeLEDs(packet, false);
    }*/

    return true;
}