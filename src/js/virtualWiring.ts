import { getCurrentScope, onScopeDispose, watch, type Ref } from "vue";
import FC from "./fc.js";
import CONFIGURATOR from "./data_storage.js";
import MSPCodes from "./msp/MSPCodes.js";
import EscProtocols from "./utils/EscProtocols.js";
import { vueTabState } from "./vue_tab_mounter.js";

const protocol = "hs-fpv-virtual-fc";
export const wiringBuild = import.meta.env.VITE_WIRING_VIRTUAL_FC === "1";
const origin = import.meta.env.VITE_WIRING_VIRTUAL_PARENT_ORIGIN;
export const wiringTabs = ["ports", "configuration", "gps", "led_strip", "auxiliary", "motors", "receiver"];

type Direction = 1 | -1;
interface Motor {
    output: number;
    channel: number;
    escId: string;
    powered: boolean;
}
interface Peripheral {
    kind: string;
    connected: boolean;
    powered: boolean | null;
    port: number | null;
}
interface Hardware {
    controllerId: string;
    batteryVoltage: number;
    motors: Motor[];
    peripherals: Peripheral[];
}
interface Settings {
    groups: Record<string, unknown>;
    motors: { directions: Record<string, Direction> };
}
interface Reply {
    type: string;
    protocol: string;
    version: number;
    session?: string;
    hardware?: unknown;
    settings?: Settings;
    revision?: number;
    ok?: boolean;
}
type Save = { resolve: () => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> };

const groups = [
    "SERIAL_CONFIG",
    "GPS_CONFIG",
    "RX_CONFIG",
    "MIXER_CONFIG",
    "MOTOR_CONFIG",
    "MOTOR_3D_CONFIG",
    "MOTOR_OUTPUT_ORDER",
    "PID_ADVANCED_CONFIG",
    "ARMING_CONFIG",
    "ADVANCED_CONFIG",
    "FILTER_CONFIG",
    "LED_STRIP",
    "LED_COLORS",
    "LED_MODE_COLORS",
    "LED_CONFIG_VALUES",
    "MODE_RANGES",
    "MODE_RANGES_EXTRA",
] as const;

let session = "";
let hardware: Hardware | undefined;
let directions: Record<string, Direction> = {};
let savedSettings: ReturnType<typeof currentSettings> | undefined;
let outputs: number[] = [];
let revision = 0;
const waiting = new Map<number, Save>();
const dirtySources = new Map<object, boolean>();

function send(type: string, fields: Record<string, unknown> = {}) {
    if (!origin || window.parent === window) return;
    window.parent.postMessage({ protocol, version: 1, session, type, ...fields }, origin);
}

function validHardware(value: unknown): value is Hardware {
    if (!value || typeof value !== "object") return false;
    const { controllerId, batteryVoltage, motors, peripherals } = value as Partial<Hardware>;
    return (
        typeof controllerId === "string" &&
        controllerId.length <= 80 &&
        typeof batteryVoltage === "number" &&
        Number.isFinite(batteryVoltage) &&
        batteryVoltage >= 0 &&
        batteryVoltage <= 26 &&
        Array.isArray(motors) &&
        motors.length <= 16 &&
        Array.isArray(peripherals) &&
        peripherals.length <= 500 &&
        peripherals.every(
            (part) =>
                typeof part?.kind === "string" &&
                typeof part.connected === "boolean" &&
                (part.powered === null || typeof part.powered === "boolean") &&
                (part.port === null || (Number.isInteger(part.port) && part.port >= 0 && part.port < 5)),
        ) &&
        motors.every(
            (motor) =>
                Number.isInteger(motor?.output) &&
                motor.output >= 0 &&
                motor.output < 4 &&
                Number.isInteger(motor.channel) &&
                motor.channel >= 0 &&
                motor.channel < 4 &&
                typeof motor.escId === "string" &&
                /^[\w-]{1,80}$/.test(motor.escId) &&
                typeof motor.powered === "boolean",
        )
    );
}

