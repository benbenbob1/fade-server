var express			= require('express'),
    tls             = require('tls'),
    fs              = require('fs'),
	app 			= express(),
	WebSocketClient	= require('ws'),
	WebSocketServer	= require('socket.io'),
	bodyParser		= require('body-parser');

var patterns 		= require('./js/patterns');

var maxLedsPerStrip	= 64;
var ledsPerStrip 	= 30;
var numStrips		= 2;

var stripStatus = [[255,255,255], [255,255,255]];

app.use(bodyParser.json());
app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', 'http://benbrown.science'); //allow downloading from benbrown.science
    next();
});
app.use('/js', express.static(__dirname + '/js'));
app.use('/js/socketio', express.static(__dirname + "/node_modules/socket.io-client/"));
app.use('/assets', express.static(__dirname + '/assets'));

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/page.html');
});

app.post('/api/color', function(req, res) {
    var r = req.body['red']   || 0;
    var g = req.body['green'] || 0;
    var b = req.body['blue']  || 0;
    _writeColor(r, g, b, [0,1]);
    broadcastColor();
    res.send([r, g, b].join(", "));
});

/*
//Callback contains a dict of options if available
function getOptions(callback) {
    var keyFile = "/etc/letsencrypt/live/rpi.student.rit.edu/privkey.pem";
    var certFile = "/etc/letsencrypt/live/rpi.student.rit.edu/fullchain.pem";
    fs.readFile(keyFile, function(err, data) {
        if (err) return callback({});
        var key = data.toString();
        fs.readFile(certFile, function(err, data) {
            if (err) return callback({});
            var cert = data.toString();
            callback({
                key: key,
                cert: cert
            });
        });
    });
}

getOptions(function(dict) {
    if (!dict.key) {
        console.log("Private/Public key files not found. Reverting to HTTP.");
        server = require('http').Server(app);
        server.listen(port, function() {
            tryNum = 1;
            connectSocket();
            console.log("Fade-server is listening (HTTP) on port "+port);
        });
    } else {
        console.log("Using HTTPS/TLS");
        server = require('https').Server(app);
        tls.createServer(dict, function(res) {
            tryNum = 1;
            connectSocket();
            console.log("Fade-server is listening (HTTPS) on port "+port);
        }).listen(port);
    }
    //
    console.log("Using HTTPS/TLS with options",dict);
    var server = require('https').Server(dict, app);
    server.listen(port, function() {
        tryNum = 1;
        connectSocket();
        console.log("Fade-server is listening (HTTPS) on port "+port);
    });
});
*/

