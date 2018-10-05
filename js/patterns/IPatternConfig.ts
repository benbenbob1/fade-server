export enum InputType {
    ValueSlider,
    Checkbox
}
export enum InputValueType {
    Percent
}

export interface IConfigLabel {
    id: string;
    text: string;
}

export interface IPatternConfig {
    value: any;

    leftLabel?: IConfigLabel;
    rightLabel?: IConfigLabel;

    inputType: InputType;
    inputRange: {
        min: number,
        max: number
    }
    valueType: InputValueType;

    update(value: number);
}