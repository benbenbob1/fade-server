/**
 * Ben Brown : benbrown52@gmail.com
 * https://benbrown.science
 */

var express           = require('express'),
    tls               = require('tls'),
    fs                = require('fs'),
    app               = express(),
    http              = require('http'),
    path              = require('path'),
    colorNamer        = require('color-namer'),
    WebSocketClient   = require('ws'),
    WebSocketServer   = require('socket.io'),
    bodyParser        = require('body-parser');
var patterns          = require('./js/patterns');
var FunctionScheduler = require('./js/scheduler');

var configFile = 'js/config.json';

var config = {
    maxLedsPerStrip   : 64,
    ledsPerStrip      : 30,
    numStrips         : 2,
    numOneColorStrips : 1,
    https             : true,
    port              : 80
}

config = JSON.parse(fs.readFileSync(path.resolve(__dirname, configFile)));
log("Starting with config: \n"+JSON.stringify(config));

var totalStrips = config.numStrips + config.numOneColorStrips;
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

/*
stripStatus = [
    { //Strip 0
        "color": [
            h: 0-1 //percent hue
            s: 0-1 //percent saturation
            v: 0-1 //percent value (brightness or lightness)
        ]
        // OR (should not be both)
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
            'pattern': 'waves'
        }


        config: {
            'pattern': 'waves',
            CONFIG_ID: NEW_VALUE
        }

    in (to the server):
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

var stripStatus = Array(totalStrips).fill({"color": OFF_COLOR_HSV});

app.use(bodyParser.json());
app.use('/js',
    express.static(__dirname + '/js'));
app.use('/js/socketio', 
    express.static(path.join(__dirname, '/node_modules/socket.io-client/dist/')));
app.use('/assets',
    express.static(__dirname + '/assets'));

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/page.html');
});

app.post('/api/color', function(req, res) {
    var r = req.body['r'] || 0;
    var g = req.body['g'] || 0;
    var b = req.body['b'] || 0;

    var h = req.body['h'] || 0;
    var s = req.body['s'] || 0;
    var v = req.body['v'] || 0;

    //TODO: fix

    endPattern();

    if (h == s == v == 0) {
        [h,s,v] = rgbToHsl(r, g, b);
    }

    log("Got API call. Setting to hsv ("+h+", "+s+", "+v+").");

    _writeColor(r, g, b, arrayOfNumbersUpTo(totalStrips));
    broadcastColor();
    res.send([r, g, b].join(", "));
});

app.post('/api/endpoint/echo', function(req, res) {
    var r = req.body.request;
    var color = null;
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
            }
        }
    }
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
    if (color) {
        //TODO FIX
        var arr = arrayOfNumbersUpTo(totalStrips);
        _writeColor(color.r, color.g, color.b, arr);
        _writeColor(color.r, color.g, color.b, arr);
        broadcastColor();
        output.response.outputSpeech.text = "Color set to '"+colorName+"'";
    } else {
        output.response.outputSpeech.text = "I could not find '"+colorName+"'";
    }
    res.send(output);
});

var serverOptions = (function(){
    var keyFile = "/etc/letsencrypt/live/lights.benbrown.science/privkey.pem";
    var certFile = "/etc/letsencrypt/live/lights.benbrown.science/fullchain.pem";
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
    //Redirect all incoming HTTP traffic
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
server.listen(port, function() {
    tryNum = 1;
    connectSocket();
    log("Fade-server is listening on port "+port);
});

log("Starting function scheduler (t=0)");
var scheduler = new FunctionScheduler();
scheduler.timerBegin();

// \/ functions

function moduleAvailable(name) {
    try {
        require.resolve(name);
        return true;
    } catch(e){}
    return false;
}

var clientSocket, serverSocket;
var tryNum, socketTimeout = null, maxTries = 7;
var chosenColors = [];

function log(text) {
    process.stdout.write(text+"\n");
}

function arrayOfNumbersUpTo(max) {
    var output = [];
    for (var i=0; i<max; i++) {
        output.push(i);
    }
    return output;
}

function socketErr() {
    clearTimeout(socketTimeout);
    socketTimeout = null;
    socketReady = false;
    if (tryNum > maxTries) {
        log(
            "Websocket failed to open after "
            + maxTries
            + " attempts. Exiting..."
        );
        process.exit();
    }
    else {
        var numSec = (5*Math.pow(2, tryNum));
        tryNum ++;
        var retryTime = numSec + " seconds";
        if (Math.round(numSec/60) > 1) {
            retryTime = Math.round(numSec/60) + " minutes";
        }
        log("Websocket failed to open. Retrying in "+retryTime+"...");
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
    //var addr = 'ws://rpi.student.rit.edu:7890';
    log("Connecting websocket to "+addr)
    clientSocket = new WebSocketClient(addr);
    clientSocket.on('open', function() {
        log("FC websocket opened successfully!");
    });

    clientSocket.on('error', socketErr);

    serverSocket = new WebSocketServer(server);
    serverSocket.on('connection', function(socket) {
        var connAddr = socket.request.connection.remoteAddress;
        socketReady = true;
        log("Socket connected "+connAddr);
        socket.join('color');

        broadcastToStrips()
        
        socket.on('newcolor', function(data) {
            console.log("rec: ", data);
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

//Broadcast all info about all strips to one socket (or every socket if null)
function broadcastToStrips(stripStatusArr=false, socketOrNull=false) {
    var out = socketOrNull || serverSocket;
    var stripStatusOut = stripStatusArr || stripStatus;

    var stripDict;
    for (var strip = 0; strip < stripStatusArr.length; strip++) {
        stripDict = stripStatusArr[strip];
        if ('pattern' in stripDict) {
            out.emit('color', {
                strip: strip,
                pattern: stripDict.pattern
            });
        } else {
            out.emit('color', {
                strip: strip,
                color: stripDict.color
            });
        }
    }
}

function setStripColorHSV(stripIdx=0, [h=0, s=0, v=0], 
    broadcast=true, socket=false) {
    var out = socket || serverSocket;

    _writeColorHSV(
        [ h, s, v ],
        stripIdx
    );
    if (broadcast) {
        broadcastColorHSV(socket, stripIdx);
    }
}

//Socket or false, stripIdx
//Broadcast the strip status to a socket about a strip
function broadcastColorHSV(socket=false, stripIdx=-1) {
    var out = socket || serverSocket;

    var emit = function(stripIdxToSend) {
        var stripColor = stripStatus[stripIdxToSend].color;
        out.emit('color', {
            h: stripColor[0],
            s: stripColor[1],
            v: stripColor[2],
            strip: stripIdxToSend
        });
    }

    if (stripIdx >= 0 && stripIdx < totalStrips) {
        emit(stripIdx);
    } else {
        for (var s=0; s<stripStatus.length; s++) {
            emit(s);
        }
    }
}

/*function broadcastColor(socket) {
    console.log("Broadcasting RGB (converted)");

    if (socket) {
        for (var s=0; s<stripStatus.length; s++) {
            var rgb = hslToRgb(
                stripStatus[s][0],
                stripStatus[s][1],
                stripStatus[s][2]
            );

            socket.emit('colorRGB', {
                r: rgb[0],
                g: rgb[1],
                b: rgb[2],
                strip: s
            });
        }
    } else {
        for (var s=0; s<stripStatus.length; s++) {
            var rgb = hslToRgb(
                stripStatus[s][0],
                stripStatus[s][1],
                stripStatus[s][2]
            );

            serverSocket.emit('colorRGB', {
                r: rgb[s][0],
                g: rgb[s][1],
                b: rgb[s][2],
                strip: s
            });
        }
    }
}*/

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
function getColorFromCommonName(colorName, type) {
    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    try {
        var name = colorNamer(colorName);
        var col = {};
        if (!type) {
            type = "ntc";
        }
        col = name[type][0]
        log("Running "+colorName+"["+type+"][0]", col)
        var rgb = hexToRgb(col.hex);
        if (rgb) {
            return rgb
        }
    } catch (e) {
        log("Err: Unknown color '"+colorName+"'")
    }
    return null;
}

