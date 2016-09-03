var express			= require('express'),
	app 			= express(),
	server 			= require('http').Server(app),
	WebSocketClient	= require('ws'),
	WebSocketServer	= require('socket.io'),
	bodyParser		= require('body-parser');

var patterns 		= require('./js/patterns');

var port = process.env.PORT || 8080;

var maxLedsPerStrip		= 64;

var stripStatus = [[255,255,255], [255,255,255]];

app.use(bodyParser.json());

function moduleAvailable(name) {
    try {
        require.resolve(name);
        return true;
    } catch(e){}
    return false;
}


var clientSocket, serverSocket;
var tryNum, socketTimeout, maxTries = 7;
var patternInterval, patternHue = 0;
var pattern = null;
var chosenColors = [];

function log(text) {
	//process.stdout.write(text+"\n");
}

function socketErr() {
	clearTimeout(socketTimeout);
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
				id: pattern.id
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
				if (pattern && pattern.config && pattern.config[data.config]) {
					var me = {
						pattern: pattern
					};
					pattern.config[data.config].onchange.call(me, data.value);
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

app.use('/js', express.static(__dirname + '/js'));
app.use('/js/socketio', express.static(__dirname + "/node_modules/socket.io-client/"));
app.use('/assets', express.static(__dirname + '/assets'));

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/page.html');
});

server.listen(port, function() {
	tryNum = 1;
	connectSocket();
	console.log("Fade-server is listening on port "+port);
});

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
 * @return  Array           The RGB representation
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

function startPattern(id) {
	if (pattern !== null || patternInterval !== null) {
		endPattern();
	} else if (id === 'stop') {
		endPattern();
		return;
	}

	console.log("Starting: "+id)

	pattern = patterns[id];
	if (pattern != null) {
		if (pattern.interval > 0) {
			var me = {
				getColors: getColors,
				patternHue: patternHue,
				writeColor: writeColors,
				hslToRgb: hslToRgb,
				options: pattern.options
			};
			var justStarted = true;
			callPattern = function() {
				if (!patternInterval && !justStarted) { //breaking out is hard to do...
					return;
				}
				log(pattern.interval);
				justStarted = false;
				pattern.function.call(me);
				patternInterval = setTimeout(callPattern, pattern.interval);
			}
			callPattern();
		} else if (pattern.interval < 0) {
			patternInterval = setTimeout(pattern.function, -pattern.interval);
		} else if (pattern.interval === 0) {
			patternInterval = pattern.function();
		}
	}
	serverSocket.emit('color', {id: id});
}

function endPattern() {
	if (patternInterval != null) {
		console.log("Stopping pattern");
		clearTimeout(patternInterval);
	}

	serverSocket.emit('color', {id: 'stop'});
	patternInterval = null;
	pattern = null;
}

// [[r,g,b], [r,g,b]]
function writeColors(colors) {
	for (var i=0; i<colors.length; i++) {
		stripStatus[i] = colors[i];
	}
}

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

