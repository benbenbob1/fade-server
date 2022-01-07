var __configs = {
    speed: {
        label: {
            left: {
                id: "",
                text: "Speed"
            },
            right: {
                id: "config-speed-input-percent",
                text: ""
            }
        },
        input: {
            type: "range",
            valueType: "custom",
            displayValueForRangeUpdate: (newVal) => {
                let qtr = 20/4.0;
                if (newVal <= qtr) {
                    return "Slow";
                } else if (newVal <= qtr * 3) {
                    return "Average";
                } else {
                    return "Fast";
                }
            },
            range: {
                min: 0,
                max: 20
            },
            valueRange: {
                min: 2500,
                max: 200
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
            type: "checkbox"
        }
    },
    randomize: {
        label: {
            left: {
                id: "",
                text: "Randomize"
            }
        },
        input: {
            type: "checkbox"
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
            __interval: {
                defaultValue: 1000,
                config: __configs.speed
            },
            fade: {
                displayValue: true,
                defaultValue: true,
                config: __configs.fade
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
        requiresMultipleColors: false,
        display: {
            title: "Rainbow fade",
            backgroundDivCSS: {
                "background": {
                    backgroundColor: "rgb(255,0,0)",
                    animation: "fade-anim 10s linear infinite"
                }
            }
        },
        start: function() {
            this.variables.hue = 0.0;
        },
        function: function() {
            this.variables.hue += 0.05;
            if (this.variables.hue >= 1.0) {
                this.variables.hue = 0.0;
            }

            this.writeColorHSV(
                [
                    this.variables.hue, 
                    this.options.saturation,
                    this.options.brightness,
                ],
                this.stripIdx
            );

            if (!this.options.fade) {
                this.writeColorHSV(
                    [
                        this.variables.hue, 
                        this.options.saturation,
                        this.options.brightness,
                    ],
                    this.stripIdx
                );
            }
        }
    },
    'random': {
        options: {
            __interval: {
                defaultValue: 1000,
                config: __configs.speed
            },
            fade: {
                displayValue: true,
                defaultValue: true,
                config: __configs.fade
            },
            brightness: {
                displayValue: 100,
                defaultValue: 1.0,
                config: __configs.brightness
            }
        },
        requiresMultipleColors: true,
        display: {
            title: "Random",
            backgroundDivCSS: {
                "repeat": {
                    background: "url(data:image/png;base64,"+
                    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAATklEQVQ"+
                    "YV2O0O3X+PwMDA8MhM0NGEI0LMBKtEJsJD27YgW1R0DgEtwWrdUQrxG"+
                    "YLY8V5iDUdhghrKFOITfenmXFgW/jSF+H3DNEKsdkCAO99IAvSBrFVA"+
                    "AAAAElFTkSuQmCC) repeat",
                    backgroundPosition: "1px 0px"
                }
            }
        },
        function: function() {
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
            
            var strip = [];
            for (var x=0; x<this.numLeds; x++) {
                strip.push(randColor(this.options.brightness));
            }
            
            this.writeStripLeds(strip, this.stripIdx);
            if (!this.options.fade) {
                this.writeStripLeds(strip, this.stripIdx);
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
            randomize: {
                displayValue: true,
                defaultValue: true,
                config: __configs.randomize
            },
            brightness: {
                displayValue: 100,
                defaultValue: 1,
                config: __configs.brightness
            }
        },
        requiresMultipleColors: true,
        display: {
            title: "Waves",
            backgroundDivCSS: {
                "circle-red": {
                    backgroundColor: "red",
                    top: "0",
                    animation: "wave-anim 4s linear infinite",
                    width: "10px",
                    height: "32px",
                    opacity: "0.6",
                    webkitFilter: "blur(2px) saturate(180%)",
                    position: "absolute"
                },
                "circle-green": {
                    backgroundColor: "lightgreen",
                    top: "0",
                    animation: "wave-anim 3s linear infinite",
                    width: "10px",
                    height: "32px",
                    opacity: "0.6",
                    webkitFilter: "blur(2px) saturate(180%)",
                    position: "absolute"
                },
                "circle-blue": {
                    backgroundColor: "blue",
                    top: "0",
                    animation: "wave-anim 5s linear infinite",
                    width: "10px",
                    height: "32px",
                    opacity: "0.6",
                    webkitFilter: "blur(2px) saturate(180%)",
                    position: "absolute"
                }
            }
        },
        function: function() {
            var strip = []; //one strip of this.numLeds leds
            var leds = this.numLeds;
            for (var i=0; i<leds; i++) {
                strip[i] = [0, 0, 0];
            }
            var redPos   = this.variables.redPos   || 0;
            var greenPos = this.variables.greenPos || 0;
            var bluePos  = this.variables.bluePos  || 0;

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

            this.writeStripLeds(strip, this.stripIdx);
            if (!this.options.fade) {
                this.writeStripLeds(strip, this.stripIdx);
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

            if (this.options.randomize) {
                redPos += Math.random()*11;
                greenPos += Math.random()*6;
                bluePos += Math.random()*2;
            } else {
                redPos  += 10;
                greenPos+= 5;
                bluePos += 1;
            }
            
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
        requiresMultipleColors: true,
        display: {
            title: "Rainbow fade",
            backgroundDivCSS: {
                "background": {
                    background: "linear-gradient(to right, "+
                    "red 0%,"+
                    "yellow 25%,"+
                    "green 50%,"+
                    "blue 75%,"+
                    "red 100%)",
                    animation: "rainbow-fade-anim 3s linear infinite"
                }
            }
        },
        start: function() {
            this.variables.hue = 0.0;
        },
        function: function() {
            this.variables.hue += 0.1;
            if (this.variables.hue > 1.0) {
                this.variables.hue -= 1.0;
            }

            var strip = Array(this.numLeds);
            for (var led=0; led<this.numLeds; led++) {
                var hue = this.variables.hue+((led/30));
                if (hue > 1.0) {
                    hue -= 1.0;
                }
                var col = this.hslToRgb(
                    hue, this.options.saturation, 
                    this.options.brightness
                );
                strip[led] = col;
            }
            
            this.writeStripLeds(strip, this.stripIdx);
            if (!this.options.fade) {
                this.writeStripLeds(strip, this.stripIdx);
            }
        }
    }
};

if(typeof exports == 'undefined'){
    var exports = this['mymodule'] = {};
}

if (typeof module !== "undefined") {
    module.exports = patterns;
}