import { describe, expect, it } from "vitest";
import {
    FOUR_WAY_COMMANDS as COMMANDS,
    FourWaySession,
    createFourWayResponse,
} from "../../src/js/esc_melody/four_way.js";

class SerialInterface extends EventTarget {
    frames: Uint8Array[] = [];

    send(frame: Uint8Array, callback: (result: { bytesSent: number }) => void) {
        this.frames.push(frame);
        const result = { bytesSent: frame.length };
        callback(result);
        return result;
    }

    receive(frame: Uint8Array) {
        this.dispatchEvent(Object.assign(new Event("receive"), { detail: { data: frame } }));
    }
}

async function initialize(serial: SerialInterface, session: FourWaySession, mode: number) {
    const pending = session.send(COMMANDS.deviceInitFlash, [0]);
    await Promise.resolve();
    serial.receive(createFourWayResponse(COMMANDS.deviceInitFlash, [0xb5, 0xe8, 100, mode], 0, 0));
    await pending;
}

describe("Betaflight page-erase replies", () => {
    it.each([
        { mode: 1, page: 24, address: 0x3000 },
        { mode: 1, page: 13, address: 0x1a00 },
        { mode: 4, page: 31, address: 0x7c00 },
    ])("accepts the mapped page address for mode $mode, page $page", async ({ mode, page, address }) => {
        const serial = new SerialInterface();
        const session = new FourWaySession({ serial, timeout: 100 });
        try {
            await initialize(serial, session, mode);
            const pending = session.send(COMMANDS.devicePageErase, [page], 0);
            await Promise.resolve();
            expect(Array.from(serial.frames.at(-1)!.slice(2, 6))).toEqual([0, 0, 1, page]);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [page], 0, address));
            await expect(pending).resolves.toMatchObject({ address, ack: 0 });
        } finally {
            await session.stop();
        }
    });

    it("accepts the CRC-valid BB51 response bytes returned by Betaflight", async () => {
        const serial = new SerialInterface();
        const session = new FourWaySession({ serial, timeout: 100 });
        try {
            await initialize(serial, session, 1);
            const pending = session.send(COMMANDS.devicePageErase, [24], 0);
            serial.receive(Uint8Array.from([0x2e, 0x39, 0x30, 0, 1, 0x18, 0, 0x8a, 0x14]));
            await expect(pending).resolves.toMatchObject({ address: 0x3000, ack: 0 });
        } finally {
            await session.stop();
        }
    });

    it("reports an erase failure ACK at the mapped address instead of timing out", async () => {
        const serial = new SerialInterface();
        const session = new FourWaySession({ serial, timeout: 100 });
        try {
            await initialize(serial, session, 1);
            const pending = session.send(COMMANDS.devicePageErase, [24], 0);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0x0f, 0x3000));
            await expect(pending).rejects.toMatchObject({ name: "FourWayAckError", command: 0x39, ack: 0x0f });
        } finally {
            await session.stop();
        }
    });

    it("rejects replies for a different page or the wrong interface mapping", async () => {
        const serial = new SerialInterface();
        const session = new FourWaySession({ serial, timeout: 100 });
        try {
            await initialize(serial, session, 1);
            const pending = session.send(COMMANDS.devicePageErase, [24], 0);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [25], 0, 0x3200));
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0, 0x6000));
            expect(session.pending).toHaveLength(1);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0, 0x3000));
            await expect(pending).resolves.toMatchObject({ address: 0x3000 });
        } finally {
            await session.stop();
        }
    });

    it.each([COMMANDS.deviceRead, COMMANDS.deviceWrite])(
        "keeps strict address matching for command %i",
        async (command) => {
            const serial = new SerialInterface();
            const session = new FourWaySession({ serial, timeout: 100 });
            try {
                await initialize(serial, session, 1);
                const pending = session.send(command, [1], 0x3000);
                serial.receive(createFourWayResponse(command, [0], 0, 0x3060));
                expect(session.pending).toHaveLength(1);
                serial.receive(createFourWayResponse(command, [0], 0, 0x3000));
                await expect(pending).resolves.toMatchObject({ address: 0x3000 });
            } finally {
                await session.stop();
            }
        },
    );

    it("uses the latest successfully initialized interface", async () => {
        const serial = new SerialInterface();
        const session = new FourWaySession({ serial, timeout: 100 });
        try {
            await initialize(serial, session, 4);
            await initialize(serial, session, 1);
            const pending = session.send(COMMANDS.devicePageErase, [24], 0);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0, 0x6000));
            expect(session.pending).toHaveLength(1);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0, 0x3000));
            await expect(pending).resolves.toMatchObject({ address: 0x3000 });
        } finally {
            await session.stop();
        }
    });

    it("tracks an acknowledged interface-mode change", async () => {
        const serial = new SerialInterface();
        const session = new FourWaySession({ serial, timeout: 100 });
        try {
            await initialize(serial, session, 1);
            const setMode = session.send(COMMANDS.interfaceSetMode, [4]);
            serial.receive(createFourWayResponse(COMMANDS.interfaceSetMode, [0], 0));
            await setMode;
            const pending = session.send(COMMANDS.devicePageErase, [24], 0);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0, 0x3000));
            expect(session.pending).toHaveLength(1);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0, 0x6000));
            await expect(pending).resolves.toMatchObject({ address: 0x6000 });
        } finally {
            await session.stop();
        }
    });

    it("does not guess a page mapping before successful initialization", async () => {
        const serial = new SerialInterface();
        const session = new FourWaySession({ serial, timeout: 100 });
        try {
            await initialize(serial, session, 1);
            const init = session.send(COMMANDS.deviceInitFlash, [1]);
            serial.receive(createFourWayResponse(COMMANDS.deviceInitFlash, [0], 0x0f));
            await expect(init).rejects.toMatchObject({ ack: 0x0f });
            const pending = session.send(COMMANDS.devicePageErase, [24], 0);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0, 0x3000));
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [24], 0, 0x6000));
            expect(session.pending).toHaveLength(1);
            serial.receive(createFourWayResponse(COMMANDS.devicePageErase, [0], 2, 0));
            await expect(pending).rejects.toMatchObject({ ack: 2 });
        } finally {
            await session.stop();
        }
    });
});
