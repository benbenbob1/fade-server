// Negative pattern interval starts after that many seconds (*-1)
// 0 for interval has no delay and no repeat - the function MUST return a TIMEOUT!

// Current selected colors are located at this.chosenColors[strip] = [r, g, b]
// this.patternHue = current hue

var __configs = {
	speed: {
	    label: {
	        left: {
	            id: "",
	            text: "Speed"
	        },
	        right: {
	            id: "config-speed-input-percent",
	            text: "100%"
	        }
	    },
	    input: {
	        type: "range",
	        updateOnChange: true,
	        startValue: 100,
	        range: {
	            min: 10,
	            max: 500
	        }
	    },
	    onchange: function(value) {
	    	this.options.interval = Math.floor(1/(value/100) * this.options.startInterval);
	    }
	},
	speed_fast: {
	    label: {
	        left: {
	            id: "",
	            text: "Speed"
	        },
	        right: {
	            id: "config-speed-input-percent",
	            text: "100%"
	        }
	    },
	    input: {
	        type: "range",
	        updateOnChange: true,
	        startValue: 100,
	        range: {
	            min: 10,
	            max: 1000
	        }
	    },
	    onchange: function(value) {
	    	this.options.interval = Math.floor(1/(value/100) * this.options.startInterval);
	    }
	},
	fade: {
        label: {
            left: {
                id: "",
                text: "Fade"
            }
        },
        input: {
            type: "checkbox",
            updateOnChange: false,
            startValue: false
        },
        onchange: function(value) {
        	this.options.fade = value;
        }
    },
    brightness: {
        label: {
            left: {
                id: "",
                text: "Brightness"
            },
            right: {
                id: "config-brightness-input-percent",
                text: "100%"
            }
        },
        input: {
            type: "range",
            updateOnChange: true,
            startValue: 100,
            range: {
                min: 0,
                max: 100
            }
        },
        onchange: function(value) {
        	this.options.brightness = (value/100);
        }
    },
	lightness: {
        label: {
            left: {
                id: "",
                text: "Lightness"
            },
            right: {
                id: "config-lightness-input-percent",
                text: "50%"
            }
        },
        input: {
            type: "range",
            updateOnChange: true,
            startValue: 50,
            range: {
                min: 0,
                max: 100
            }
        },
        onchange: function(value) {
        	this.options.brightness = (value/100);
        }
    },
    saturation: {
        label: {
            left: {
                id: "",
                text: "Saturation"
            },
            right: {
                id: "config-saturation-input-percent",
                text: "100%"
            }
        },
        input: {
            type: "range",
            updateOnChange: true,
            startValue: 100,
            range: {
                min: 0,
                max: 100
            }
        },
        onchange: function(value) {
        	this.options.saturation = (value/100);
        }
    }
}

