import CONFIGURATOR from "../data_storage";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48 } from "../data_storage";
import FC from "../fc";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import { mspHelper } from "../msp/MSPHelper";
import semver from "semver";
import { createSupportSnapshotRequestKey } from "./SnapshotSession";

const BASE_STATIC_CONFIGURATION_CODES = [
    MSPCodes.MSP_FEATURE_CONFIG,
    MSPCodes.MSP_BEEPER_CONFIG,
    MSPCodes.MSP_ARMING_CONFIG,
    MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG,
    MSPCodes.MSP_SENSOR_CONFIG,
    MSPCodes.MSP_SENSOR_ALIGNMENT,
    MSPCodes.MSP_ACC_TRIM,
    MSPCodes.MSP_RX_CONFIG,
    MSPCodes.MSP_RX_MAP,
    MSPCodes.MSP_RC_DEADBAND,
    MSPCodes.MSP_CF_SERIAL_CONFIG,
    MSPCodes.MSP2_COMMON_SERIAL_CONFIG,
    MSPCodes.MSP_BOXNAMES,
    MSPCodes.MSP_MODE_RANGES,
    MSPCodes.MSP_MODE_RANGES_EXTRA,
    MSPCodes.MSP_BOXIDS,
    MSPCodes.MSP_RSSI_CONFIG,
    MSPCodes.MSP_RC,
    MSPCodes.MSP_ADJUSTMENT_RANGES,
    MSPCodes.MSP_RC_TUNING,
    MSPCodes.MSP_PID,
    MSPCodes.MSP_PIDNAMES,
    MSPCodes.MSP_SIMPLIFIED_TUNING,
    MSPCodes.MSP_PID_ADVANCED,
    MSPCodes.MSP_FILTER_CONFIG,
    MSPCodes.MSP_MOTOR_CONFIG,
    MSPCodes.MSP_ADVANCED_CONFIG,
    MSPCodes.MSP_MIXER_CONFIG,
    MSPCodes.MSP_FAILSAFE_CONFIG,
    MSPCodes.MSP_RXFAIL_CONFIG,
    MSPCodes.MSP_BATTERY_CONFIG,
    MSPCodes.MSP_BATTERY_STATE,
    MSPCodes.MSP_STATUS_EX,
    MSPCodes.MSP_VOLTAGE_METERS,
    MSPCodes.MSP_CURRENT_METERS,
    MSPCodes.MSP_CURRENT_METER_CONFIG,
    MSPCodes.MSP_VOLTAGE_METER_CONFIG,
    MSPCodes.MSP_OSD_CONFIG,
    MSPCodes.MSP_VTX_CONFIG,
    MSPCodes.MSP_LED_STRIP_CONFIG,
    MSPCodes.MSP_LED_COLORS,
    MSPCodes.MSP_LED_STRIP_MODECOLOR,
    MSPCodes.MSP_BLACKBOX_CONFIG,
    MSPCodes.MSP_DATAFLASH_SUMMARY,
    MSPCodes.MSP_SDCARD_SUMMARY,
    MSPCodes.MSP_GPS_CONFIG,
    MSPCodes.MSP_GPS_RESCUE,
    MSPCodes.MSP_COMPASS_CONFIG,
    MSPCodes.MSP_SERVO_CONFIGURATIONS,
    MSPCodes.MSP_SERVO_MIX_RULES,
].filter((code, index, codes) => Number.isInteger(code) && codes.indexOf(code) === index);

function getStaticConfigurationRequests() {
    const requests = BASE_STATIC_CONFIGURATION_CODES.map((code) => ({ code }));

    requests.push({ code: MSPCodes.MSP_MOTOR_3D_CONFIG }, { code: MSPCodes.MSP2_MOTOR_OUTPUT_REORDERING });

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        requests.push(
            { code: MSPCodes.MSP2_GET_TEXT, data: mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME) },
            { code: MSPCodes.MSP2_GET_TEXT, data: mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PILOT_NAME) },
            { code: MSPCodes.MSP2_GET_TEXT, data: mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PID_PROFILE_NAME) },
            {
                code: MSPCodes.MSP2_GET_TEXT,
                data: mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.RATE_PROFILE_NAME),
            },
        );
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_48) && (FC.CONFIG.numberOfBatteryProfiles || 0) > 0) {
        requests.push({
            code: MSPCodes.MSP2_GET_TEXT,
            data: mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.BATTERY_PROFILE_NAME),
        });
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        requests.push({ code: MSPCodes.MSP_OSD_CANVAS });
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        requests.push({ code: MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES });
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        requests.push(
            { code: MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE },
            { code: MSPCodes.MSP2_GYRO_SENSOR },
            { code: MSPCodes.MSP2_MCU_INFO },
        );
    }

    if (FC.MOTOR_CONFIG.use_dshot_telemetry || FC.MOTOR_CONFIG.use_esc_sensor) {
        requests.push({ code: MSPCodes.MSP_MOTOR_TELEMETRY });
    }

    return requests;
}

