import { IPatternConfig } from "./IPatternConfig";

// A pattern operates on a single strip

export abstract class IPattern {
    options: { 
        [ name: string ]: {
            displayValue: string,
            defaultValue: any,
            value: any
            config: IPatternConfig
        },
    }
    display: {
        title: string,
        backgroundDivCss: {
            [ cssSelector: string ]: {
                [ cssProperty: string ]: string;
            }
        }
    }
    abstract tick(time: number); //time starts when pattern starts
    start() {
        // Pattern start sequence
    }
}