/**
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
function hslToRgb(h, s, l) {
    var r, g, b;

    if(s == 0) {
        r = g = b = l; // achromatic
    } else {
        var hue2rgb = function hue2rgb(p, q, t) {
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
function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min) {
        h = s = 0; // achromatic
    } else {
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

//Starts a pattern, or stops it if given an id of "stop"
function startPattern(id, stripIdx=0) {
    if (id == 'stop') {
        endPattern(false, stripIdx);
        return;
    } else if ("pattern" in stripStatus[stripIdx]) {
        endPattern(false, stripIdx);
    }

    log("Starting: "+id);

    var pattern = patterns[id];
    delete stripStatus[stripIdx].color;
    stripStatus[stripIdx].pattern = pattern;
    var options = pattern.options || {};
    if (pattern != null && options.interval) {
        if (options.interval.defaultValue > 0) {
            var me = {};
            patternStart = function() { //Start pattern
                if (pattern.start) {
                    pattern.start.call(me);
                }
                if (options) {
                    var item;
                    for (var option in options) {
                        item = options[option];
                        if (item.defaultValue 
                            && typeof item.value === "undefined") {
                            item.value = item.defaultValue;
                        }
                    }
                }
            };
            me = {
                getColors: getColors,
                writeColor: writeColors,
                writeColorHSV: _writeColorHSV,
                writeLEDs: writeLEDs,
                hslToRgb: hslToRgb,
                options: options,
                variables: {},
                stipIdx: stripIdx
            };
            var justStarted = true;
            callPattern = function() {
                if (!pattern.interval && !justStarted) {
                    //breaking out is hard to do...
                    return;
                }
                justStarted = false;
                pattern.function.call(me);
            };
            //pattern.interval = setTimeout(callPattern, 
            //    options.interval.value);
            patternStart();
            pattern.PID =
                scheduler.addTask(callPattern, options.inverval.value);
        } else if (pattern.options.interval.defaultValue < 0) {
            pattern.interval = setTimeout(pattern.function, 
                -options.interval.value);
        } else if (pattern.options.interval.defaultValue === 0) {
            pattern.interval = pattern.function();
        }
    }
    broadcastToStrips(serverSocket);
}

//TODO: FIXME
function endPattern(dontEmit, stripIdx) {
    log("Stopping pattern");
    var thePattern = null;
    if ("pattern" in stripStatus[stripIdx]) {
        thePattern = stripStatus[stripIdx].pattern;
    } else {
        // Not running any pattern on this strip
        console.log("Not running any pattern on this strip");
        return;
    }

    /*
    var patternOnlyOnThisStrip = true;
    var patternUsage = 0;
    for (var s=0; s<stripStatus; s++) {
        if (s != stripIdx && "pattern" in stripStatus[s]) {
            patternOnlyOnThisStrip = false;
        }
    }


    if (patternOnlyOnThisStrip) {
        if (pattern.interval != null) {
            log("Stopping pattern timer "+patternInterval);
            clearTimeout(patternInterval);
        }
        pattern = null;
    }*/

    if (!isNaN(thePattern.PID)) { //thePattern has PID of type #
        scheduler.removeTask(thePattern.PID);
    }

    delete stripStatus[stripIdx].pattern;
    stripStatus[stripIdx].color = OFF_COLOR_HSV;
    if (!dontEmit) {
        broadcastPattern(serverSocket, stripIdx, 'stop');
    }
}

