class Helpers {
    static rgbStringFromColorArray(colorArr=[0,0,0], alpha=1.0) {
        if (colorArr.length < 3) { return "rgba(0,0,0,0)"; }
        var alphaOut = (colorArr.length > 3 ? colorArr[3] : alpha);

        return "rgba(" +
            colorArr[0]+","+
            colorArr[1]+","+
            colorArr[2]+","+
            alphaOut+
        ")";
    }

    static getTextColorForBackground(r, g, b) {
        var yiq = ((r*299)+(g*587)+(b*114))/1000;
        //Using a weight system for each color, determine the darkness
        var bOrW = (yiq >= 128) ? 0 : 1;
        return bOrW ? 'rgb(255,255,255)' : 'rgb(0,0,0)';
    }


    /**
     * https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
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
    static hslToRgb(h, s, l){
        var r, g, b;

        if(s == 0){
            r = g = b = l; // achromatic
        } else {
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
    static rgbToHsl(r, g, b){
        r /= 255, g /= 255, b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;

        if(max == min){
            h = s = 0; // achromatic
        }else{
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

    static rgbToHex(r, g, b) {
        var componentToHex = (c) => c.toString().length == 1 ? '0' + c.toString(16) : c.toString(16);
        return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    static setElemStyleToMatchStyleDict(displayDict, elemToSet, backgroundOnly=true) {
        if ("backgroundDivCSS" in displayDict) {
            var innerElems = displayDict.backgroundDivCSS;

            if (backgroundOnly) {
                if (!elemToSet.prevBg) {
                    elemToSet.prevBg = elemToSet.style.cssText; // save a backup of the style, to revert easily
                    console.log("saved as ", elemToSet.prevBg);
                }

                var allCssElemIds = Object.keys(innerElems);

                if (allCssElemIds.length == 1) {
                    // For now, we can only handle single elements
                    var bgElem = innerElems[allCssElemIds[0]];

                    var canSet = ["background", "backgroundColor", "animation"];
                    for (var cssItem in bgElem) {
                        if (canSet.includes(cssItem)) {
                            console.log("Setting "+ cssItem);
                            elemToSet.style[cssItem] = bgElem[cssItem];
                        }
                    }
                }
            } else {
                var innerElemContainer = document.createElement("div");
                innerElemContainer.style.height = "100%";
                innerElemContainer.style.width = "100%";
                innerElemContainer.style.borderRadius = "2px";
                innerElemContainer.style.overflow = "hidden";
                innerElemContainer.id = elemToSet.id + "-inner-elem-container";

                for (var div in innerElems) {
                    var innerElem = document.createElement("div");
                    innerElem.id = elemToSet.id + "-inner-" + div;
                    innerElem.style.height = "100%";
                    innerElem.style.width = "100%";
                    for (var cssItem in innerElems[div]) {
                        innerElem.style[cssItem] = innerElems[div][cssItem];
                    }

                    innerElemContainer.appendChild(innerElem);
                }

                elemToSet.appendChild(innerElemContainer);
            }
        }

        let playIconId = elemToSet.id + "-play-indicator";
        if (!document.getElementById(playIconId)) {
            var playIcon = document.createElement("div");
            playIcon.id = playIconId;
            playIcon.className = "play-indicator";
            elemToSet.appendChild(playIcon);
        }
    }

    static removeElemStyleDict(elem) {
        if (elem.prevBg) {
            elem.style.cssText = elem.prevBg;
        }
        else {
            var elemInnerContainer = document.getElementById(elem.id + "-inner-elem-container");
            if (elemInnerContainer) {
                elemInnerContainer.remove();
            }
        }

        let playIconId = elem.id + "-play-indicator";
        let playIcon = document.getElementById(playIconId);
        if (playIcon) {
            playIcon.remove();
        }
    }
}

if(typeof exports == 'undefined'){
    var exports = this['mymodule'] = {};
}

if (typeof module !== "undefined") {
    module.exports = Helpers;
}