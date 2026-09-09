import { reactive } from "vue";
import CONFIGURATOR from "../data_storage";
import FC from "../fc";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import semver from "semver";
import { createSupportSnapshotRequestKey } from "./SnapshotSession";
import { STATIC_SNAPSHOT_CODES, isSnapshotRequiredCode } from "./SnapshotRequests";
import { validateSnapshotV2 } from "./SnapshotContract";

export const supportSnapshotCaptureState = reactive({ active: false, ready: false, error: "" });

function deepFreeze(value) {
    if (value && typeof value === "object") {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

export class SupportSnapshotRecorder {
    constructor({ msp = MSP, fc = FC, config = CONFIGURATOR, state = supportSnapshotCaptureState } = {}) {
        Object.assign(this, { msp, fc, config, state, controller: null, frozen: null });
    }

    start() {
        this.stop();
    }

    stop() {
        this.controller?.abort();
        this.frozen = null;
        this.state.ready = false;
        this.state.active = false;
        this.config.supportSnapshotCaptureInProgress = false;
        this.msp.snapshotCaptureActive = false;
    }

    async captureStaticConfiguration() {
        this.stop();
        const controller = new AbortController();
        this.controller = controller;
        this.state.active = true;
        this.state.error = "";
        this.config.supportSnapshotCaptureInProgress = true;
        this.msp.snapshotCaptureActive = true;
        const startedAt = new Date().toISOString();
        const responses = new Map();
        const requests = new Map();
        const overallTimeout = setTimeout(
            () => controller.abort(new Error("快照采集超过 60 秒，请重新进入 CLI 重试。")),
            60_000,
        );
        const request = async (code, data = []) => {
            const requestKey = createSupportSnapshotRequestKey(code, data);
            const required = isSnapshotRequiredCode(code);
            const item = { code, requestKey, required, status: "failed" };
            requests.set(requestKey, item);
            try {
                const response = await this.msp.captureRequest(code, data, {
                    signal: controller.signal,
                    timeoutMs: 3000,
                });
                if (response.crcError) throw new Error(`MSP ${code} 校验失败，请重新采集。`);
                item.status = response.unsupported ? "unsupported" : "success";
                if (required && response.unsupported) throw new Error(`飞控不支持必要的 MSP ${code}，无法采集快照。`);
                const bytes = response.unsupported
                    ? new Uint8Array()
                    : new Uint8Array(response.data.buffer, response.data.byteOffset, response.data.byteLength);
                let binary = "";
                for (const byte of bytes) binary += String.fromCharCode(byte);
                responses.set(requestKey, {
                    code,
                    requestKey,
                    payloadBase64: btoa(binary),
                    unsupported: Boolean(response.unsupported),
                });
            } catch (error) {
                item.status = error.name === "TimeoutError" ? "timeout" : "failed";
                throw error;
            }
        };
        try {
            await request(MSPCodes.MSP_STATUS_EX);
            const profile = { pid: this.fc.CONFIG.profile, rate: this.fc.CONFIG.rateProfile };
            for (const code of STATIC_SNAPSHOT_CODES) await request(code);
            if (semver.gte(this.fc.CONFIG.apiVersion, "1.45.0")) {
                for (const type of [
                    MSPCodes.BUILD_KEY,
                    MSPCodes.CRAFT_NAME,
                    MSPCodes.PILOT_NAME,
                    MSPCodes.PID_PROFILE_NAME,
                    MSPCodes.RATE_PROFILE_NAME,
                ]) {
                    await request(MSPCodes.MSP2_GET_TEXT, [type]);
                }
            } else {
                await request(MSPCodes.MSP_NAME);
            }
            if (semver.gte(this.fc.CONFIG.apiVersion, "1.48.0")) {
                await request(MSPCodes.MSP2_GET_TEXT, [MSPCodes.BATTERY_PROFILE_NAME]);
            }
            for (let index = 1; index <= Math.min(this.fc.VTX_CONFIG.vtx_table_bands || 0, 255); index++) {
                await request(MSPCodes.MSP_VTXTABLE_BAND, [index]);
            }
            for (let index = 1; index <= Math.min(this.fc.VTX_CONFIG.vtx_table_powerlevels || 0, 255); index++) {
                await request(MSPCodes.MSP_VTXTABLE_POWERLEVEL, [index]);
            }
            await request(MSPCodes.MSP_STATUS_EX);
            if (profile.pid !== this.fc.CONFIG.profile || profile.rate !== this.fc.CONFIG.rateProfile) {
                throw new Error("采集期间 Profile 已变化，请重新进入 CLI 采集。");
            }
            controller.signal.throwIfAborted();
            const snapshot = {
                schemaVersion: 2,
                metadata: {
                    createdAt: startedAt,
                    firmwareVersion: this.fc.CONFIG.flightControllerVersion,
                    apiVersion: this.fc.CONFIG.apiVersion,
                    target: this.fc.CONFIG.targetName,
                    boardName: this.fc.CONFIG.boardName,
                    configuratorVersion: this.config.version,
                },
                mspResponses: [...responses.values()],
                captureReport: {
                    complete: [...requests.values()].every(
                        (entry) => entry.status === "success" || (!entry.required && entry.status === "unsupported"),
                    ),
                    startedAt,
                    completedAt: new Date().toISOString(),
                    profile,
                    requests: [...requests.values()],
                    responseCount: responses.size,
                    plannedResponseCount: requests.size,
                },
            };
            validateSnapshotV2(snapshot);
            this.frozen = deepFreeze(snapshot);
            this.state.ready = true;
            return this.frozen;
        } catch (error) {
            if (this.controller === controller) this.state.error = error.message || "采集已取消，请重新进入 CLI 重试。";
            throw error;
        } finally {
            clearTimeout(overallTimeout);
            if (this.controller === controller) {
                this.controller = null;
                this.state.active = false;
                this.config.supportSnapshotCaptureInProgress = false;
                this.msp.snapshotCaptureActive = false;
            }
        }
    }

    createPayload(cliTranscript) {
        if (!this.frozen || !this.state.ready) throw new Error("没有完整快照，请重新进入 CLI 采集后再提交。");
        return { ...this.frozen, cliTranscript };
    }
}

export const supportSnapshotRecorder = new SupportSnapshotRecorder();
