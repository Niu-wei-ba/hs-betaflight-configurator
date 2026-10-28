import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeBlheli32Melody, encodeBlheli32Melody } from "../../src/js/esc_melody/blheli32_melody";
import { melodyFingerprint } from "../../src/js/esc_melody/melody.js";

const mocks = vi.hoisted(() => ({ scan: vi.fn(), write: vi.fn(), recover: vi.fn() }));
vi.mock("../../src/js/gui.js", async () => {
    const { reactive } = await import("vue");
    return { default: reactive({ active_tab: null, connect_lock: false, content_ready() {} }) };
});
vi.mock("../../src/js/esc_melody/esc_four_way_controller.js", () => ({
    EscFourWayController: class {
        scan() {
            return mocks.scan();
        }
        writeMelody(...args) {
            return mocks.write(...args);
        }
        recoverEscs(...args) {
            return mocks.recover(...args);
        }
        exit() {
            return Promise.resolve();
        }
    },
}));

function esc(
    channel = 0,
    currentMelody = {
        name: "Current",
        bpm: 120,
        waitMs: 0,
        notes: [{ id: `note-${channel}`, midi: 60, start: 0, duration: 1, rest: false }],
    },
) {
    return {
        id: `esc-${channel}`,
        channel,
        firmwareFamily: "blheli32",
        firmwareLabel: "BLHeli_32",
        model: "FPV32",
        version: "32.10",
        status: "ready",
        capacity: 48,
        canRead: true,
        canWrite: true,
        canBackup: true,
        melodyReadStatus: "loaded",
        currentMelody,
    };
}

async function mount() {
    const { default: Tab } = await import("../../src/components/tabs/EscMelodyTab.vue");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Tab);
    const vm = app.mount(container) as any;
    await nextTick();
    return { app, vm, container };
}

async function approve(vm, container) {
    vm.openSafety();
    await nextTick();
    for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
    vm.assignmentAccepted = true;
}

function nativeMelody(channel = 0) {
    const bytes = new Uint8Array(48).fill(255);
    bytes.set([channel, channel + 2]);
    return decodeBlheli32Melody(bytes, { mode: 0x71, name: `Native ${channel}` })!;
}

beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.stubGlobal("CONFIGURATOR", { connectionValid: true });
    mocks.scan.mockReset();
    mocks.write.mockReset();
    mocks.recover.mockReset();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("ESC music safety and native-data regressions", () => {
    it("retains imported Music Off after a verified write and enables a newly selected melody", async () => {
        const channel = esc();
        mocks.scan.mockResolvedValue([channel]);
        const { app, vm, container } = await mount();
        try {
            await vm.scanEscs();
            vm.loadDraft(
                { id: "off-draft", name: "Off draft", melody: { ...channel.currentMelody, musicOff: true } },
                { preserveEdits: false },
            );
            await nextTick();
            expect(vm.melody.musicOff).toBe(true);
            expect(vm.writeValidation.valid).toBe(true);
            expect(vm.pendingWriteEscs).toHaveLength(1);
            expect(vm.safetyWriteMelodySummary).toBe("Music Off");
            await approve(vm, container);
            mocks.write.mockImplementation(async (targets, getMelody) => {
                expect(encodeBlheli32Melody(getMelody(targets[0])).mode).toBe(255);
                targets[0].currentMelody = null;
                targets[0].currentMelodyMode = 255;
                return { ok: true, written: targets, rollback: [] };
            });
            await vm.performWrite();
            expect(mocks.write).toHaveBeenCalledOnce();
            expect(vm.escs[0].currentMelody).toBeNull();
            expect(vm.escs[0].melodyReadStatus).toBe("empty");
            expect(vm.dirtyEscs).toHaveLength(0);
            expect(vm.melody.musicOff).toBe(true);
            vm.closeSafety();
            await nextTick();
            vm.loadPreset(
                {
                    id: "enabled-song",
                    name: "Enabled song",
                    bpm: 120,
                    notes: [{ midi: 60, start: 0, duration: 1, rest: false }],
                },
                { preserveEdits: false },
            );
            await nextTick();
            expect(vm.melody.musicOff).not.toBe(true);
            expect(vm.writeValidation.valid).toBe(true);
            expect(encodeBlheli32Melody(vm.melody).mode).not.toBe(255);
        } finally {
            app.unmount();
        }
    });
    it("loads mode FF as Music Off and an empty non-FF array as an empty editor", async () => {
        mocks.scan.mockResolvedValue([
            { ...esc(0), currentMelody: null, melodyReadStatus: "empty", currentMelodyMode: 255 },
            { ...esc(1), currentMelody: null, melodyReadStatus: "empty", currentMelodyMode: 128 },
        ]);
        const { app, vm } = await mount();
        try {
            await vm.scanEscs();
            expect(vm.escs[0].editorMelody.musicOff).toBe(true);
            expect(vm.escs[1].editorMelody.musicOff).not.toBe(true);
            expect(vm.syncAll).toBe(false);
            expect(vm.melodyReadLabel(vm.escs[0])).toBe("Music Off");
        } finally {
            app.unmount();
        }
    });
    it("warns before leaving during a pending write, then permits leaving after completion", async () => {
        mocks.scan.mockResolvedValue([esc()]);
        const { app, vm, container } = await mount();
        let finish;
        try {
            await vm.scanEscs();
            vm.loadPreset(vm.presets.find((item) => item.name === "Bluejay Default"));
            await approve(vm, container);
            mocks.write.mockImplementation(
                (targets) =>
                    new Promise((resolve) => {
                        finish = () => resolve({ ok: true, written: targets });
                    }),
            );
            const work = vm.performWrite();
            expect(mocks.write).toHaveBeenCalledOnce();
            const during = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(during);
            expect(during.defaultPrevented).toBe(true);
            finish();
            await work;
            const after = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(after);
            expect(after.defaultPrevented).toBe(false);
        } finally {
            finish?.();
            app.unmount();
        }
    });

    it("continues warning after a failed write until affected channels are recovered", async () => {
        mocks.scan.mockResolvedValue([esc()]);
        const { app, vm, container } = await mount();
        try {
            await vm.scanEscs();
            vm.loadPreset(vm.presets.find((item) => item.name === "Bluejay Default"));
            await approve(vm, container);
            mocks.write.mockImplementation(async (targets) => ({
                ok: false,
                written: [],
                rollback: targets,
                failed: targets[0],
                error: Error("write failed"),
            }));
            await vm.performWrite();
            const failed = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(failed);
            expect(failed.defaultPrevented).toBe(true);
            mocks.recover.mockImplementation(async (targets) => targets);
            await vm.recoverWritten();
            const recovered = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(recovered);
            expect(recovered.defaultPrevented).toBe(false);
        } finally {
            app.unmount();
        }
    });

    it("keeps all written BL32 voices stable when switching away from the active voice", async () => {
        mocks.scan.mockResolvedValue(Array.from({ length: 4 }, (_, channel) => esc(channel)));
        const { app, vm, container } = await mount();
        try {
            await vm.scanEscs();
            vm.loadPreset(vm.presets.find((item) => item.name === "AC/DC - Back in Black"));
            vm.selectPresetTrack(2);
            await nextTick();
            const expected = vm.automaticBl32.tracks.map(melodyFingerprint);
            mocks.write.mockImplementation(async (targets, provider) => {
                for (const target of targets) {
                    const encoded = encodeBlheli32Melody(provider(target));
                    target.currentMelody = encoded.playbackMelody;
                }
                return { ok: true, written: targets };
            });
            await approve(vm, container);
            await vm.performWrite();
            expect(mocks.write).toHaveBeenCalledOnce();
            expect(melodyFingerprint(vm.melody)).toBe(expected[2]);
            for (const voice of [1, 0, 3, 2]) {
                vm.selectPresetTrack(voice);
                await nextTick();
                expect(vm.automaticBl32.tracks.map(melodyFingerprint)).toEqual(expected);
                expect(vm.pendingWriteEscs).toHaveLength(0);
                expect(vm.escs.every((item) => !item.melodyDirty)).toBe(true);
            }
        } finally {
            app.unmount();
        }
    });

    it("writes every affected voice when automatic adaptation changes their shared output", async () => {
        mocks.scan.mockResolvedValue(Array.from({ length: 4 }, (_, channel) => esc(channel)));
        const { app, vm } = await mount();
        try {
            await vm.scanEscs();
            const preset = vm.presets.find((item) => item.name === "AC/DC - Back in Black");
            vm.loadPreset(preset);
            await nextTick();
            const originalOutput = vm.automaticBl32.tracks.map(melodyFingerprint);
            vm.escs.forEach((item, voice) => {
                item.originalMelody = JSON.parse(JSON.stringify(vm.automaticBl32.tracks[voice]));
                item.melodyDirty = false;
            });
            expect(vm.pendingWriteEscs).toHaveLength(0);
            vm.melody.bpm *= 1.25;
            await nextTick();
            const changed = vm.automaticBl32.tracks.map(melodyFingerprint);
            const affected = changed.flatMap((value, index) =>
                value !== originalOutput[index] ? [`esc-${index}`] : [],
            );
            expect(affected.length).toBeGreaterThan(0);
            expect(vm.pendingWriteEscs.map((item) => item.id)).toEqual(affected);
        } finally {
            app.unmount();
        }
    });

    it.each(["single", "independent", "poly"])(
        "preserves untouched native data in the %s code editor",
        async (mode) => {
            mocks.scan.mockResolvedValue(
                mode === "independent" ? [esc(0, nativeMelody()), esc(1, nativeMelody(2))] : [esc(0, nativeMelody())],
            );
            const { app, vm } = await mount();
            try {
                await vm.scanEscs();
                if (mode === "poly")
                    vm.loadPreset({
                        id: "native-poly",
                        name: "Native poly",
                        trackMelodies: [nativeMelody(), nativeMelody(2)],
                    });
                await nextTick();
                const before = JSON.parse(JSON.stringify(vm.melody));
                const channels = vm.escs.map((item) => JSON.parse(JSON.stringify(item.editorMelody)));
                vm.openCodeDialog();
                await nextTick();
                vm.saveCodeDialog();
                await nextTick();
                expect(vm.melody).toEqual(before);
                expect(vm.escs.map((item) => item.editorMelody)).toEqual(channels);
            } finally {
                app.unmount();
            }
        },
    );
});
