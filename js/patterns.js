var __configs = {
	interval_10_500: {
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
	        update: function(value) {
		    	this.options.interval.value = Math.floor(1/(value/100) * this.options.interval.defaultValue);
		    },
		    valueType: "percent",
	        range: {
	            min: 10,
	            max: 500
	        }
	    }
	},
	interval_10_1000: {
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
	        update: function(value) {
		    	this.options.interval.value = Math.floor(1/(value/100) * this.options.interval.defaultValue);
		    },
		    valueType: "percent",
	        range: {
	            min: 10,
	            max: 1000
	        }
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
            update: function(value) {
	        	this.options.fade.value = value;
	        }
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
            update: function(value) {
	        	this.options.brightness.value = (value/100);
	        },
	        valueType: "percent",
            range: {
                min: 0,
                max: 100
            }
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
            update: function(value) {
	        	this.options.brightness.value = (value/100);
	        },
	        valueType: "percent",
            range: {
                min: 0,
                max: 100
            }
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
            valueType: "percent",
            update: function(value) {
	        	this.options.saturation.value = (value/100);
	        },
            range: {
                min: 0,
                max: 100
            }
        }
	}
};

var patterns = {
	'rainbow-fade': {
		options: {
			fade: {
				displayValue: true,
				defaultValue: true,
				config: __configs.fade
			},
			interval: {
				displayValue: 100,
				defaultValue: 500,
				config: __configs.interval_10_500
			},
			brightness: {
				displayValue: 50,
				defaultValue: 0.5,
				config: __configs.lightness
			},
			saturation: {
				displayValue: 100,
				defaultValue: 1.0,
				config: __configs.saturation
			}
		},
		function: function() {
			this.patternHue += 0.05;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col = this.hslToRgb(this.patternHue, this.options.saturation.value, this.options.brightness.value);
			this.writeColor([
				[col[0], col[1], col[2]],
				[col[0], col[1], col[2]]
			]);
			//console.log(this.options.saturation.value);
			if (!this.options.fade.value) {
				this.writeColor([
					[col[0], col[1], col[2]],
					[col[0], col[1], col[2]]
				]);
			}
		}
	},
	'rainbow-alternate': {
		options: {
			fade: {
				displayValue: true,
				defaultValue: true,
				config: __configs.fade
			},
			interval: {
				displayValue: 100,
				defaultValue: 500,
				config: __configs.interval_10_500
			},
			brightness: {
				displayValue: 50,
				defaultValue: 0.5,
				config: __configs.lightness
			},
			saturation: {
				displayValue: 100,
				defaultValue: 1.0,
				config: __configs.saturation
			}
		},
		function: function() {
			this.patternHue += 0.05;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col = this.hslToRgb(this.patternHue, this.options.saturation.value, this.options.brightness.value);
			this.writeColor([
				[col[0], col[1], col[2]],
				[255-col[0], 255-col[1], 255-col[2]]
			]);
			if (!this.options.fade.value) {
				this.writeColor([
					[col[0], col[1], col[2]],
					[255-col[0], 255-col[1], 255-col[2]]
				]);
			}
		},
	},
	'switch': {
		options: {
			fade: {
				displayValue: false,
				defaultValue: false,
				config: __configs.fade
			},
			interval: {
				displayValue: 100,
				defaultValue: 250,
				config: __configs.interval_10_500
			}
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
			if (!this.options.fade.value) {
				this.writeColor(colors);
			}
		}
	},
	'random': {
		options: {
			fade: {
				displayValue: true,
				defaultValue: true,
				config: __configs.fade
			},
			interval: {
				displayValue: 100,
				defaultValue: 500,
				config: __configs.interval_10_500
			},
			brightness: {
				displayValue: 100,
				defaultValue: 1.0,
				config: __configs.brightness
			}
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
					strip.push(randColor(this.options.brightness.value));
				}
				strips.push(strip);
			}
			this.writeLEDs(strips);
			if (!this.options.fade.value) {
				this.writeLEDs(strips);
			}
		}
	},
	'waves': {
		options: {
			fade: {
				displayValue: true,
				defaultValue: true,
				config: __configs.fade
			},
			interval: {
				displayValue: 100,
				defaultValue: 500,
				config: __configs.interval_10_500
			},
			brightness: {
				displayValue: 100,
				defaultValue: 1,
				config: __configs.brightness
			}
		},
		function: function() {
			var strip = []; //one strip of 60 leds
			var leds = 128;
			for (var i=0; i<leds; i++) {
				strip[i] = [0,0,0];
			}
			var redPos 	= this.variables.redPos  || 0;
			var greenPos= this.variables.greenPos|| 0;
			var bluePos = this.variables.bluePos || 0;

			var offset = 0;

			for (var red=0; red<(leds); red++) {
				offset = red - redPos;
				strip[red][0] = 255 * Math.sin(offset / (leds/2) * Math.PI) * this.options.brightness.value;
			}
			for (var green=0; green<(leds); green++) {
				offset = green - greenPos;
				strip[green][1] = 255 * Math.sin(offset / (leds/2) * Math.PI) * this.options.brightness.value;
			}
			for (var blue=0; blue<(leds); blue++) {
				offset = blue - bluePos;
				strip[blue][2] = 255 * Math.sin(offset / (leds/2) * Math.PI) * this.options.brightness.value;
			}
			this.writeLEDs(strip, true);
			if (!this.options.fade.value) {
				this.writeLEDs(strip, true);
			}

			if (redPos === 0) {
				this.variables.redPos = 0;
			}
			if (greenPos === 0) {
				this.variables.greenPos = 0;
			}
			if (bluePos === 0) {
				this.variables.bluePos = 0;
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

			this.variables.redPos = redPos;
			this.variables.greenPos = greenPos;
			this.variables.bluePos = bluePos;
		}
	},
	'moving-fade': {
		options: {
			fade: {
				displayValue: true,
				defaultValue: true,
				config: __configs.fade
			},
			interval: {
				displayValue: 100,
				defaultValue: 500,
				config: __configs.interval_10_500
			},
			brightness: {
				displayValue: 50,
				defaultValue: 0.5,
				config: __configs.lightness
			},
			saturation: {
				displayValue: 100,
				defaultValue: 1.0,
				config: __configs.saturation
			}
		},
		function: function() {
			this.patternHue += 0.1;
			if (this.patternHue > 1.0) {
				this.patternHue -= 1.0;
			}

			var strip = [];
			for (var led=0; led<30; led++) {
				var hue = this.patternHue+((led/30));
				if (hue > 1.0) {
					hue -= 1.0;
				}
				var col = this.hslToRgb(hue, this.options.saturation.value, this.options.brightness.value);
				strip.push(col);
			}
			this.writeLEDs([strip, strip]);
			if (!this.options.fade.value) {
				this.writeLEDs([strip, strip]);
			}
		}
	},
	'music-hue': {
		options: {
			interval: {
				defaultValue: 0
			}
		},
		function: function() {
			console.log("This is a test");
			return setInterval(pattern.function, 0.5);
		}
	}
};

if (typeof module !== "undefined") {
	module.exports = patterns;
}