export function trackWiringDirty(dirty: Ref<boolean>) {
    if (!wiringBuild || !getCurrentScope()) return;
    const key = {};
    const notify = () => send("dirty", { dirty: [...dirtySources.values()].some(Boolean) });
    watch(
        dirty,
        (value) => {
            dirtySources.set(key, value);
            notify();
        },
        { immediate: true, flush: "sync" },
    );
    onScopeDispose(() => {
        dirtySources.delete(key);
        notify();
    });
}

export function stopWiringOutputs() {
    outputs = [];
    if (session) send("outputs", { outputs });
}

function updateDetectedSensors() {
    const gpsPort = FC.SERIAL_CONFIG.ports.find((entry) => entry.functions.includes("GPS"));
    const gpsReady =
        FC.FEATURE_CONFIG.features.isEnabled("GPS") &&
        hardware?.peripherals.some(
            (part) => part.kind === "gps" && part.connected && part.powered && part.port === gpsPort?.identifier,
        );
    FC.CONFIG.activeSensors = 33 | (gpsReady ? 8 : 0);
    const batteryVoltage = hardware?.batteryVoltage ?? 0;
    Object.assign(FC.ANALOG, { voltage: batteryVoltage, mAhdrawn: 0, rssi: 0, amperage: 0 });
    Object.assign(FC.BATTERY_STATE, { voltage: batteryVoltage, cellCount: batteryVoltage > 0 ? 6 : 0 });
}

export function initializeWiringChannel(open: (settings?: Settings) => void) {
    if (!wiringBuild || !origin || window.parent === window) return;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const discover = setInterval(() => send("ready"), 500);
    window.addEventListener("message", (event: MessageEvent<Reply>) => {
        const message = event.data;
        if (
            event.source !== window.parent ||
            event.origin !== origin ||
            message?.protocol !== protocol ||
            message.version !== 1
        )
            return;
        if (
            message.type === "initialize" &&
            !session &&
            typeof message.session === "string" &&
            validHardware(message.hardware)
        ) {
            session = message.session;
            hardware = message.hardware;
            clearInterval(discover);
            open(message.settings ?? undefined);
            savedSettings = currentSettings();
            updateDetectedSensors();
            send("connected", { settings: savedSettings });
            heartbeat = setInterval(() => {
                if (outputs.length) send("outputs", { outputs });
            }, 400);
            return;
        }
        if (!session || message.session !== session) return;
        if (message.type === "hardware" && validHardware(message.hardware)) {
            hardware = message.hardware;
            updateDetectedSensors();
            stopWiringOutputs();
        } else if (message.type === "save-result" && typeof message.revision === "number") {
            const request = waiting.get(message.revision);
            if (!request) return;
            waiting.delete(message.revision);
            clearTimeout(request.timer);
            if (message.ok) request.resolve();
            else request.reject(new Error("无法保存虚拟飞控设置。"));
        } else if (message.type === "disconnect") {
            stopWiringOutputs();
            clearInterval(heartbeat);
            for (const request of waiting.values()) {
                clearTimeout(request.timer);
                request.reject(new Error("虚拟飞控已断开。"));
            }
            waiting.clear();
            session = "";
            hardware = undefined;
        }
    });
    watch(() => vueTabState.activeTabName, stopWiringOutputs);
    window.addEventListener("pagehide", stopWiringOutputs);
    send("ready");
}

