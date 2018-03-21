# fade-server
Simple node.js server for running on a computer (I used a Raspberry Pi) connected to a Fadecandy board. The server has a config file which allows for strips to be either single-color (these are RGB and transistor based - I use a SMD 5050 strip) or multi-colored (these are data based - I use Neopixel LED strips that have 30 LEDs per strip). The single-color strips are controlled using [Pi blaster](https://github.com/sarfata/pi-blaster), while the multi-color strips are controlled with the Fadecandy board, through the websocket set up by Fadecandy's `fcserver`.

This application relies on the fact that a [Fadecandy](https://github.com/scanlime/fadecandy) server is currently running on the host computer.

# Light strips
## Multi-colored
Data-based strips are easy to install. Instructions can be found on the GitHub page for [Fadecandy](https://github.com/scanlime/fadecandy). These strips allow for any LED to be individually controlled, and most of the patterns are written for these.

## Single-colored
RGB-based single-colored strips are a bit more difficult to install, but are much cheaper. Most types of LEDs will work, but I have only tested these with SMD 5050 types. A separate circuit board will need to be used, as the Pi cannot produce a PWM signal fast enough to drive LEDs. Instructions can be followed [here](https://dordnung.de/raspberrypi-ledstrip/). **At this time, only one single-colored strip can be used - every strip connected will be the same color.**

# Config
There is a file located at `js/config.json`. There are a few options you can set which are loaded as soon as the app is run.

## Options
`maxLedsPerStrip`: this is the number of LEDs per strip, imposed by the Fadecandy software. This part allows for multiple multi-colored strips to be used. Fadecandy takes in an address for each LED to be used, so to take advantage of this, the first LED on each strip plugged in to the Fadecandy board has an offset of (*index* * *maxLedsPerStrip*). This is cut off by `ledsPerStrip`.
`ledsPerStrip`: The actual number of LEDs per data strip. Fade-server will only write to this number of LEDs on each strip, but it can be more than you have if you have differently sized strips.
`numStrips`: The number of multi-colored strips in different ports on the fadecandy board (starting at the 0 position on th board).
`numOneColorStrips`: Right now should just be 0 or 1, depending on if you have a single-color strip attached to your Pi.
`https`: Use HTTPS for the web server? This requires a valid certificate.
`port`: Port to use for the web server. Defaults to 80.
`stripNames`: Array of strings which correspond to the strip names. Strips are displayed first by multi-colored, then single-colored.

# Patterns
I created a few patterns in the file `js/patterns.js`. This file contains everything needed for patterns to be used on both the client-side (it includes CSS and animations for drawing the pattern styles on the webpage), as well as the server. This file also has the configuration settings for each pattern, as well as how the configuration is displayed and updates (for instance, dragging a value slider should update the value displayed).

Most of the patterns are written for the multi-colored strips, and these will not show up on the single-colored strip color picker.

# Installation
Run the command 'npm install' from inside the fade-server folder. It is recommended that your config file be changed to suit your needs, such as the name of your strips (in order).

# Running
Run the command 'node app.js' from inside the fade-server folder - this command may have to be run as root. You can also add a port number at the end of the command. *This will overwrite the port provided in `config.js`*  This will run automatically if the next instruction is followed.

# Running on Startup
The following must be added to /etc/rc.local to get fade-server (as well as fcserver - if using the fadecandy board and a multi-colored strip) to run on boot. Make sure to copy `fcserver` from fadecandy's repo to `/usr/local/bin/` so it can be run as root without needing to access the user folder, which may be protected.

```
/usr/local/bin/fcserver /usr/local/bin/fcserver.json >/var/log/fcserver.log 2>&1 &
node /home/pi/fade-server/app.js > /var/log/fade-server.log &
```