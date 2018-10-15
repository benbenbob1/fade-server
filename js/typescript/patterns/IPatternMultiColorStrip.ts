import { IPattern } from "./IPattern"

export abstract class IPatternMultiColorStrip extends IPattern {
    numLeds: number = 0;
    getColors(): Array<Array<number>> { return [] }; //HSV per led
    writeColors(HSV: Array<Array<number>>, fade: boolean) {}; //Write [H,S,V] to strip
    abstract tick(time: number); //time starts when pattern starts
    start() {};
}
