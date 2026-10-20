import { describe, expect, it } from "vitest";
import source from "../../src/js/serial.js?raw";

function moduleLoader() {
    let constructed = 0;
    class Transport extends EventTarget {
        connected = false;
        connectionId = null;
        constructor() {
            super();
            constructed += 1;
        }
    }
    const dependencies = {
        WebSerial: Transport,
        WebBluetooth: Transport,
        Websocket: Transport,
        VirtualSerial: Transport,
        CapacitorSerial: Transport,
        CapacitorBle: Transport,
        CapacitorTcp: Transport,
        TauriSerial: Transport,
        TauriTcp: Transport,
        TauriBle: Transport,
        isAndroid: () => false,
        isTauri: () => false,
        isTauriIOS: () => false,
        unbracketHost: (value: string) => value,
    };
    // Reevaluate the real module body with Vite's persistent hot.data and stub transports.
    const evaluate = new Function(
        ...Object.keys(dependencies),
        "hot",
        source
            .replace(/^import .*;$/gm, "")
            .replaceAll("import.meta.hot", "hot")
            .replace("export const serial", "const serial") + "\nreturn {serial, Serial};",
    );
    return {
        load: (hot?: { data?: Record<string, unknown> }) => evaluate(...Object.values(dependencies), hot),
        constructions: () => constructed,
    };
}

describe("serial transport across Vite module replacement", () => {
    it("keeps the connected instance and does not register another set of transports", () => {
        const loader = moduleLoader();
        const hot = { data: {} };
        const first = loader.load(hot);
        const active = first.serial._protocols[0].instance;
        active.connected = true;
        active.connectionId = "serial_1";
        first.serial._protocol = active;
        const count = loader.constructions();

        const next = loader.load(hot);

        expect(next.serial).toBe(first.serial);
        expect(next.serial._protocol).toBe(active);
        expect(next.serial.connected).toBe(true);
        expect(next.serial.connectionId).toBe("serial_1");
        expect(loader.constructions()).toBe(count);
        expect(Object.getPrototypeOf(next.serial)).toBe(next.Serial.prototype);
    });

    it("delivers incoming bytes to subscribers installed before replacement exactly once", () => {
        const loader = moduleLoader();
        const hot = { data: {} };
        const { serial } = loader.load(hot);
        serial._protocol = serial._protocols[0].instance;
        const received: unknown[] = [];
        serial.addEventListener("receive", (event: Event) => received.push((event as CustomEvent).detail.data));

        const next = loader.load(hot);
        next.serial._protocol?.dispatchEvent(new CustomEvent("receive", { detail: new Uint8Array([0x2e, 0x39]) }));

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual(new Uint8Array([0x2e, 0x39]));
    });

    it("does not share a connection between different pages or production module contexts", () => {
        const loader = moduleLoader();
        expect(loader.load({ data: {} }).serial).not.toBe(loader.load({ data: {} }).serial);
        expect(loader.load().serial).not.toBe(loader.load().serial);
        expect(loader.load({}).serial).not.toBe(loader.load({}).serial);
    });
});