export function hydrateWiringSettings(settings?: Settings) {
    FC.CONFIG.hardwareName = "F722 Virtual";
    FC.CONFIG.flightControllerVersion = "2026.6.2";
    FC.CONFIG.activeSensors = 1;
    FC.CONFIG.armingDisabled = true;
    FC.CONFIG.buildOptions = [
        "USE_GPS",
        "USE_LED_STRIP",
        "USE_DSHOT",
        "USE_BEEPER",
        "USE_VTX",
        "USE_SERIALRX_CRSF",
        "USE_SERIALRX_SBUS",
    ];
    FC.FEATURE_CONFIG.features.setMask(0);
    FC.GPS_DATA = { fix: 0, numSat: 0, latitude: 0, longitude: 0, altitude: 0, speed: 0, ground_course: 0 };
    FC.MIXER_CONFIG.mixer = 3;
    FC.MOTOR_OUTPUT_ORDER = [0, 1, 2, 3];
    FC.PID_ADVANCED_CONFIG.motorIdle = 5.5;
    FC.LED_COLORS = [
        { h: 0, s: 0, v: 0 },
        { h: 0, s: 255, v: 255 },
        ...Array.from({ length: 12 }, (_, index) => ({ h: index * 30, s: 0, v: 255 })),
        { h: 0, s: 0, v: 0 },
        { h: 0, s: 0, v: 0 },
    ];
    FC.LED_CONFIG_VALUES = { brightness: 100, rainbow_delta: 0, rainbow_freq: 0 };
    FC.LED_STRIP = Array.from({ length: 4 }, () => ({ x: 0, y: 0, directions: "", functions: "", color: 0 }));
    FC.MODE_RANGES = Array.from({ length: 20 }, () => ({ id: 0, auxChannelIndex: 0, range: { start: 900, end: 900 } }));
    FC.MODE_RANGES_EXTRA = Array.from({ length: 20 }, () => ({ id: 0, modeLogic: 0, linkedTo: 0 }));
    FC.RC = { active_channels: 0, channels: [] };
    directions = {};
    if (!settings?.groups) return;
    const target = FC as unknown as Record<string, unknown>;
    for (const key of groups) {
        if (Object.hasOwn(settings.groups, key)) target[key] = settings.groups[key];
    }
    if (typeof settings.groups.features === "number") FC.FEATURE_CONFIG.features.setMask(settings.groups.features);
    if (typeof settings.groups.beepers === "number") FC.BEEPER_CONFIG.beepers.setDisabledMask(settings.groups.beepers);
    directions = { ...settings.motors?.directions };
}

function colorHex(color?: { h: number; s: number; v: number }) {
    if (!color?.v) return null;
    const hue = (((Number(color.h) % 360) + 360) % 360) / 60;
    const value = Number(color.v) / 255;
    const saturation = 1 - Number(color.s) / 255;
    const chroma = value * saturation;
    const middle = chroma * (1 - Math.abs((hue % 2) - 1));
    const channels = [
        [chroma, middle, 0],
        [middle, chroma, 0],
        [0, chroma, middle],
        [0, middle, chroma],
        [middle, 0, chroma],
        [chroma, 0, middle],
    ];
    const rgb = channels[Math.floor(hue)];
    return rgb
        ? "#" +
              rgb
                  .map((channel) =>
                      Math.round((channel + value - chroma) * 255)
                          .toString(16)
                          .padStart(2, "0"),
                  )
                  .join("")
        : null;
}

function currentSettings() {
    const model = FC as unknown as Record<string, unknown>;
    const features = FC.FEATURE_CONFIG.features;
    const beepers = FC.BEEPER_CONFIG.beepers;
    const beeperId = FC.AUX_CONFIG_IDS[FC.AUX_CONFIG.indexOf("BEEPERON")];
    return JSON.parse(
        JSON.stringify({
            groups: {
                ...Object.fromEntries(groups.map((key) => [key, model[key]])),
                features: features.peekMask(),
                beepers: beepers.getDisabledMask(),
            },
            ports: FC.SERIAL_CONFIG.ports,
            gps: { enabled: features.isEnabled("GPS"), provider: Number(FC.GPS_CONFIG.provider) },
            led: {
                enabled: features.isEnabled("LED_STRIP"),
                colors: FC.LED_STRIP.map((led) =>
                    led.functions.includes("c") ? colorHex(FC.LED_COLORS[led.color]) : null,
                ),
            },
            buzzer: {
                enabled: beepers.isEnabled("RX_SET"),
                ranges: FC.MODE_RANGES.filter(
                    (entry) => entry.id === beeperId && entry.range.start < entry.range.end,
                ).map((entry) => ({ channel: entry.auxChannelIndex, from: entry.range.start, to: entry.range.end })),
            },
            motors: {
                order: FC.MOTOR_OUTPUT_ORDER,
                reverseMixer: Boolean(FC.MIXER_CONFIG.reverseMotorDir),
                dshot: EscProtocols.IsProtocolDshot(FC.CONFIG.apiVersion, FC.PID_ADVANCED_CONFIG.fast_pwm_protocol),
                directions,
            },
        }),
    );
}

