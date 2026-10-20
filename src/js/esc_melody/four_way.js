/** Minimal, serial-safe implementation of the public BLHeli 4-way frame. */

export const FOUR_WAY_PC = 0x2f;
export const FOUR_WAY_IF = 0x2e;

export const FOUR_WAY_COMMANDS = Object.freeze({
    interfaceTestAlive: 0x30,
    protocolGetVersion: 0x31,
    interfaceGetName: 0x32,
    interfaceGetVersion: 0x33,
    interfaceExit: 0x34,
    deviceReset: 0x35,
    deviceInitFlash: 0x37,
    deviceEraseAll: 0x38,
    devicePageErase: 0x39,
    deviceRead: 0x3a,
    deviceWrite: 0x3b,
    deviceC2ckLow: 0x3c,
    deviceReadEeprom: 0x3d,
    deviceWriteEeprom: 0x3e,
    interfaceSetMode: 0x3f,
});

export const FOUR_WAY_ACK = Object.freeze({
    ok: 0x00,
    invalidCommand: 0x02,
    invalidCrc: 0x03,
    verifyError: 0x04,
    invalidChannel: 0x08,
    invalidParam: 0x09,
    generalError: 0x0f,
});

export function crc16Xmodem(bytes, initial = 0) {
    let crc = initial & 0xffff;
    for (const byte of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])) {
        crc ^= (byte & 0xff) << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc;
}

export function createFourWayMessage(command, params = [], address = 0) {
    const requestedData = Array.from(params || [], (byte) => Number(byte) & 0xff);
    const data = requestedData.length ? requestedData : [0];
    if (data.length > 256) throw new RangeError("4-way payload cannot exceed 256 bytes");
    const encodedLength = data.length === 256 ? 0 : data.length;
    const frame = new Uint8Array(7 + data.length);
    frame[0] = FOUR_WAY_PC;
    frame[1] = command & 0xff;
    frame[2] = (address >> 8) & 0xff;
    frame[3] = address & 0xff;
    frame[4] = encodedLength;
    frame.set(data, 5);
    const checksum = crc16Xmodem(frame.slice(0, 5 + data.length));
    frame[5 + data.length] = (checksum >> 8) & 0xff;
    frame[6 + data.length] = checksum & 0xff;
    return frame;
}

export function createFourWayResponse(command, params = [0], ack = 0, address = 0) {
    const data = Array.from(params || [], (byte) => Number(byte) & 0xff);
    if (data.length > 256) throw new RangeError("4-way payload cannot exceed 256 bytes");
    const encodedLength = data.length === 256 ? 0 : data.length;
    const frame = new Uint8Array(8 + data.length);
    frame[0] = FOUR_WAY_IF;
    frame[1] = command & 0xff;
    frame[2] = (address >> 8) & 0xff;
    frame[3] = address & 0xff;
    frame[4] = encodedLength;
    frame.set(data, 5);
    frame[5 + data.length] = ack & 0xff;
    const checksumOffset = 6 + data.length;
    const checksum = crc16Xmodem(frame.slice(0, checksumOffset));
    frame[checksumOffset] = (checksum >> 8) & 0xff;
    frame[checksumOffset + 1] = checksum & 0xff;
    return frame;
}

/**
 * Parse one or more interface replies. Incomplete bytes are returned as
 * `backlog` so callers can append the next serial chunk without losing data.
 */
export function parseFourWayMessages(input, previousBacklog = new Uint8Array()) {
    const incoming = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    const backlog = previousBacklog instanceof Uint8Array ? previousBacklog : new Uint8Array(previousBacklog || []);
    const view = new Uint8Array(backlog.length + incoming.length);
    view.set(backlog);
    view.set(incoming, backlog.length);
    const messages = [];
    let offset = 0;

    while (offset < view.length) {
        if (view[offset] !== FOUR_WAY_IF) {
            offset += 1;
            continue;
        }
        if (view.length - offset < 8) break;

        const encodedLength = view[offset + 4];
        const payloadLength = encodedLength === 0 ? 256 : encodedLength;
        const frameLength = 8 + payloadLength;
        if (view.length - offset < frameLength) break;

        const frame = view.slice(offset, offset + frameLength);
        const checksumOffset = 6 + payloadLength;
        const expected = (frame[checksumOffset] << 8) | frame[checksumOffset + 1];
        const actual = crc16Xmodem(frame.slice(0, checksumOffset));
        if (actual !== expected) {
            // Keep scanning after a corrupt byte. This also prevents a broken
            // ESC from blocking the next channel's response indefinitely.
            offset += 1;
            continue;
        }

        messages.push({
            command: frame[1],
            address: (frame[2] << 8) | frame[3],
            ack: frame[5 + payloadLength],
            params: frame.slice(5, 5 + payloadLength),
            checksum: expected,
        });
        offset += frameLength;
    }

    return { messages, backlog: view.slice(offset) };
}

export class FourWaySession {
    constructor({ serial, timeout = 3500 } = {}) {
        if (!serial?.send) throw new TypeError("FourWaySession requires a serial adapter");
        this.serial = serial;
        this.timeout = timeout;
        this.backlog = new Uint8Array();
        this.pending = [];
        this.started = false;
        this.generation = 0;
        this.interfaceMode = null;
        // Serial adapters expose a single writable stream: a retried frame must
        // wait for the previous write to settle, otherwise the second write hits
        // a locked stream and reports a partial send.
        this.writeQueue = Promise.resolve();
        this.onReceive = this.onReceive.bind(this);
        this.onDisconnect = this.onDisconnect.bind(this);
    }