// [[r,g,b], [r,g,b]]
/*function writeColors(rgbArr) {
    var leds = [];
    for (var strip = 0; strip < rgbArr.length; strip++) {
        var aStrip = [];
        for (var led = 0; led < config.ledsPerStrip; led++) {
            aStrip.push([
                rgbArr[strip][0],
                rgbArr[strip][1],
                rgbArr[strip][2],
            ]);
        }
        leds.push(aStrip);
    }
    writeLEDs(leds, false);
}*/

//[[[r,g,b], [r,g,b], ...], [[r,g,b], [r,g,b], ...]]
//  or array of rgb if onestrip is true
function _writeLEDs(arr, onestrip) {
    //log("Writing leds to "+ arr.length +" strips");
    var packet = new Uint8ClampedArray(
        4 + (config.maxLedsPerStrip * config.numStrips) * 3
    );

    if (clientSocket.readyState != 1) { //if socket is not open
        // The server connection isn't open. Nothing to do.
        log("socket err! attempting to reconnect...");
        _stopPattenTimersOnly(); //Stop pattern from trying to run
        tryNum = 1;
        connectSocket();
        return false;
    }

    if (clientSocket.bufferedAmount > packet.length) {
        // The network is lagging, and we still haven't sent the previous frame.
        // Don't flood the network, it will just make us laggy.
        // If fcserver is running on the same computer, it should always be able
        // to keep up with the frames we send, so we shouldn't reach this point.
        return;
    }

    // Dest position in our packet. Start right after the header.
    var dest = 4;

    if (onestrip) {
        for (var led = 0; led < config.maxLedsPerStrip*config.numStrips; led++)
        {
            packet[dest++] = arr[led][0];
            packet[dest++] = arr[led][1];
            packet[dest++] = arr[led][2];
        }
    } else {
        for (var strip = 0; strip < arr.length; strip++) {
            //log("Strip ("+strip+") has "+arr[strip].length+" leds");
            for (var led = 0; led < arr[strip].length; led++) {
                packet[dest++] = arr[strip][led][0];
                packet[dest++] = arr[strip][led][1];
                packet[dest++] = arr[strip][led][2];
            }
            var toGo = config.maxLedsPerStrip - led;
            dest += (toGo*3);
        }
    }
    
    clientSocket.send(packet.buffer);

    return true;
}

