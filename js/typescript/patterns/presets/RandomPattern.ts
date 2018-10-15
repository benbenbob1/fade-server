import { IPatternMultiColorStrip } from "../IPatternMultiColorStrip";
import { Interval } from "../PatternConfigs";

export class RandomPattern extends IPatternMultiColorStrip {
    
    
    Options = {
        "speed": new Interval("Speed", 10, 500, 100, 255, (newValue:number) => {
            this.Variables.speed.value = newValue;
        }),
        "brightness": new Interval("Brightness", 10, 100, 100, 1.0)
    };

    display = {
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
    };

    color(brightness: number): number {
        return Math.floor(Math.random() * 255 * brightness);
    }
    randColor(brightness: number): Array<number> {
        return [
            this.color(brightness),
            this.color(brightness),
            this.color(brightness)
        ];
    }
    tick(time: number) {
        var strip = [];
        for (var x=0; x<this.numLeds; x++) {
            strip.push(this.randColor(this.options.brightness.value));
        }

        this.writeColors(strip, this.variables.fade.value);
    }
}