let saveQueue = Promise.resolve();
let directionQueue = Promise.resolve();
function persist(settings: ReturnType<typeof currentSettings>) {
    const request = saveQueue
        .then(
            () =>
                new Promise<void>((resolve, reject) => {
                    if (!session) {
                        reject(new Error("虚拟飞控已断开。"));
                        return;
                    }
                    const requestRevision = ++revision;
                    const timer = setTimeout(() => {
                        waiting.delete(requestRevision);
                        reject(new Error("保存虚拟飞控设置超时。"));
                    }, 4000);
                    waiting.set(requestRevision, { resolve, reject, timer });
                    send("save", { revision: requestRevision, settings });
                }),
        )
        .then(() => {
            savedSettings = settings;
        });
    saveQueue = request.catch(() => {});
    return request;
}

function setMotorValues(data: ArrayLike<number>) {
    const stopValue = EscProtocols.IsProtocolDshot(FC.CONFIG.apiVersion, FC.PID_ADVANCED_CONFIG.fast_pwm_protocol)
        ? 1000
        : FC.MOTOR_CONFIG.mincommand || 1000;
    const mapped = savedSettings?.motors.order ?? FC.MOTOR_OUTPUT_ORDER;
    outputs = Array.from(mapped as number[]).filter(
        (output, index) =>
            (data[index * 2] ?? 0) + ((data[index * 2 + 1] ?? 0) << 8) > stopValue &&
            hardware?.motors.some((motor) => motor.output === output && motor.powered),
    );
    send("outputs", { outputs });
}

async function setDirection(data: ArrayLike<number>) {
    const [target, count] = [data[1], data[2]];
    const commands = Array.from(data).slice(3, 3 + count);
    const command = commands.find((value) => value === 7 || value === 8 || value === 20 || value === 21);
    if (!command || !commands.includes(12) || !savedSettings) return;
    const order = savedSettings.motors.order as number[];
    const nextDirections = { ...directions };
    let touched = false;
    for (const motor of hardware?.motors ?? []) {
        if (!motor.powered || (target !== 255 && motor.output !== order[target])) continue;
        nextDirections[`${motor.escId}:${motor.channel}`] = command === 7 || command === 20 ? 1 : -1;
        touched = true;
    }
    if (!touched) return;
    await persist({ ...savedSettings, motors: { ...savedSettings.motors, directions: nextDirections } });
    directions = nextDirections;
}

export async function dispatchWiringMsp(code: number, data: ArrayLike<number> | false = false) {
    if (!session) throw new Error("虚拟飞控已断开。");
    if (!CONFIGURATOR.virtualMode) throw new Error("当前连接并非虚拟飞控。");
    switch (code) {
        case MSPCodes.MSP_EEPROM_WRITE:
            stopWiringOutputs();
            await directionQueue;
            await persist(currentSettings());
            updateDetectedSensors();
            break;
        case MSPCodes.MSP_SET_MOTOR:
            if (data) setMotorValues(data);
            break;
        case MSPCodes.MSP2_SEND_DSHOT_COMMAND:
            if (data) {
                const pending = directionQueue.then(() => setDirection(data));
                directionQueue = pending.catch(() => {});
                await pending;
            }
            break;
        case MSPCodes.MSP_SET_REBOOT:
            stopWiringOutputs();
            break;
        // Configurator tabs write to their FC store before sending MSP. EEPROM
        // persistence reads those drafts, while telemetry reads use the same store.
    }
}