    start() {
        if (this.started) return;
        this.serial.addEventListener?.("receive", this.onReceive);
        this.serial.addEventListener?.("disconnect", this.onDisconnect);
        this.started = true;
    }

    /**
     * @param {number} command
     * @param {number[] | Uint8Array} params
     * @param {number} address
     * @param {number} timeout
     */
    async send(command, params = [], address = 0, timeout = this.timeout) {
        this.start();
        const generation = this.generation;
        const frame = createFourWayMessage(command, params, address);
        if (
            command === FOUR_WAY_COMMANDS.deviceInitFlash ||
            command === FOUR_WAY_COMMANDS.deviceReset ||
            command === FOUR_WAY_COMMANDS.interfaceExit
        ) {
            this.interfaceMode = null;
        }
        let responseAddress = address;
        if (command === FOUR_WAY_COMMANDS.devicePageErase) {
            // Betaflight replies with the page's byte address instead of echoing the request address.
            if (this.interfaceMode === 1) responseAddress = (frame[5] << 9) & 0xffff;
            else if (this.interfaceMode === 4) responseAddress = (frame[5] << 10) & 0xffff;
        }
        const pending = {
            command,
            address,
            responseAddress,
            requestedMode: frame[5],
            resolve: null,
            reject: null,
            timer: null,
        };
        const sendPromise = new Promise((resolve, reject) => {
            pending.resolve = resolve;
            pending.reject = reject;
        });
        this.pending.push(pending);
        const isActive = () => this.started && this.generation === generation && this.pending.includes(pending);

        const clearPending = () => {
            clearTimeout(pending.timer);
            this.pending = this.pending.filter((item) => item !== pending);
        };
        const armAckWindow = () => {
            if (!this.pending.includes(pending)) return;
            clearTimeout(pending.timer);
            pending.timer = setTimeout(() => {
                clearPending();
                pending.reject(new Error(`4-way command 0x${command.toString(16)} timed out`));
            }, timeout);
        };
        // Covers a write that never completes; re-armed once the frame is on the wire.
        armAckWindow();

        let writeHandled = false;
        const handleWriteResult = (result) => {
            if (writeHandled || !isActive()) return;
            writeHandled = true;
            if (!result || result.bytesSent !== frame.byteLength) {
                clearPending();
                pending.reject(new Error("Serial adapter could not send the 4-way frame (port closed or busy)"));
                return;
            }
            armAckWindow();
        };
        const handleWriteError = (error) => {
            if (writeHandled || !isActive()) return;
            writeHandled = true;
            clearPending();
            pending.reject(error);
        };

        const run = this.writeQueue.then(() => {
            if (!isActive()) return;
            return this.serial.send(frame, handleWriteResult);
        });
        this.writeQueue = run.then(
            () => {},
            () => {},
        );
        run.then(handleWriteResult, handleWriteError);
        return sendPromise;
    }

    async stop({ exit = false } = {}) {
        const shouldExit = exit && this.started;
        this.abort(new Error("4-way session stopped"));
        if (shouldExit) {
            try {
                await this.send(FOUR_WAY_COMMANDS.interfaceExit, [0]);
            } catch {
                // A disconnected ESC has already left passthrough; cleanup is
                // still required so MSP can reclaim the serial listener.
            }
        }
        this.abort(new Error("4-way session stopped"));
    }

    onReceive(event) {
        const data = event?.detail?.data ?? event?.detail ?? event;
        const result = parseFourWayMessages(data, this.backlog);
        this.backlog = result.backlog;
        for (const message of result.messages) {
            const pending = this.pending.find(
                (item) =>
                    item.command === message.command &&
                    (item.address === undefined ||
                        item.address === message.address ||
                        item.responseAddress === message.address),
            );
            if (!pending) continue;
            clearTimeout(pending.timer);
            this.pending = this.pending.filter((item) => item !== pending);
            if (
                message.ack === FOUR_WAY_ACK.ok ||
                (message.command === FOUR_WAY_COMMANDS.interfaceTestAlive && message.ack === FOUR_WAY_ACK.generalError)
            ) {
                if (message.command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                    this.interfaceMode = message.params[3] ?? null;
                } else if (message.command === FOUR_WAY_COMMANDS.interfaceSetMode) {
                    this.interfaceMode = pending.requestedMode;
                }
                pending.resolve(message);
            } else {
                const error = new Error(
                    `4-way command 0x${message.command.toString(16)} failed with ACK 0x${message.ack.toString(16)}`,
                );
                error.name = "FourWayAckError";
                error.command = message.command;
                error.ack = message.ack;
                pending.reject(error);
            }
        }
    }

    onDisconnect() {
        this.abort(new Error("Serial connection was lost during the 4-way operation"));
    }

    abort(error) {
        this.generation += 1;
        for (const pending of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending = [];
        this.serial.removeEventListener?.("receive", this.onReceive);
        this.serial.removeEventListener?.("disconnect", this.onDisconnect);
        this.started = false;
        this.interfaceMode = null;
        this.backlog = new Uint8Array();
        // Keep an in-flight native write serialized; queued closures must pass
        // their generation and pending checks before they can send a frame.
    }
}
