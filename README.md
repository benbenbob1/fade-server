# fade-server
Simple node.js server for running on a computer (I used a Raspberry Pi) connected to a fadecandy board. I am using two Neopixel LED strips that have 30 LEDs per strip.

This application relies on the fact that a Fadecandy server is currently running on the host computer.
https://github.com/scanlime/fadecandy/

# Installation
Run the command 'npm install' from inside the fade-server folder

# Running
Run the command 'node app.js' from inside the fade-server folder - this command may have to be run as root (hint: try 'sudo' before the command)

# Running on Startup
The following must be added to /etc/rc.local to get fade-server to run on boot.

'''
/usr/local/bin/fcserver /usr/local/bin/fcserver.json >/var/log/fcserver.log 2>&1 &
node /home/pi/fade-server/app.js > /var/log/fade-server.root.log &
'''