var patterns = {
	'rainbow-fade': {
		id: 'rainbow-fade',
		options: {
			saturation: 1.0,
			brightness: 0.5,
			startInterval: 500,
			interval: 500 //Every half second
		},
		function: function() {
			this.patternHue += 0.05;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col = this.hslToRgb(this.patternHue, this.options.saturation, this.options.brightness);
			this.writeColor([
				[col[0], col[1], col[2]],
				[col[0], col[1], col[2]]
			]);
		},
		config: {
			"config-speed": __configs.speed,
			"config-lightness": __configs.lightness,
            "config-saturation": __configs.saturation
        }
	},
	'rainbow-alternate': {
		id: 'rainbow-alternate',
		options: {
			saturation: 1.0,
			brightness: 0.5,
			startInterval: 500,
			interval: 500 //Every 1/5 second
		},
		function: function() {
			this.patternHue += 0.05;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col = this.hslToRgb(this.patternHue, this.options.saturation, this.options.brightness);
			this.writeColor([
				[col[0], col[1], col[2]],
				[255-col[0], 255-col[1], 255-col[2]]
			]);
		},
		config: {
			"config-speed": __configs.speed,
			"config-lightness": __configs.lightness,
            "config-saturation": __configs.saturation
        }
	},
	'rainbow-jump': {
		id: 'rainbow-jump',
		options: {
			saturation: 1.0,
			brightness: 0.5,
			startInterval: 500,
			interval: 800 //Every 4/5 second
		},
		function: function() {
			this.patternHue += 0.2;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col = this.hslToRgb(this.patternHue, this.options.saturation, this.options.brightness);
			this.writeColor([
				[col[0], col[1], col[2]],
				[col[0], col[1], col[2]]
			]);
		},
		config: {
			"config-speed": __configs.speed,
			"config-lightness": __configs.lightness,
            "config-saturation": __configs.saturation
        }
	},
	'switch': {
		id: 'switch',
		options: {
			startInterval: 250,
			interval: 250, //Every 1/4 second
			fade: false
		},
		function: function() {
			var curColors = this.getColors();
			if (typeof curColors === "undefined") {
				curColors = [
					[255, 255, 255],
					[0, 0, 0]
				];
			}
			var count = curColors.length;
			var max = count - 1;
			var switched = true;
			if (this.patternHue >= max || this.patternHue < 0 || this.patternHue % 1 != 0) {
				this.patternHue = 0.0;
			} else {
				this.patternHue += 1.0;
			}
			var colors = [];
			for (var strip=0; strip<count; strip++) {
				var newStrip = (strip + this.patternHue) % count;
				colors.push([curColors[newStrip][0], curColors[newStrip][1], curColors[newStrip][2]]);
			}
			this.writeColor(colors);
			if (!this.options.fade) {
				this.writeColor(colors);
			}
		},
		config: {
			"config-speed": __configs.speed_fast,
            "config-fade-tween": __configs.fade
		}
	},
	'random': {
		id: 'random',
		options: {
			startInterval: 500,
			interval: 500, //Every half second
			brightness: 1.0,
			fade: true
		},
		function: function() {
			var strips = [];
			var stripCount = 2;
			function randColor(brightness) {
				function color() {
					return Math.floor(Math.random() * 255 * brightness);
				}
				return [
					color(),
					color(),
					color()
				];
			}
			for (var s=0; s<stripCount; s++) {
				var strip = [];
				for (var x=0; x<30; x++) {
					strip.push(randColor(this.options.brightness));
				}
				strips.push(strip);
			}
			this.writeLEDs(strips);
			if (!this.options.fade) {
				this.writeLEDs(strips);
			}
		},
		config: {
			"config-speed": __configs.speed,
			"config-brightness": __configs.brightness,
            "config-fade-tween": {
		        label: {
		            left: {
		                id: "",
		                text: "Fade"
		            }
		        },
		        input: {
		            type: "checkbox",
		            updateOnChange: false,
		            startValue: true
		        },
		        onchange: function(value) {
		        	this.options.fade = value;
		        }
		    }
		}
    },
	'waves': {
		id: 'waves',
		options: {
			startInterval: 500,
			interval: 500, //Every second
			brightness: 1.0,
			fade: true
		},
		function: function() {
			var strip = []; //one strip of 60 leds
			var leds = 128;
			for (var i=0; i<leds; i++) {
				strip[i] = [0,0,0];
			}
			var redPos 	= this.options.redPos  || 0;
			var greenPos= this.options.greenPos|| 0;
			var bluePos = this.options.bluePos || 0;

			var offset = 0;

			for (var red=0; red<(leds); red++) {
				offset = red - redPos;
				strip[red][0] = 255 * Math.sin(offset / (leds/2) * Math.PI) * this.options.brightness;
			}
			for (var green=0; green<(leds); green++) {
				offset = green - greenPos;
				strip[green][1] = 255 * Math.sin(offset / (leds/2) * Math.PI) * this.options.brightness;
			}
			for (var blue=0; blue<(leds); blue++) {
				offset = blue - bluePos;
				strip[blue][2] = 255 * Math.sin(offset / (leds/2) * Math.PI) * this.options.brightness;
			}
			this.writeLEDs(strip, true);
			if (!this.options.fade) {
				this.writeLEDs(strip, true);
			}

			if (redPos === 0) {
				this.options.redPos = 0;
			}
			if (greenPos === 0) {
				this.options.greenPos = 0;
			}
			if (bluePos === 0) {
				this.options.bluePos = 0;
			}

			redPos += 10;
			greenPos += 5;
			bluePos += 1;
			if (redPos > leds) {
				redPos -= leds;
			}
			if (greenPos > leds) {
				greenPos -= leds;
			}
			if (bluePos > leds) {
				bluePos -= leds;
			}

			this.options.redPos = redPos;
			this.options.greenPos = greenPos;
			this.options.bluePos = bluePos;
		},
		config: {
			"config-speed": __configs.speed,
			"config-brightness": __configs.brightness,
            "config-fade-tween": {
		        label: {
		            left: {
		                id: "",
		                text: "Fade"
		            }
		        },
		        input: {
		            type: "checkbox",
		            updateOnChange: false,
		            startValue: true
		        },
		        onchange: function(value) {
		        	this.options.fade = value;
		        }
		    }
		}
    },
	'music-hue': {
		id: 'music-hue',
		interval: 0, 
		function: function() {
			console.log("This is a test");
			return setInterval(pattern.function, 0.5);
		}
	}
};

if (typeof module !== "undefined") {
	module.exports = patterns;
}