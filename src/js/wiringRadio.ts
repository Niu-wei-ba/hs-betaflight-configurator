export const defaultRadioMap = [0, 1, 3, 2, 4, 5, 6, 7];

export function validRadioMap(map: unknown): map is number[] {
    return (
        Array.isArray(map) &&
        map.length === defaultRadioMap.length &&
        defaultRadioMap.every((entry) => map.includes(entry))
    );
}

export function validRadioChannels(channels: unknown): channels is number[] {
    return (
        Array.isArray(channels) &&
        channels.length >= 4 &&
        channels.length <= 16 &&
        Array.from(channels).every((value) => Number.isInteger(value) && value >= 1000 && value <= 2000)
    );
}

export function mapRadioChannels(channels: number[], map: unknown): number[] {
    const order = validRadioMap(map) ? map : defaultRadioMap;
    const unavailable = order.findIndex((index) => index >= channels.length);
    if (unavailable >= 0 && unavailable < 4) return [];
    if (unavailable >= 0) return order.slice(0, unavailable).map((index) => channels[index]);
    return [...order.map((index) => channels[index]), ...channels.slice(order.length)];
}
