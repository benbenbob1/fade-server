import { IPatternConfig, InputType, InputValueType } from "./IPatternConfig";

export class Interval implements IPatternConfig {
    value = 50;

    leftLabel = {
        id: "",
        text: "Speed"
    };
    rightLabel = {
        id: "config-interval-input-percent",
        text: "100%"
    };

    inputType = InputType.ValueSlider;
    valueType = InputValueType.Percent;
    inputRange = {
        min: 0,
        max: 100
    };

    displayValue = 100;
    defaultValue = 0.5;

    constructor(name: string, min: number, max: number, 
        displayValue: number, defaultValue: number, 
        update: (newValue: number) => void) {
        this.displayValue = displayValue;
        this.defaultValue = defaultValue;
        this.leftLabel.text = name;
        this.inputRange.min = min;
        this.inputRange.max = max;
        this.value = Math.floor((max - min) / 2) + min;
        this.update = update;
    }

    update(newValue) {
        
    }
}

export class Checkbox implements IPatternConfig {
    value = 0;

    leftLabel = {
        id: "",
        text: ""
    };
    rightLabel = {
        id: "config-speed-input-percent",
        text: "100%"
    };

    inputType = InputType.Checkbox;

    constructor() {
        this.inputRange.min = min;
        this.inputRange.max = max;
        this.value = Math.floor((max - min) / 2) + min;
    }

    update(newValue) {

    }
}