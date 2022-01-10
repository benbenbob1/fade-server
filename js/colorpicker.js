class ColorPicker {
    /*
    onColorPicked([h,s,v], stripId)

    onPatternSelected(patternIdOrStop, stripId)

    onConfigAdjusted(patternId, configName, configValue)
    */
    constructor(canvasId, previewElemId=null, modalElemId=null, 
        onColorPicked=null, onPatternSelected=null, onConfigAdjusted=null, startHSV=[0.,0.,0.]) {
        this.canvas = document.getElementById(canvasId);
        this.modal = document.getElementById(modalElemId);
        this.hue = startHSV[0] || 0.;        // 0 - 1
        this.saturation = 1.0;               // 0 - 1
        this.brightness = startHSV[2] || 0.; // 0 - 1
        this.createColorOverlay();
        this.previewElem = document.getElementById(previewElemId) || null;
        this.curStrip = -1;

        this.hueCircleDrawn = false;

        this.patternDict = null;
        this.lastPattern = null;

        this.onColorPicked = onColorPicked;
        this.onPatternSelected = onPatternSelected;
        this.onConfigAdjusted = onConfigAdjusted;

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
            var hue = ( rad / PI2 );
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
            // Click was outside of color wheel
            return
        }

        var angle = Math.atan2(wheelOffsetY, wheelOffsetX);
        var hue = angle / (Math.PI * 2.);

        // TODO: currently returns -0.5 to 0.5, should return 0 - 1
        this.setHue(hue); // -0.5 - 0.5
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
        this.patternDict = dictionaryOfPatternDicts;
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
            console.log("[DEBUG] ColorPicker | selecting preset: "+id, options);
        }

        this.lastPattern = id;

        $('#pattern-'+id).addClass('button-selected');
        if (options != null && options !== {}) {
            this.setupConfig(options);
        }
    }

    chosePreset(id) {
        let newId = id === this.lastPattern ? 'stop' : id;
        if (newId !== this.lastPattern) {
            this.deselectPreset();
        }

        if (this.onPatternSelected) {
            this.onPatternSelected(newId, selectedStripIdx);
        }

        this.lastPattern = newId;
    }

    /*

    Pattern config space

    */

    displayValueForRangeUpdate(displayElement, newValue, configInputDict) {
        let displayValue = newValue;
        if ("displayValueForRangeUpdate" in configInputDict) {
            displayValue = configInputDict.displayValueForRangeUpdate(newValue);
        } else if (configInputDict.valueType === "percent") {
            displayValue = (Math.round(newValue * 1000) / 10) + '%';
        }

        displayElement.innerText = displayValue;
    }

    configValueForRangeUpdate(configInputDict, rangeVal) {
        if ("valueRange" in configInputDict && "range" in configInputDict) {
            let valueRange = configInputDict.valueRange;
            let range = configInputDict.range;
            let m = ((valueRange.max - valueRange.min) / 
                (range.max - range.min));
            let b = valueRange.min;
            return rangeVal * m + b;
        }

        return rangeVal;
    }

    rangeValueForConfigUpdate(configInputDict, configVal) {
        if ("valueRange" in configInputDict && "range" in configInputDict) {
            // valueRange.min => range.min
            // valueRange.max => range.max
            let valueRange = configInputDict.valueRange;
            let range = configInputDict.range;

            return (((configVal - valueRange.min) / (valueRange.max - valueRange.min)) * (range.max - range.min)) + range.min;
        }

        return configVal;
    }

    rangeAdjusted(item, toUpdate, optionName) {        
        if (toUpdate && toUpdate.length>0) {
            let elem = document.getElementById(toUpdate);
            let configInputDict = this.patternDict[this.lastPattern].options[optionName].config.input;
            let rangeValue = item.value;
            if (configInputDict.valueType === "percent") {
                rangeValue = item.value / 100;
            }

            this.displayValueForRangeUpdate(elem, rangeValue, configInputDict);
        }
    }

    rangeSet(element, optionName) {
        if (this.onConfigAdjusted && this.lastPattern) {
            let rangeVal = Number.parseInt(element.value);
            let configInputDict = this.patternDict[this.lastPattern].options[optionName].config.input;
            this.onConfigAdjusted(this.lastPattern, element.id, this.configValueForRangeUpdate(configInputDict, rangeVal));
        }
    }

    checkboxSet(element) {
        if (this.onConfigAdjusted && this.lastPattern) {
            this.onConfigAdjusted(this.lastPattern, element.id, element.checked === true);
        }
    }

    removeConfig() {
        var container = document.getElementById("config-space");
        if (!$(container).is(":visible")) {
            return;
        }
        $(container).empty();
    }

    setupConfig(options) {
        let colorpicker = this;
        let container = document.getElementById("config-space");
        if (!options || options == null) {
            removeConfig();
            return;
        } else if ($(container).is(":visible")) {
            $(container).empty();
        }

        let docFrag = document.createDocumentFragment();
        let option, config;
        for (let index in options) {
            option = options[index];
            config = option.config;
            var rowElem = document.createElement("div");
            rowElem.className = "config-item-row";
            var lLabel = document.createElement("span");
            var rLabel = document.createElement("span");
            lLabel.className = "config-item item-left";
            rLabel.className = "config-item item-right";
            var elem = document.createElement("input");

            if (!('value' in option)) {
                option.value = option.defaultValue;
            }

            elem.type = config.input.type;
            if (config.label.left) {
                lLabel.id = config.label.left.id;
                lLabel.innerText = config.label.left.text;
            }

            if (config.label.right) {
                rLabel.id = config.label.right.id;
                if (config.label.right.id != null) {
                    this.displayValueForRangeUpdate(rLabel, this.rangeValueForConfigUpdate(config.input, option.value), config.input);
                } else if (config.label.right.text != null) {
                    rLabel.innerText = config.label.right.text;
                }
            }

            elem.id = index;
            elem.toChange = (config.label.right && config.label.right.id) || null;
            
            if (config.input.type == "range") {
                if (elem.toChange) {
                    elem.addEventListener("input", function(event) {
                        colorpicker.rangeAdjusted(event.target, event.target.toChange, index);
                    });
                }

                elem.addEventListener("change", function(event) {
                    colorpicker.rangeSet(event.target, index);
                });

                if (config.input.range != null) {
                    elem.setAttribute("min", config.input.range.min);
                    elem.setAttribute("max", config.input.range.max);
                }

                if (option.value != null) {
                    let configVal = option.value;
                    let rangeVal = configVal;
                    if (config.input.valueType === "percent") {
                        rangeVal = configVal * 100;
                    } else {
                        rangeVal = this.rangeValueForConfigUpdate(config.input, configVal);
                    }

                    $(elem).val(rangeVal);
                }
            } else if (config.input.type == "checkbox") {
                elem.addEventListener("change", function(event) {
                    colorpicker.checkboxSet(event.target);
                });

                if (option.value != null) {
                    elem.checked = option.value;
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