import { IPattern } from "./IPattern"

export interface IPatternOneColorStrip extends IPattern {
    getColor(): Array<number>; //HSV
    writeColor(HSV: Array<number>);
}