//For writing to a non-fadecandy strip
//rgb = [r,g,b]
function writeOneColorStrip(rgb) {
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
}

//h/s/v out of 1.0
function _writeColorHSV([h, s, v], strip) {
    if (Array.isArray(strip)) {
        for (var i=0; i<strip.length; i++) {
            stripStatus[strip[i]] = {"color": [h, s, v]};
        }
    } else {
        if (strip < 0) {
            strip = 0;
        }
        stripStatus[strip] = {"color": [h, s, v]};
    }

    var stripStatusRGB = [];
    for (var s=0; s<stripStatus.length; s++) {
        stripStatusRGB[s] = {
            "color": hslToRgb(
                stripStatus[s].color[0],
                stripStatus[s].color[1],
                stripStatus[s].color[2]
            )
        };
    }

    if (stripStatus.length > config.numStrips) {
        writeOneColorStrip(stripStatusRGB.slice(config.numStrips)[0].color);
    }

    var toWrite = stripStatusRGB.slice(0,config.numStrips);

    var leds = [];
    for (var i=0; i<toWrite.length; i++) {
        var stripLEDs = [];
        for (var j=0; j<config.ledsPerStrip; j++) {
            stripLEDs.push(stripStatusRGB[i].color);
        }
        leds.push(stripLEDs);
    }

    return _writeLEDs(leds, false);
}

//r/g/b out of 255
function _writeColor(r, g, b, strip) {
    var hsv = rgbToHsl(r,g,b);
    if (Array.isArray(strip)) {
        for (var i=0; i<strip.length; i++) {
            stripStatus[strip[i]] = {"color": [hsv[0],hsv[1],hsv[2]]};
        }
    } else {
        stripStatus[strip] = {"color": [hsv[0],hsv[1],hsv[2]]};
    }

    if (stripStatus.length > config.numStrips) {
        writeOneColorStrip(stripStatus.slice(config.numStrips)[0].color);
    }

    var toWrite = stripStatus.slice(0,config.numStrips);

    var leds = [];
    for (var i=0; i<toWrite.length; i++) {
        var stripLEDs = [];
        for (var j=0; j<config.ledsPerStrip; j++) {
            stripLEDs.push(stripStatus[i]);
        }
        leds.push(stripLEDs);
    }

    return writeLEDs(leds, false);
}