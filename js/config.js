class Strip {
    constructor() {
        this.name = "";
        this.multiColor = true;
        this.numLeds = 0;
    }
}

class Settings {
    constructor() {
        this.maxLedsPerStrip = 0;
        this.https = false;
        this.port = 0;
        this.debugMode = false;
        this.strips = [];
    }
}

class Config {
    constructor(configFileContents) {
        if (!configFileContents || configFileContents.length == 0) {
            return;
        }

        this._configDict = JSON.parse(configFileContents);

        for (var setting in this._configDict) {
            this[setting] = this._configDict[setting];
        }
    }

    toString() {
        var str = '{\n';
        for (var setting in this._configDict) {
            if (setting == "_configDict") {
                continue;
            }

            str += `  '${setting}': `;
            str += JSON.stringify(this[setting]);
            str += ', \n';
        }

        str += '}';

        return str;
    }
}

if(typeof exports == 'undefined'){
    var exports = this['mymodule'] = {};
}

if (typeof module !== "undefined") {
    module.exports = Config;
}