var serverOptions = (function(){
    var keyFile = "/etc/letsencrypt/live/rpi.student.rit.edu/privkey.pem";
    var certFile = "/etc/letsencrypt/live/rpi.student.rit.edu/fullchain.pem";
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
var port = process.argv[2] || 80;
if (!serverOptions.key) {
    console.log("Private/Public key files not found. Reverting to HTTP.");
    server = require('http').Server(app);
} else {
    port = 443;
    console.log("Using HTTPS/TLS with cert.");
    server = require('https').Server(serverOptions, app);
}
server.listen(port, function() {
    tryNum = 1;
    connectSocket();
    console.log("Fade-server is listening on port "+port);
});

function moduleAvailable(name) {
    try {
        require.resolve(name);
        return true;
    } catch(e){}
    return false;
}

var clientSocket, serverSocket;
var tryNum, socketTimeout = null, maxTries = 7;
var patternInterval = null, patternHue = 0;
var pattern = null;
var chosenColors = [];

function log(text) {
	process.stdout.write(text+"\n");
}

function socketErr() {
	clearTimeout(socketTimeout);
    socketTimeout = null;
	if (tryNum > maxTries) {
		console.log("Websocket failed to open after "+maxTries+" attempts. Exiting...");
		process.exit();
	}
	else {
		var numSec = (5*Math.pow(2, tryNum));
		tryNum ++;
		var retryTime = numSec + " seconds";
		if (Math.round(numSec/60) > 1) {
			retryTime = Math.round(numSec/60) + " minutes";
		}
		console.log("Websocket failed to open. Retrying in "+retryTime+"...");
		socketTimeout = setTimeout(function() {
			connectSocket();
		}, numSec*1000);
	}
}

function connectSocket() {
	var addr = 'ws://127.0.0.1:7890';
	//var addr = 'ws://rpi.student.rit.edu:7890';
	console.log("Connecting websocket to "+addr)
	clientSocket = WebSocketClient(addr);
	clientSocket.on('open', function() {
		console.log("FC websocket opened successfully!");
	});

	clientSocket.on('error', socketErr);

	serverSocket = WebSocketServer(server);
	serverSocket.on('connection', function(socket) {
		log("Socket connected "+socket);
		socket.join('color');
		if (pattern != null) {
			socket.emit('color', {
				id: pattern.id,
				config: pattern.options
			});
		} else {
			broadcastColor(socket);
		}

		socket.on('newcolor', function(data) {
			log('Rec: '+JSON.stringify(data));
			if ('strip' in data) {
				if (pattern != null) {
					endPattern();
				}
				_writeColor(data.r, data.g, data.b, data.strip);
				broadcastColor();
			} else if ('id' in data) {
				startPattern(data.id);
			} else if ('config' in data) {
				if (pattern && pattern.options && pattern.options[data.config]) {
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

function broadcastColor(socket) {
	if (socket) {
		for (var s=0; s<stripStatus.length; s++) {
			socket.emit('color', {
				r: stripStatus[s][0],
				g: stripStatus[s][1],
				b: stripStatus[s][2],
				strip: s
			});
		}
	} else {
		for (var s=0; s<stripStatus.length; s++) {
			serverSocket.emit('color', {
				r: stripStatus[s][0],
				g: stripStatus[s][1],
				b: stripStatus[s][2],
				strip: s
			});
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

//Starts a pattern, or stops it if given an id of "stop"
function startPattern(id) {
	if (id == 'stop') {
		endPattern();
		return;
	} else if (pattern !== null || patternInterval !== null) {
		endPattern();
	}

	console.log("Starting: "+id);

	pattern = patterns[id];
	pattern.id = id;
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
						if (item.defaultValue && typeof item.value === "undefined") {
							item.value = item.defaultValue;
						}
					}
				}
			}
			me = {
				getColors: getColors,
				patternHue: patternHue,
				writeColor: writeColors,
				writeLEDs: writeLEDs,
				hslToRgb: hslToRgb,
				options: options,
				variables: {}
			};
			var justStarted = true;
			callPattern = function() {
				if (!patternInterval && !justStarted) { //breaking out is hard to do...
					return;
				}
				justStarted = false;
				pattern.function.call(me);
				patternInterval = setTimeout(callPattern, options.interval.value);
			}
			patternStart();
			callPattern();
		} else if (pattern.options.interval.defaultValue < 0) {
			patternInterval = setTimeout(pattern.function, -options.interval.value);
		} else if (pattern.options.interval.defaultValue === 0) {
			patternInterval = pattern.function();
		}
	}
	serverSocket.emit('color', {id: id, config: options});
}

function endPattern() {
	console.log("Stopping pattern");
	if (patternInterval != null) {
		clearTimeout(patternInterval);
	}

	patternInterval = null;
	pattern = null;
	serverSocket.emit('color', {id: 'stop'});
}

// [[r,g,b], [r,g,b]]
function writeColors(colors) {
	var leds = [];
	for (var strip = 0; strip < colors.length; strip++) {
		var aStrip = [];
		for (var led = 0; led < ledsPerStrip; led++) {
			aStrip.push([
				colors[strip][0],
				colors[strip][1],
				colors[strip][2],
			]);
		}
		leds.push(aStrip);
	}
	writeLEDs(leds, false);
}

//[[[r,g,b], [r,g,b], ...], [[r,g,b], [r,g,b], ...]] or array of rgb if onestrip is true
function writeLEDs(arr, onestrip) {
	//log("Writing leds to "+ arr.length +" strips");
	var packet = new Uint8ClampedArray(4 + (maxLedsPerStrip * arr.length) * 3);

    if (clientSocket.readyState != 1 ) { //if socket is not open
        // The server connection isn't open. Nothing to do.
        console.log("socket err! attempting to reconnect...");
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
    	for (var led = 0; led < maxLedsPerStrip*numStrips; led++) {
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
	    	var toGo = maxLedsPerStrip - led;
	    	dest += (toGo*3);
	    }
    }
    
    clientSocket.send(packet.buffer);

    return true;
}

//r/g/b out of 255
function _writeColor(r, g, b, strip) {
	if (Array.isArray(strip)) {
		for (var i=0; i<strip.length; i++) {
			stripStatus[strip[i]] = [r,g,b];
		}
	} else {
		stripStatus[strip] = [r,g,b];
	}

	//console.log("Writing "+JSON.stringify(stripStatus));
	//return;

	//serverSocket.to('color').emit('color', stripStatus);

    var packet = new Uint8ClampedArray(4 + (maxLedsPerStrip * stripStatus.length) * 3);

    if (clientSocket.readyState != 1 ) { //if socket is not open
        // The server connection isn't open. Nothing to do.
        console.log("socket err! attempting to reconnect...");
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

    // Sample the center pixel of each LED
    var stripNo = 0;
    for (var led = 0; led < (maxLedsPerStrip * stripStatus.length); led++) {
    	stripNo = Math.floor(led / maxLedsPerStrip);
        packet[dest++] = stripStatus[stripNo][0];
        packet[dest++] = stripStatus[stripNo][1];
        packet[dest++] = stripStatus[stripNo][2];
    }
    
    clientSocket.send(packet.buffer);

    return true;
}

