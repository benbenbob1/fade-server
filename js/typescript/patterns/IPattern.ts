import { IPatternConfig } from "./IPatternConfig";
import { Interval } from "./PatternConfigs";

// A pattern operates on a single strip
export abstract class IPattern {
    static Options: {
        [ id: string ]: IPatternConfig,
        "Interval": IPatternConfig
    };
    static Variables: {
        [ id: string ]: number
    };
    // default timing; frequency (msec) of tick firing
    // For example interval of 500 would fire twice per second
    static Interval: number = 500;
    display: {
        title: string,
        backgroundDivCss: {
            [ cssSelector: string ]: {
                [ cssProperty: string ]: string;
            }
        }
    };

    abstract tick(time: number); //time starts when pattern starts
    abstract start();
}