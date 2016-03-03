var express			= require('express'),
	app 			= express(),
	server 			= require('http').Server(app),
	WebSocketClient	= require('ws'),
	WebSocketServer	= require('socket.io'),
	bodyParser		= require('body-parser');

var port = process.env.PORT || 80;

var maxLedsPerStrip		= 64;

var stripStatus = [[255,255,255], [255,255,255]];

app.use(bodyParser.json());


var clientSocket, serverSocket;
var tryNum, socketTimeout, maxTries = 7;

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
	console.log("Connecting websocket to "+addr)
	clientSocket = WebSocketClient(addr);
	clientSocket.on('open', function() {
		console.log("FC websocket opened successfully!");
	});

	clientSocket.on('error', socketErr);

	serverSocket = WebSocketServer(server);
	serverSocket.on('connection', function(socket) {
		socket.join('color');
		socket.emit('color', stripStatus);

		socket.on('newcolor', function(data) {
			writeColor(data.r, data.g, data.b, data.strip);
		})
	});

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



function writeColor(r, g, b, strip) {
	if (Array.isArray(strip)) {
		for (var i=0; i<strip.length; i++) {
			stripStatus[strip[i]] = [r,g,b];
		}
	} else {
		stripStatus[strip] = [r,g,b];
	}

	serverSocket.to('color').emit('color', stripStatus);

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