function appendVtxTableRequests(requests) {
    const bands = Math.min(Math.max(Number(FC.VTX_CONFIG.vtx_table_bands) || 0, 0), 8);
    const powerLevels = Math.min(Math.max(Number(FC.VTX_CONFIG.vtx_table_powerlevels) || 0, 0), 8);

    for (let index = 1; index <= bands; index += 1) {
        requests.push({ code: MSPCodes.MSP_VTXTABLE_BAND, data: [index] });
    }

    for (let index = 1; index <= powerLevels; index += 1) {
        requests.push({ code: MSPCodes.MSP_VTXTABLE_POWERLEVEL, data: [index] });
    }
}

function getCaptureRequests() {
    const requests = getStaticConfigurationRequests();
    const vtxConfigIndex = requests.findIndex(({ code }) => code === MSPCodes.MSP_VTX_CONFIG);
    if (vtxConfigIndex !== -1) {
        // The table sizes are returned by MSP_VTX_CONFIG, so table requests are appended
        // immediately after it during capture once FC.VTX_CONFIG has been populated.
        requests.splice(vtxConfigIndex + 1, 0, { code: MSPCodes.MSP_VTX_CONFIG, _appendVtxTables: true });
        requests.splice(vtxConfigIndex, 1);
    }
    return requests;
}

function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

class SupportSnapshotRecorder {
    constructor() {
        this.responses = new Map();
        this.unsubscribe = null;
        this.capturePromise = null;
        this.captureComplete = false;
        this.captureRequests = [];
        this.captureCodes = [];
        this.captureFailedCodes = [];
        this.captureGeneration = 0;
    }

    start() {
        this.stop();
        this.captureGeneration += 1;
        this.responses.clear();
        this.capturePromise = null;
        this.captureComplete = false;
        this.captureCodes = [];
        this.captureFailedCodes = [];
        if (typeof MSP.addResponseListener !== "function") return;
        this.unsubscribe = MSP.addResponseListener(({ code, payload, requestKeys }) => {
            const keys = requestKeys?.length ? requestKeys : [createSupportSnapshotRequestKey(code, [])];
            for (const requestKey of keys) {
                this.responses.set(requestKey, { code, requestKey, payloadBase64: bytesToBase64(payload) });
            }
        });
    }

    stop() {
        this.captureGeneration += 1;
        CONFIGURATOR.supportSnapshotCaptureInProgress = false;
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    captureStaticConfiguration() {
        if (this.capturePromise) return this.capturePromise;

        this.captureRequests = getCaptureRequests();
        this.captureCodes = this.captureRequests.map(({ code }) => code);
        const captureRequests = this.captureRequests;
        const captureGeneration = this.captureGeneration;
        CONFIGURATOR.supportSnapshotCaptureInProgress = true;
        this.capturePromise = (async () => {
            for (let index = 0; index < captureRequests.length; index += 1) {
                const request = captureRequests[index];
                try {
                    await MSP.promise(request.code, request.data, { preserveOnTabSwitch: true });
                    if (request._appendVtxTables) {
                        appendVtxTableRequests(captureRequests);
                    }
                } catch (error) {
                    this.captureFailedCodes.push(request.code);
                    console.warn(`Support snapshot capture failed for MSP ${request.code}:`, error);
                }
            }
            const missingRequests = captureRequests.filter(
                (request) => !this.responses.has(createSupportSnapshotRequestKey(request.code, request.data)),
            );
            const missingResponseCodes = missingRequests.map(({ code }) => code);
            this.captureCodes = captureRequests.map(({ code }) => code);
            this.captureFailedCodes = [...new Set([...this.captureFailedCodes, ...missingResponseCodes])];
            this.captureComplete = this.captureFailedCodes.length === 0;
        })().finally(() => {
            if (captureGeneration === this.captureGeneration) {
                CONFIGURATOR.supportSnapshotCaptureInProgress = false;
            }
        });
        return this.capturePromise;
    }

    async waitForStaticCapture(timeoutMs) {
        if (!this.capturePromise) return;
        const requestTimeoutMs = (MSP.TIMEOUT || 1_000) * (MSP.MAX_RETRIES || 1);
        const captureTimeoutMs = Math.max(60_000, this.captureRequests.length * requestTimeoutMs + 5_000);
        const timeout = timeoutMs ?? captureTimeoutMs;
        await Promise.race([this.capturePromise, new Promise((resolve) => setTimeout(resolve, timeout))]);
    }

    createPayload(cliTranscript) {
        return {
            schemaVersion: 1,
            metadata: {
                createdAt: new Date().toISOString(),
                firmwareVersion: FC.CONFIG.flightControllerVersion,
                apiVersion: FC.CONFIG.apiVersion,
                target: FC.CONFIG.targetName,
                boardName: FC.CONFIG.boardName,
                configuratorVersion: CONFIGURATOR.version,
            },
            mspResponses: [...this.responses.values()],
            cliTranscript,
            captureReport: {
                complete: this.captureComplete,
                responseCount: this.responses.size,
                plannedResponseCount: this.captureRequests.length,
                missingResponseCodes: this.captureFailedCodes,
            },
        };
    }
}

export const supportSnapshotRecorder = new SupportSnapshotRecorder();
