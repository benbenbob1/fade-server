// Negative pattern interval starts after that many seconds (*-1)
// 0 for interval has no delay and no repeat - the function MUST return a TIMEOUT!

// Current selected colors are located at this.chosenColors[strip] = [r, g, b]
// this.patternHue = current hue

var patterns = {
	'rainbow-fade': {
		id: 'rainbow-fade',
		interval: 500, //Every half second
		function: function() {
			this.patternHue += 0.05;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col = this.hslToRgb(this.patternHue, 1.0, 0.5);
			this.writeColor(col[0], col[1], col[2], [0, 1]);
		}
	},
	'rainbow-fade2': {
		id: 'rainbow-fade2',
		interval: 200, //Every 1/5 second
		function: function() {
			this.patternHue += 0.1;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col = this.hslToRgb(this.patternHue, 1.0, 0.5);
			this.writeColor(col[0], col[1], col[2], [0, 1]);
		}
	},
	'rainbow-fade3': {
		id: 'rainbow-fade3',
		interval: 200, //Every 1/5 second
		function: function() {
			this.patternHue += 0.1;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col1 = this.hslToRgb(this.patternHue, 1.0, 0.5);
			var col2 = this.hslToRgb(1.0 - this.patternHue, 1.0, 0.5);
			this.writeColor(col1[0], col1[1], col1[2], 0);
			this.writeColor(col2[0], col2[1], col2[2], 1);
		}
	},
	'rainbow-jump': {
		id: 'rainbow-jump',
		interval: 800, //Every 4/5 second
		function: function() {
			this.patternHue += 0.2;
			if (this.patternHue >= 1.0) {
				this.patternHue = 0.0;
			}
			var col = this.hslToRgb(this.patternHue, 1.0, 0.5);
			this.writeColor(col[0], col[1], col[2], [0, 1]);
			this.writeColor(col[0], col[1], col[2], [0, 1]);
		}
	},
	'switch': {
		id: 'switch',
		interval: 500, //Every half second
		function: function() {
			var count = this.chosenColors.length;
			var max = count - 1;
			var switched = true;
			if (this.patternHue >= max || this.patternHue < 0 || this.patternHue % 1 != 0) {
				this.patternHue = 0.0;
			} else {
				this.patternHue += 1.0;
			}
			for (var strip=0; strip<count; strip++) {
				var newStrip = (strip + this.patternHue) % count;
				this.writeColor(
					this.chosenColors[newStrip][0],
					this.chosenColors[newStrip][1],
					this.chosenColors[newStrip][2],
					strip
				);
			}
		},
		config: {
			"config-speed": {
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
                        min: 50,
                        max: 200
                    }
                },
                onchange: function(value) {
                	//console.log("INTERVAL CHANGED TO "+value);
                	//console.log(this.pattern);
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