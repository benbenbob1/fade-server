var colorsLocked, lastButtonPressedId;
var buttons = null;
var loc = document.location.origin;
var socket = io.connect(loc);
console.log("Socket connected to",loc)
//var socket = io.connect('http://rpi.student.rit.edu:8080');
//var socket = io.connect('http://127.0.0.1:8080');
var curFade = '';
var reachable = false;


socket.on('color', function(data) {
    //console.log('Rec: '+JSON.stringify(data));
    if ('strip' in data) {
        deselectPreset();
        setLocalColor(data.strip, [data.r, data.g, data.b]);
    } else if ('id' in data) {
        deselectPreset();
        if (data.id != 'stop') {
            choosePreset(data.id, data.config);
        } else {
            removeConfig();
            console.log("Got stop pattern message");
        }
    }
});

socket.on('connect', function() {
    console.log("Connected");
    reachable = true;
    disableButtons(false);
});

socket.on('disconnect', function() {
    reachable = false;
    disableButtons(true);
});

socket.on('error', function(err) {
    reachable = false;
    console.err(err);
});

function disableButtons(enabled) {
    if (!buttons) {
        buttons = $("button.jscolor");
    }
    if (enabled) {
        buttons.each(function(idx) {
            $(this).addClass("offline");
            $(this).prop("disabled", true);
        })
    } else {
        buttons.each(function(idx) {
            $(this).removeClass("offline");
            $(this).prop("disabled", false);
        })
    }
}

function setLocalColor(strip, color) {
    var elem = 'cc'+(strip+1);

    //console.log('Setting '+elem+' to '+JSON.stringify(color));

    document.getElementById(elem).style.background = rgbToHex(color[0], color[1], color[2]);
    //$('#'+elem).prop('value', rgbToHex(color[0], color[1], color[2]));
    $('#'+elem).css('color', getTextColorForBackground(color[0], color[1], color[2]));
}

$(document).ready(function() {
    colorsLocked = localStorage.getItem('locked');

    if (colorsLocked === 'false') {
        colorsLocked = true;
        //Reverse so the function will act naturally
    } else {
        colorsLocked = false;
    }

    disableButtons(false);

    lockIconClicked();
});

var bufferOpen = true;
function post(data) {
    if (bufferOpen) {
        //console.log('Posting '+JSON.stringify(data))
        socket.emit('newcolor', data);
        bufferOpen = false;
        setTimeout(function() {
            bufferOpen = true;
        }, 100);
    }
}

function lockIconClicked() {
    var locked = 'locked.png',
        unlocked = 'unlocked.png';

    colorsLocked = !colorsLocked;
    $('#lock-strips').attr('src', '/assets/'+(colorsLocked?locked:unlocked));
    $('#cc2').prop('disabled', colorsLocked);
    $('#cc2').css('top', (colorsLocked?-30:30)+'px');

    localStorage.setItem('locked', colorsLocked);
}

function deselectPreset() {
    $('.button-selected').blur();
    return $('.button-selected').removeClass('button-selected').attr('id');
}

//Called by external preset updating
function choosePreset(id, options) {
    $('#pattern-'+id).addClass('button-selected');
    var config = options || patterns[id].config;
    if (config) {
        setupConfig(config);
    }
}

function chosePreset(id) {
    console.log("Preset: "+ id);
    if (!reachable) {
        return;
    }
    var last = deselectPreset();
    if (id !== last) {
        var submission = id.substring("pattern-".length);
        //setupConfig(patterns[submission].options || null);
        post({id: submission});
    } else {
        removeConfig();
        post({id: "stop"});
    }
}

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? '0' + hex : hex;
}

function rgbToHex(r, g, b) {
    return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function getTextColorForBackground(r, g, b) {
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    //Using a weight system for each color, determine the darkness
    var bOrW = (yiq >= 128) ? 0 : 1;
    return bOrW ? '#FFF' : '#000';
}

function colorUpdated(picker) {
    var color = {};
    color.r = Math.round(picker.rgb[0]);
    color.g = Math.round(picker.rgb[1]);
    color.b = Math.round(picker.rgb[2]);
    color.strip = [];

    if (colorsLocked) {
        color.strip = [0, 1];
        post(color);
    } else {
        switch (lastButtonPressedId) {
            case 'cc1':
                color.strip = 0;
                break;
            case 'cc2':
                color.strip = 1;
                break;
            default:
                color.strip = 0;
        }
        post(color);
    }
}

function lastButtonPressed(button) {
    lastButtonPressedId = button;
}

/*

Config Space

*/

function rangeAdjusted(item, toUpdate) {
    if (toUpdate && toUpdate.length>0) {
        var elem = document.getElementById(toUpdate);
        elem.innerText = item.value + "%";
    }
}

function rangeSet(element) {
    post({
        config: element.id,
        value: parseInt(element.value)
    });
}

function checkboxSet(element) {
    post({
        config: element.id,
        value: element.checked
    });
}

function removeConfig() {
    var container = document.getElementById("config-space");
    if (!$(container).is(":visible")) {
        return;
    }
    $(container).empty();
}

function setupConfig(options) {
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
            if (config.input.valueType && config.input.valueType === "percent" && option.displayValue != null) {
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

            if (option.displayValue != null) {
                elem.setAttribute("value", option.displayValue);
            }

            if (config.input.range != null) {
                elem.setAttribute("min", config.input.range.min);
                elem.setAttribute("max", config.input.range.max);
            }
        } else if (config.input.type == "checkbox") {
            elem.addEventListener("change", function(event) {
                checkboxSet(event.target);
            });
            if (option.displayValue != null) {
                //elem.setAttribute("checked", option.displayValue);
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