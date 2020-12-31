class ColorPicker {
    constructor(canvasId, previewElemId=null, modalElemId=null, 
        onColorPicked=null, onPatternSelected=null, startHSV=[0.,0.,0.]) {
        this.canvas = document.getElementById(canvasId);
        this.modal = document.getElementById(modalElemId);
        this.hue = startHSV[0] || 0.;        // 0 - 1
        this.saturation = 1.0;     // 0 - 1
        this.brightness = startHSV[2] || 0.; // 0 - 1
        this.createColorOverlay();
        this.previewElem = document.getElementById(previewElemId) || null;
        this.curStrip = -1;

        this.hueCircleDrawn = false;

        //Callback function, ([R,G,B], stripId)
        this.onColorPicked = onColorPicked;
        this.onPatternSelected = onPatternSelected;

        this.updatePreview(startHSV);

        var me = this; // me = current object
        window.onresize = function(e) {
            me.resizeModal();
        }

        this.resizeModal();

        this.modal.classList.add("modal-open");
    }

    resizeModal() {
        var smallClass = "modal-container-short"
        if (this.modal) {
            if (window.innerHeight < this.modal.offsetHeight) {
                //Window too short for modal
                this.modal.classList.add(smallClass);
            } else {
                this.modal.classList.remove(smallClass);
            }
        }
    }

    //Returns [r, g, b]
    getCurRGB() {
        return Helpers.hslToRgb(
            this.hue,
            this.saturation,
            this.brightness
        );
    }

    //Returns [h, s, v]
    getCurHSV() {
        return [this.hue, this.saturation, this.brightness];
    }

    updateToHSV(newHSV) {
        console.log("Calling remote update "+newHSV);
        this.hue = newHSV[0];
        this.saturation = 1.0; // max out saturation so we always show colors
        this.brightness = newHSV[2];

        this.createColorOverlay();
        this.updatePreview(newHSV);
    }

    createHuePicker(context, centerX, centerY, radius) {
        var PI2 = Math.PI * 2.;
        
        context.lineWidth = 4;
        context.strokeStyle = "gray";
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, PI2, false);
        context.stroke();
        context.closePath();

        context.lineWidth = 1;

        var radIncr = Math.PI / 40.;
        var toRad = PI2; //second to last
        for (var rad=0.0; rad<toRad; rad += radIncr) {
            var hue = ( rad / PI2 ) * 1.0;
            var rgb = Helpers.hslToRgb(hue, 1.0, 0.5);

            context.fillStyle = Helpers.rgbStringFromColorArray(rgb);
            context.strokeStyle = context.fillStyle;

            context.beginPath();
            context.moveTo(centerX, centerY);
            var endX = (radius * Math.cos(rad)) + centerX;
            var endY = (radius * Math.sin(rad)) + centerY;
            context.lineTo(endX, endY);

            endX = (radius * Math.cos(rad+radIncr)) + centerX;
            endY = (radius * Math.sin(rad+radIncr)) + centerY;
            context.lineTo(endX, endY);
            context.lineTo(centerX, centerY);
            context.fill();
            context.stroke();

            context.closePath();
        }

        this.hueCircleDrawn = true;
    }

    createColorOverlay() {
        var ctx = this.canvas.getContext('2d');

        var width = this.canvas.offsetWidth, height = this.canvas.offsetHeight;

        var pageMargin = 50; //px

        var pickerCenter = width / 2.;
        var brightnessBarWidth = (width - (pageMargin * 2.)) * .15;

        var circleRadius = Math.min(
            (width - (pageMargin * 2.) - brightnessBarWidth) / 2.,
            (height - (pageMargin * 2.)) / 2.
        );
        var circleCenterX = pageMargin + circleRadius; //relative to canvas(0,0)
        var circleCenterY = height / 2.;

        var clearMinX = circleCenterX + circleRadius + 2;

        ctx.clearRect(
            clearMinX, 0,
            width - clearMinX, height
        );

        if (!this.hueCircleDrawn) {
            this.createHuePicker(
                ctx, circleCenterX, circleCenterY, circleRadius
            );
        }

        ctx.lineWidth = 1;

        var brightnessBarHeight = height - (pageMargin * 2.);
        var brightnessBarXMin = width - pageMargin - brightnessBarWidth;

        var rgbFullSat = Helpers.hslToRgb(this.hue, 1.0, 0.5);
        var gradient = ctx.createLinearGradient(
            0, pageMargin,
            0, pageMargin + brightnessBarHeight
        );
        gradient.addColorStop(0.1, "white");
        gradient.addColorStop(0.5, Helpers.rgbStringFromColorArray(rgbFullSat));
        gradient.addColorStop(0.9, "black");
        ctx.beginPath();
        ctx.rect(
            brightnessBarXMin, pageMargin,
            brightnessBarWidth, brightnessBarHeight
        );
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = "black";
        ctx.stroke();
        ctx.closePath();

        ctx.beginPath();
        ctx.rect(
            brightnessBarXMin - 4, 
            (pageMargin - 5) + ((1-this.brightness) * brightnessBarHeight),
            brightnessBarWidth + 8, 10
        ) // box indicating current brightness

        ctx.lineWidth = 2;
        ctx.strokeStyle = Helpers.rgbStringFromColorArray([100, 100, 100]);
        ctx.stroke();
        ctx.closePath();

        var me = this; // me = current object

        var didTouchCanvas = function(touchX, touchY) {
            if (touchX >= pageMargin &&
                touchX <= pageMargin + (circleRadius * 2.) &&
                touchY >= pageMargin &&
                touchY <= pageMargin + (circleRadius * 2.)
                ) {

                me.colorWheelClick(
                    touchX, touchY,
                    circleCenterX, circleCenterY, circleRadius
                );
            } else if (
                touchX >= width - pageMargin - brightnessBarWidth &&
                touchX <= width - pageMargin &&
                touchY >= pageMargin &&
                touchY <= height - pageMargin
                ) {
                me.brightnessBarClick(
                    touchX, touchY, 
                    pageMargin, pageMargin + brightnessBarHeight
                );
            }
        }

        var mouseEvent = function(e) {
            var clickX = e.offsetX;
            var clickY = e.offsetY;

            if (e.buttons == 1) {
                didTouchCanvas(clickX, clickY);
            }
        }

        var touchEvent = function(e) {
            if (e.touches.length <= 0) { return; }
            var firstTouch = e.touches[0];

            var canvasOffsetY = 
                me.canvas.parentElement.parentElement.parentElement.offsetTop -
                me.canvas.parentElement.parentElement.offsetHeight / 2.;
            var canvasOffsetX = 
                me.canvas.parentElement.parentElement.parentElement.offsetLeft -
                me.canvas.parentElement.parentElement.offsetWidth / 2.;

            var canvasY = firstTouch.pageY - canvasOffsetY;
            var canvasX = firstTouch.pageX - canvasOffsetX;

            didTouchCanvas(canvasX, canvasY);
        }

        var mobileTouch = function(e) {
            e.preventDefault();
            touchEvent(e);
        }

        this.canvas.ontouchstart = mobileTouch;
        this.canvas.ontouchmove = mobileTouch;
        this.canvas.ontouchend = mobileTouch;

        this.canvas.onmousemove = mouseEvent;
        this.canvas.onmousedown = mouseEvent;
    }

    colorWheelClick(clickX, clickY,  colorWheelCenterX, colorWheelCenterY, colorWheelRadius) {

        var wheelOffsetX = clickX - colorWheelCenterX;
        var wheelOffsetY = clickY - colorWheelCenterY;

        var distanceClickFromCenter = Math.sqrt(
            Math.pow(wheelOffsetX, 2.0) +
            Math.pow(wheelOffsetY, 2.0)
        );

        if (distanceClickFromCenter > colorWheelRadius) {
            //Click was outside of color wheel
            return
        }

        var angle = Math.atan2(wheelOffsetY, wheelOffsetX);
        var hue = angle / (Math.PI * 2.);

        this.setHue(hue);
        this.createColorOverlay();
    }

    brightnessBarClick(clickX, clickY, brightnessBarMinY, brightnessBarMaxY) {
        var brightness = (clickY-brightnessBarMinY) 
            / (brightnessBarMaxY-brightnessBarMinY);
        this.setBrightness(1 - brightness);
        this.createColorOverlay();
    }

    setHue(hue) {
        this.hue = hue;
        this.onParamSet();
    }

    setBrightness(brightness) {
        var brightnessDeadZone = 0.05;
        if (brightness > (1.0 - brightnessDeadZone)) { brightness = 1.0; }
        else if (brightness < brightnessDeadZone) { brightness = 0.0; }
        this.brightness = brightness;
        this.onParamSet();
    }

    onParamSet() {
        var hsv = this.getCurHSV();
        if (this.onColorPicked) {
            this.onColorPicked(hsv, this.curStrip >= 0 ? this.curStrip : -1);
        }
    }

    updatePreview(hsv) {
        if (this.previewElem) {
            this.previewElem.style.borderColor = Helpers.rgbStringFromColorArray(
                [128, 128, 128, this.brightness]
            );
            var rgb = Helpers.hslToRgb(hsv[0], hsv[1], hsv[2]);
            this.previewElem.style.backgroundColor = 
                Helpers.rgbStringFromColorArray(rgb);
            this.previewElem.style.color = 
                Helpers.getTextColorForBackground(rgb[0], rgb[1], rgb[2]);
        }
    }

    setPreviewName(newName) {
        if (this.previewElem) {
            this.previewElem.innerText = newName;
        }
    }

    /*
    dictionaryOfPatternDicts:
    {
        "pattern1": {
            requiresMultipleColors: true,
            display: {
                title: "The best pattern",
                backgroundDivCSS: {
                    "background": {
                        backgroundColor: "red"
                    },
                    "foreground": {
                        content: "x",
                        color: "white"
                    }
                }
            }
        }
    }
    */

    addPatternButton(patternName, dict, containerElem) {
        if (!containerElem) { return; }
        var displayDict = dict.display || {};
        var patternButton = document.createElement("div");
        patternButton.id = "pattern-"+patternName;
        patternButton.classList.add("preset-button");
        if ("title" in displayDict) {
            patternButton.title = displayDict.title;
        }
        
        Helpers.setElemStyleToMatchStyleDict(displayDict, patternButton, false);

        // Set inner border radius to match outer style
        Array.from(patternButton.children).forEach((innerElem, idx) => {
            innerElem.style.borderRadius = "2px";
        });

        var selectedClass = "button-selected";
        var me = this;
        patternButton.onclick = function(e) {
            me.chosePreset(patternName); 
        };
        containerElem.appendChild(patternButton);
    }

    setAvailablePatterns(dictionaryOfPatternDicts) {
        var patternContainer = document.getElementById(
            "preset-container"
        );

        if (!patternContainer) { return; }

        while (patternContainer.firstChild) {
            patternContainer.removeChild(patternContainer.firstChild);
        }

        var me = this;
        for (var pattern in dictionaryOfPatternDicts) {
            me.addPatternButton(
                pattern, dictionaryOfPatternDicts[pattern], patternContainer
            );
        }

        this.resizeModal();
    }

    deselectPreset() {
        this.removeConfig();
        $('.button-selected').blur();
        return $('.button-selected').removeClass('button-selected').attr('id');
    }

    // Called by external preset updating (from server)
    choosePreset(id, options={}) {
        if (debug) {
            console.log("[DEBUG] selecting preset: "+id);
        }

        $('#pattern-'+id).addClass('button-selected');
        var config = options || patterns[id].config;
        if (config) {
            this.setupConfig(config);
        }
    }

    chosePreset(id) {
        var last = this.deselectPreset();
        if (id !== last) {
            if (this.onPatternSelected) {
                this.onPatternSelected(id, selectedStripIdx);
            }
        } else {
            removeConfig();
            if (this.onPatternSelected) {
                this.onPatternSelected('stop', selectedStripIdx);
            }
        }
    }

    /*

    Pattern config Space

    */

    rangeAdjusted(item, toUpdate) {
        if (toUpdate && toUpdate.length>0) {
            var elem = document.getElementById(toUpdate);
            elem.innerText = item.value + '%';
        }
    }

    rangeSet(element) {
        post({
            config: element.id,
            value: parseInt(element.value)
        });
    }

    checkboxSet(element) {
        post({
            config: element.id,
            value: element.checked
        });
    }

    removeConfig() {
        var container = document.getElementById("config-space");
        if (!$(container).is(":visible")) {
            return;
        }
        $(container).empty();
    }

    setupConfig(options) {
        var container = document.getElementById("config-space");
        if (!options) {
            removeConfig();
            return;
        } else if ($(container).is(":visible")) {
            $(container).empty();
        }
        var docFrag = document.createDocumentFragment();
        var option, config;
        for (var index in options) {
            option = options[index];
            config = option.config;
            var rowElem = document.createElement("div");
            rowElem.className = "config-item-row";
            var lLabel = document.createElement("span");
            var rLabel = document.createElement("span");
            lLabel.className = "config-item item-left";
            rLabel.className = "config-item item-right";
            var elem = document.createElement("input");
            elem.type = config.input.type;
            if (config.label.left) {
                lLabel.id = config.label.left.id;
                lLabel.innerText = config.label.left.text;
            }
            if (config.label.right) {
                rLabel.id = config.label.right.id;
                if (config.input.valueType && 
                    config.input.valueType === "percent" && 
                    option.displayValue != null) {
                    rLabel.innerText = option.displayValue + "%";
                } else {
                    rLabel.innerText = config.label.right.text;
                }
            }

            elem.id = index;
            elem.toChange = (config.label.right && config.label.right.id) || null;
            
            if (config.input.type == "range") {
                if (elem.toChange) {
                    elem.addEventListener("input", function(event) {
                        rangeAdjusted(event.target, event.target.toChange);
                    });
                }

                elem.addEventListener("change", function(event) {
                    rangeSet(event.target);
                });

                if (config.input.range != null) {
                    elem.setAttribute("min", config.input.range.min);
                    elem.setAttribute("max", config.input.range.max);
                }

                if (option.displayValue != null) {
                    $(elem).val(option.displayValue);
                }

            } else if (config.input.type == "checkbox") {
                elem.addEventListener("change", function(event) {
                    checkboxSet(event.target);
                });
                if (option.displayValue != null) {
                    elem.checked = option.displayValue;
                }
            }
            
            rowElem.appendChild(lLabel);
            rowElem.appendChild(rLabel);
            rowElem.appendChild(elem);
            docFrag.appendChild(rowElem);
        }
        container.appendChild(docFrag);
    }
}

if (typeof module !== "undefined") {
    module.exports = ColorPicker;
}

if(typeof exports == 'undefined'){
    var exports = this['mymodule'] = {};
}