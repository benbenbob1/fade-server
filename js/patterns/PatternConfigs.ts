import { IPatternConfig, InputType, InputValueType } from "./IPatternConfig";

export class Interval implements IPatternConfig {
    value: 255

    leftLabel: {
        id: "",
        text: "Speed"
    };
    rightLabel: {
        id: "config-speed-input-percent",
        text: "100%"
    };

    inputType: InputType.ValueSlider;
    valueType: InputValueType.Percent;
    inputRange: {
        min: 10,
        max: 500
    };

    update(newValue) {

    }
}