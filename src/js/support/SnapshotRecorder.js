import CONFIGURATOR from "../data_storage";
import FC from "../fc";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import { createSupportSnapshotRequestKey } from "./SnapshotSession";

const STATIC_CONFIGURATION_CODES = [
    MSPCodes.MSP_FEATURE_CONFIG,
    MSPCodes.MSP_BEEPER_CONFIG,
    MSPCodes.MSP_ARMING_CONFIG,
    MSPCodes.MSP_SENSOR_CONFIG,
    MSPCodes.MSP_RX_CONFIG,
    MSPCodes.MSP_CF_SERIAL_CONFIG,
    MSPCodes.MSP_BOXNAMES,
    MSPCodes.MSP_MODE_RANGES,
    MSPCodes.MSP_MODE_RANGES_EXTRA,
    MSPCodes.MSP_BOXIDS,
    MSPCodes.MSP_RSSI_CONFIG,
    MSPCodes.MSP_RC,
    MSPCodes.MSP_ADJUSTMENT_RANGES,
    MSPCodes.MSP_RC_TUNING,
    MSPCodes.MSP_PID,
    MSPCodes.MSP_PID_ADVANCED,
    MSPCodes.MSP_FILTER_CONFIG,
    MSPCodes.MSP_MOTOR_CONFIG,
    MSPCodes.MSP_ADVANCED_CONFIG,
    MSPCodes.MSP_MIXER_CONFIG,
    MSPCodes.MSP_FAILSAFE_CONFIG,
    MSPCodes.MSP_BATTERY_CONFIG,
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
].filter((code, index, codes) => Number.isInteger(code) && codes.indexOf(code) === index);

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

        this.captureCodes = STATIC_CONFIGURATION_CODES;
        const captureGeneration = this.captureGeneration;
        CONFIGURATOR.supportSnapshotCaptureInProgress = true;
        this.capturePromise = (async () => {
            for (const code of STATIC_CONFIGURATION_CODES) {
                try {
                    await MSP.promise(code, undefined, { preserveOnTabSwitch: true });
                } catch (error) {
                    this.captureFailedCodes.push(code);
                    console.warn(`Support snapshot capture failed for MSP ${code}:`, error);
                }
            }
            const capturedCodes = new Set([...this.responses.values()].map((entry) => entry.code));
            const missingResponseCodes = STATIC_CONFIGURATION_CODES.filter((code) => !capturedCodes.has(code));
            this.captureFailedCodes = [...new Set([...this.captureFailedCodes, ...missingResponseCodes])];
            this.captureComplete = this.captureFailedCodes.length === 0;
        })().finally(() => {
            if (captureGeneration === this.captureGeneration) {
                CONFIGURATOR.supportSnapshotCaptureInProgress = false;
            }
        });
        return this.capturePromise;
    }

    async waitForStaticCapture(timeoutMs = 5_000) {
        if (!this.capturePromise) return;
        await Promise.race([this.capturePromise, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
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
                plannedResponseCount: this.captureCodes.length,
                missingResponseCodes: this.captureFailedCodes,
            },
        };
    }
}

export const supportSnapshotRecorder = new SupportSnapshotRecorder();
