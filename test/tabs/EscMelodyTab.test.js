import { createApp, nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEscBackupPackage } from "../../src/js/esc_melody/backups.js";

const controllerProgress = vi.hoisted(() => ({ send: null }));
const contentReady = vi.fn();
const scanEscs = vi.hoisted(() => vi.fn());
const backupEscs = vi.hoisted(() => vi.fn());
const writeMelody = vi.hoisted(() => vi.fn());
const restoreBackup = vi.hoisted(() => vi.fn());
const recoverEscs = vi.hoisted(() => vi.fn());
const clipboard = vi.hoisted(() => ({ readText: vi.fn(), writeText: vi.fn() }));

vi.mock("../../src/js/gui.js", async () => {
    const { reactive } = await import("vue");
    return { default: reactive({ active_tab: null, connect_lock: false, content_ready: contentReady }) };
});

vi.mock("../../src/js/esc_melody/esc_four_way_controller.js", () => ({
    EscFourWayController: class {
        constructor({ onProgress }) {
            controllerProgress.send = onProgress;
        }
        scan() {
            return scanEscs();
        }

        backupEscs(escs) {
            return backupEscs(escs);
        }

        writeMelody(escs, melody) {
            return writeMelody(escs, melody);
        }

        restoreBackup(targets) {
            return restoreBackup(targets);
        }

        recoverEscs(escs) {
            return recoverEscs(escs);
        }

        exit() {
            return Promise.resolve();
        }
    },
}));

vi.mock("../../src/js/Clipboard.js", () => ({
    default: clipboard,
}));

describe("EscMelodyTab", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        globalThis.CONFIGURATOR = { connectionValid: false };
        contentReady.mockClear();
        scanEscs.mockReset();
        backupEscs.mockReset();
        writeMelody.mockReset();
        restoreBackup.mockReset();
        recoverEscs.mockReset();
        clipboard.readText.mockReset();
        clipboard.writeText.mockReset();
        localStorage.clear();
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:esc-backup");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        delete globalThis.AudioContext;
        delete globalThis.CONFIGURATOR;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function mountTab(model) {
        const { default: EscMelodyTab } = await import("../../src/components/tabs/EscMelodyTab.vue");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const app = createApp(EscMelodyTab);
        if (model) app.provide("betaflightModel", model);
        const vm = app.mount(container);
        await nextTick();
        return { app, container, vm };
    }

    it("automatically uses a complete BL32 arrangement for preview and writing without changing the preset or creating drafts", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60, 60, 60, 60]).map((esc) => ({
                ...esc,
                firmwareFamily: "blheli32",
                firmwareLabel: "BLHeli_32",
                capacity: 48,
            })),
        );
        const { app, vm, container } = await mountTab();
        try {
            await vm.scanEscs();
            const preset = vm.presets.find((item) => item.name === "AC/DC - Back in Black");
            const original = JSON.stringify(preset);
            vm.loadPreset(preset);
            await nextTick();
            expect(container.querySelector('[aria-label="生成 BL32 适配版"]')).toBeNull();
            expect(vm.automaticBl32.adapted).toBe(true);
            expect(vm.automaticBl32.result.cropped).toBe(false);
            expect(vm.automaticBl32.result.sourceNoteCount).toBe(vm.automaticBl32.result.keptNoteCount);
            expect(vm.automaticBl32.tracks).toHaveLength(4);
            expect(vm.automaticBl32.tracks.every((track) => track.blheli32?.bytes.length === 48)).toBe(true);
            expect(vm.validation.valid).toBe(true);
            expect(vm.writeValidation.valid).toBe(true);
            expect(container.querySelector(".melody-selection-preview").textContent).toContain("编码通过");
            expect(container.textContent).toContain("已自动适配 BL32");
            expect(vm.melody).toEqual(expect.objectContaining({ bpm: preset.trackMelodies[0].bpm }));
            expect(vm.drafts).toHaveLength(0);
            expect(JSON.stringify(preset)).toBe(original);
            const expected = structuredClone(JSON.parse(JSON.stringify(vm.automaticBl32.tracks)));
            writeMelody.mockImplementation(async (targets, provider) => {
                targets.forEach((esc, index) => {
                    expect(provider(esc)).toEqual(expected[index]);
                    esc.currentMelody = provider(esc);
                });
                return { ok: true, written: targets };
            });
            vm.openSafety();
            await nextTick();
            for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
            vm.assignmentAccepted = true;
            await nextTick();
            await vm.performWrite();
            expect(writeMelody).toHaveBeenCalledOnce();
            expect(JSON.stringify(preset)).toBe(original);
        } finally {
            app.unmount();
        }
    });

    it("never crops an unadaptable BL32 melody and blocks writing while preserving all notes", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60]).map((esc) => ({
                ...esc,
                firmwareFamily: "blheli32",
                firmwareLabel: "BLHeli_32",
                capacity: 48,
            })),
        );
        const { app, vm, container } = await mountTab();
        try {
            await vm.scanEscs();
            const original = {
                id: "long-adaptation",
                name: "Long adaptation",
                bpm: 120,
                waitMs: 0,
                notes: Array.from({ length: 60 }, (_, i) => ({ midi: 60, start: i * 0.5, duration: 0.5 })),
            };
            const before = JSON.stringify(original);
            vm.loadPreset(original);
            await nextTick();
            expect(vm.automaticBl32.adapted).toBe(false);
            expect(vm.automaticBl32.errors.join("")).toContain("无法完整适配");
            expect(vm.melody.notes).toHaveLength(60);
            expect(vm.effectiveMelody.notes).toHaveLength(60);
            expect(vm.writeValidation.valid).toBe(false);
            expect(findButton(container, "安全写入").disabled).toBe(true);
            await vm.performWrite();
            expect(writeMelody).not.toHaveBeenCalled();
            expect(vm.drafts).toHaveLength(0);
            expect(JSON.stringify(original)).toBe(before);
        } finally {
            app.unmount();
        }
    });

    it("reevaluates automatic BL32 adaptation after edits without overwriting or filling local drafts", async () => {
        const { saveMelodyDraft } = await import("../../src/js/esc_melody/drafts.js");
        const source = { ...createCurrentMelody(0, 59), name: "Source draft" };
        const draft = saveMelodyDraft({ name: source.name, melody: source });
        const before = localStorage.getItem("betaflight.esc-melody.drafts.v1");
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60]).map((esc) => ({
                ...esc,
                firmwareFamily: "blheli32",
                firmwareLabel: "BLHeli_32",
                capacity: 48,
            })),
        );
        const { app, vm } = await mountTab();
        try {
            await vm.scanEscs();
            vm.loadDraft(draft);
            await nextTick();
            expect(vm.automaticBl32.adapted).toBe(true);
            expect(vm.effectiveMelody.notes.find((note) => !note.rest).midi).toBe(71);
            expect(vm.melody.notes[0].midi).toBe(59);
            expect(localStorage.getItem("betaflight.esc-melody.drafts.v1")).toBe(before);
            vm.melody.notes = Array.from({ length: 49 }, (_, i) => ({
                id: `edit-${i}`,
                midi: 59,
                start: i,
                duration: 1,
            }));
            await nextTick();
            expect(vm.automaticBl32.adapted).toBe(false);
            expect(vm.writeValidation.valid).toBe(false);
            expect(vm.drafts).toHaveLength(1);
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("auditions the automatic BL32 output shown by the overview and restores the original after changing firmware", async () => {
        const frequencies = [];
        globalThis.AudioContext = class {
            currentTime = 0;
            destination = {};
            createGain() {
                return {
                    gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                };
            }
            createOscillator() {
                const oscillator = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
                frequencies.push(oscillator.frequency);
                return oscillator;
            }
        };
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60]).map((esc) => ({
                ...esc,
                firmwareFamily: "blheli32",
                firmwareLabel: "BLHeli_32",
                capacity: 48,
            })),
        );
        const { app, vm, container } = await mountTab();
        try {
            await vm.scanEscs();
            vm.loadPreset({ ...createCurrentMelody(0, 59), id: "auto-low", name: "Auto low" });
            await nextTick();
            expect(container.querySelector(".overview-note").title).toContain("B4");
            findButton(container, "试听旋律").click();
            await vi.waitFor(() => expect(vm.playing).toBe(true));
            expect(frequencies[0].value).toBeCloseTo(440 * 2 ** ((71 - 69) / 12), 5);
            expect(vm.melody.notes[0].midi).toBe(59);
            vm.stopPreview();
            vm.escs[0].firmwareFamily = "bluejay";
            vm.escs[0].capacity = 128;
            await nextTick();
            expect(vm.automaticBl32.adapted).toBe(false);
            expect(container.querySelector(".overview-note").title).toContain("B3");
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("adapts independent channels separately without transforming untouched channels", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60, 60]).map((esc) => ({
                ...esc,
                firmwareFamily: "blheli32",
                firmwareLabel: "BLHeli_32",
                capacity: 48,
            })),
        );
        const { app, vm } = await mountTab();
        try {
            await vm.scanEscs();
            vm.syncAll = false;
            vm.melody.notes[0].midi = 59;
            await nextTick();
            expect(vm.automaticBl32.adapted).toBe(true);
            expect(vm.automaticBl32.tracks[0].notes[0].midi).toBe(71);
            expect(vm.automaticBl32.tracks[1].notes[0].midi).toBe(60);
            expect(vm.escs[1].editorMelody.notes[0].midi).toBe(60);
            expect(vm.pendingWriteEscs.map((esc) => esc.channel)).toEqual([0]);
            expect(vm.writeValidation.valid).toBe(true);
        } finally {
            app.unmount();
        }
    });

    it("keeps device details compact while exposing technical data and automatically revealing channel errors", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 60, 60, 60]));
        const { app, vm, container } = await mountTab();
        try {
            await vm.scanEscs();
            const panel = container.querySelector(".melody-device-details");
            const technical = panel.querySelector(".device-technical-details");
            expect(panel.querySelector(".device-overview").textContent).toContain("4 路电调已识别");
            expect(panel.querySelector(".device-readiness").textContent).toContain("4 路已验证");
            expect(panel.querySelectorAll(".device-channel-area > .channel-plan tbody tr")).toHaveLength(4);
            expect(technical.open).toBe(false);
            technical.querySelector(":scope > summary").click();
            expect(technical.open).toBe(true);
            expect(technical.querySelectorAll(".esc-record")).toHaveLength(4);
            expect(
                [...technical.querySelectorAll(".esc-record")].filter((record) => record.style.display !== "none"),
            ).toHaveLength(1);
            const source = JSON.stringify(vm.melody);
            technical.querySelectorAll(".device-diagnostic-tabs button")[3].click();
            await nextTick();
            expect(technical.querySelectorAll(".esc-record")[3].style.display).not.toBe("none");
            expect(JSON.stringify(vm.melody)).toBe(source);
            expect(panel.querySelectorAll(".device-channel-area th")).toHaveLength(8);

            technical.querySelector(":scope > summary").click();
            expect(technical.open).toBe(false);
            vm.escs[2].melodyReadError = "通道读取失败，请重试";
            await nextTick();
            expect(technical.open).toBe(true);
            expect(technical.textContent).toContain("通道读取失败，请重试");
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("starts with the library and keeps selection, preview, and editor on the same melody", async () => {
        const { app, vm, container } = await mountTab();
        try {
            expect(container.querySelector(".esc-melody-editor").style.display).toBe("none");
            expect(container.querySelector(".melody-selection-preview").style.display).not.toBe("none");
            const row = [...container.querySelectorAll(".library-preset-row")].find((item) =>
                item.querySelector("strong").textContent.includes("Bluejay Default"),
            );
            row.querySelector(".melody-list-item").click();
            await nextTick();
            expect(container.querySelector(".selection-preview-heading h2").textContent).toBe("Bluejay Default");
            expect(container.querySelector(".esc-melody-editor").style.display).toBe("none");
            expect(row.classList.contains("selected")).toBe(true);
            expect(container.querySelectorAll(".overview-note")).toHaveLength(
                vm.melody.notes.filter((note) => !note.rest).length,
            );
            container.querySelectorAll(".melody-mode-nav button")[1].click();
            await nextTick();
            expect(container.querySelector(".esc-melody-sidebar").style.display).toBe("none");
            expect(container.querySelector(".esc-melody-editor").style.display).not.toBe("none");
            findEditorButton(container, "音符").click();
            await nextTick();
            const edited = JSON.stringify(vm.melody);
            container.querySelectorAll(".melody-mode-nav button")[0].click();
            await nextTick();
            expect(JSON.stringify(vm.melody)).toBe(edited);
            expect(container.querySelectorAll(".overview-note")).toHaveLength(
                vm.melody.notes.filter((note) => !note.rest).length,
            );
            expect(scanEscs).not.toHaveBeenCalled();
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("filters favorites and exposes saved drafts through the library tabs", async () => {
        const { app, vm, container } = await mountTab();
        try {
            container.querySelector('[aria-label="收藏 Bluejay Default"]').click();
            container.querySelectorAll(".selection-library-tabs button")[1].click();
            await nextTick();
            expect(container.querySelectorAll(".library-preset-row")).toHaveLength(1);
            expect(container.querySelector(".library-preset-row").textContent).toContain("Bluejay Default");
            findButton(container, "新建旋律").click();
            await nextTick();
            const input = container.querySelector("#esc-melody-draft-name");
            input.value = "Selection draft";
            input.dispatchEvent(new Event("input"));
            await nextTick();
            findButton(container, "创建").click();
            await nextTick();
            expect(container.querySelector(".esc-melody-editor").style.display).not.toBe("none");
            expect(container.querySelector(".selection-preview-heading h2").textContent).toBe("Selection draft");
            container.querySelectorAll(".melody-mode-nav button")[0].click();
            container.querySelectorAll(".selection-library-tabs button")[2].click();
            await nextTick();
            expect(container.querySelector(".selection-library-panel").style.display).toBe("none");
            expect(container.querySelector(".selection-drafts-panel").style.display).not.toBe("none");
            expect(container.querySelector(".draft-list-row").textContent).toContain("Selection draft");
            container.querySelector(".draft-list-row .melody-list-item").click();
            await nextTick();
            expect(vm.workspaceView).toBe("library");
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("opens device details without starting a scan and restores focus after closing", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 60]));
        const { app, container } = await mountTab();
        try {
            const details = container.querySelector(".melody-device-details");
            const toggle = container.querySelector('[aria-controls="melody-device-details"]');
            toggle.click();
            await nextTick();
            expect(details.style.display).not.toBe("none");
            expect(document.activeElement).toBe(details.querySelector("h2"));
            expect(scanEscs).not.toHaveBeenCalled();
            const scanButton = container.querySelector('.esc-melody-header [aria-label="扫描电调"]');
            expect(container.querySelectorAll('[aria-label="扫描电调"]')).toHaveLength(1);
            findButton(details, "收起详情").click();
            await nextTick();
            scanButton.click();
            await vi.waitFor(() =>
                expect(container.querySelectorAll(".selection-channel-chips button")).toHaveLength(2),
            );
            expect(container.querySelector(".melody-connection-status").textContent).toContain("AM32");
            expect(container.querySelectorAll(".selection-channel-chips .ready")).toHaveLength(2);
            expect(details.style.display).toBe("none");
            expect(document.activeElement).toBe(toggle);
            container.querySelector(".selection-channel-chips button").click();
            await nextTick();
            expect(details.style.display).not.toBe("none");
            expect(scanEscs).toHaveBeenCalledOnce();
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("selects the auditioned song in the piano overview and stops it from the right preview", async () => {
        const stop = vi.fn();
        globalThis.AudioContext = class {
            currentTime = 0;
            destination = {};
            createGain() {
                return {
                    gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                };
            }
            createOscillator() {
                return { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop };
            }
        };
        const { app, vm, container } = await mountTab();
        try {
            container.querySelector('[aria-label="试听 Bluejay Default"]').click();
            await vi.waitFor(() => expect(vm.playing).toBe(true));
            await nextTick();
            const previewButton = container.querySelector(".selection-preview-actions .regular-button");
            expect(previewButton.textContent).toContain("停止试听");
            previewButton.click();
            await nextTick();
            expect(vm.playing).toBe(false);
            expect(stop).toHaveBeenCalled();
            expect(container.querySelector(".selection-preview-heading h2").textContent).toBe("Bluejay Default");
            const selectedRow = container.querySelector(".library-preset-row.selected");
            expect(selectedRow.textContent).toContain("Bluejay Default");
            expect(container.querySelectorAll(".overview-note")).toHaveLength(
                vm.melody.notes.filter((note) => !note.rest).length,
            );
            const monoNotes = [...container.querySelectorAll(".overview-note")].map((note) => note.style.cssText);
            container.querySelector('[aria-label="试听 Abba - Chiquitita"]').click();
            await vi.waitFor(() => expect(vm.playing).toBe(true));
            await nextTick();
            expect(container.querySelector(".selection-preview-heading h2").textContent).toBe("Abba - Chiquitita");
            expect(container.querySelectorAll(".selection-voice-tabs button")).toHaveLength(4);
            expect([...container.querySelectorAll(".overview-note")].map((note) => note.style.cssText)).not.toEqual(
                monoNotes,
            );
            expect(container.querySelectorAll(".overview-note")).toHaveLength(
                vm.melody.notes.filter((note) => !note.rest).length,
            );
            container.querySelector('[aria-label="试听 Abba - Chiquitita"]').click();
            await nextTick();
            expect(vm.playing).toBe(false);
            expect(container.querySelector(".selection-preview-heading h2").textContent).toBe("Abba - Chiquitita");
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("shows native BLHeli32 capacity, keeps B7 intact, and blocks an oversized melody", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const { decodeBlheli32Melody } = await import("../../src/js/esc_melody/blheli32_melody.ts");
        const notes = new Uint8Array(48).fill(255);
        notes[0] = 0xfb;
        const esc = {
            ...createWritableEscs([60])[0],
            model: "FPV32",
            firmwareFamily: "blheli32",
            firmwareLabel: "BLHeli_32",
            version: "32.10",
            capacity: 48,
            currentMelody: decodeBlheli32Melody(notes, { mode: 0x80 }),
        };
        scanEscs.mockResolvedValue([esc]);
        const { app, vm, container } = await mountTab();
        try {
            await vm.scanEscs();
            expect(vm.targetFirmware).toBe("blheli32");
            expect(vm.targetCapacity).toBe(48);
            expect(vm.melody.notes[0].midi).toBe(107);
            expect(container.querySelector(".compat-summary").textContent).toContain("/48 B");
            expect(container.querySelector(".piano-roll").getAttribute("style")).toContain("--note-rows: 57");
            vm.melody.notes = Array.from({ length: 49 }, (_, i) => ({
                id: `too-many-${i}`,
                midi: 60,
                start: i,
                duration: 1,
            }));
            await nextTick();
            expect(container.querySelector(".validation-badge").textContent).toContain("编码需调整");
            expect(vm.writeValidation.valid).toBe(false);
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("preserves completed scan channels when a later channel loses the transport", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const completed = createWritableEscs([60])[0];
        const error = new Error("4-way command 0x3a timed out");
        error.escs = [
            completed,
            {
                ...createWritableEscs([64])[0],
                id: "esc-1",
                channel: 1,
                canRead: false,
                canWrite: false,
                canBackup: false,
                currentMelody: null,
                melodyReadStatus: "idle",
                confirmationStatus: "failed",
            },
        ];
        scanEscs.mockRejectedValue(error);
        const { app, vm, container } = await mountTab();
        try {
            await vm.scanEscs();
            expect(vm.escs[0].editorMelody.notes[0].midi).toBe(60);
            expect(vm.escs[1].canWrite).toBe(false);
            expect(vm.operationMessage).toContain("timed out");
            expect(vm.locked).toBe(false);
            expect(container.querySelector(".firmware-confirm-dialog")).toBeNull();
            expect(scanEscs).toHaveBeenCalledOnce();
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("marks incompatible library songs after scanning while keeping loading and audition available", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60]).map((esc) => ({
                ...esc,
                firmwareFamily: "blheli32",
                firmwareLabel: "BLHeli_32",
                capacity: 48,
            })),
        );
        const { app, vm, container } = await mountTab();
        try {
            const good = { ...createCurrentMelody(0, 60), id: "test-good", name: "LibraryCheck Good" };
            const tooLong = {
                ...good,
                id: "test-long",
                name: "LibraryCheck Long",
                notes: Array.from({ length: 49 }, (_, i) => ({ midi: 60, start: i, duration: 1 })),
            };
            const low = {
                ...good,
                id: "test-low",
                name: "LibraryCheck Low",
                notes: [{ midi: 59, start: 0, duration: 1 }],
            };
            vm.presets.push(good, tooLong, low);
            vm.presetQuery = "LibraryCheck";
            await nextTick();
            expect(container.querySelectorAll(".library-compatibility")).toHaveLength(0);
            await vm.scanEscs();
            const rows = [...container.querySelectorAll(".library-preset-row")];
            expect(rows).toHaveLength(3);
            expect(rows[0].querySelector(".library-compatibility")).toBeNull();
            expect(rows[1].querySelector(".library-compatibility").textContent).toContain("不适用");
            expect(rows[1].querySelector(".library-compatibility").textContent).toContain("48");
            expect(rows[2].querySelector(".library-compatibility").textContent).toContain("自动适配 BL32");
            expect(rows[2].querySelector(".library-compatibility").textContent).toContain("完整适配版");
            expect(rows[2].querySelector(".melody-list-item").disabled).toBe(false);
            expect(rows[2].querySelector('[aria-label="试听 LibraryCheck Low"]').disabled).toBe(false);
            rows[2].querySelector(".melody-list-item").click();
            await nextTick();
            expect(vm.melody.notes[0].midi).toBe(59);
            expect(writeMelody).not.toHaveBeenCalled();
            vm.presetScope = "recent";
            await nextTick();
            expect(container.querySelectorAll(".library-preset-row")).toHaveLength(1);
            expect(container.querySelector(".library-compatibility").textContent).toContain("自动适配 BL32");
        } finally {
            app.unmount();
        }
    });

    it("checks each library voice against its default channel and updates hints after rescanning", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const targets = createWritableEscs([60, 60, 60, 60]);
        targets[1] = { ...targets[1], firmwareFamily: "blheli32", firmwareLabel: "BLHeli_32", capacity: 48 };
        scanEscs.mockResolvedValue(targets);
        const { app, vm, container } = await mountTab();
        try {
            const good = createCurrentMelody(0, 60);
            const low = createCurrentMelody(0, 59);
            vm.presets.push(
                { ...good, id: "voice-check-good", name: "VoiceCheck Good", trackMelodies: [low, good] },
                { ...good, id: "voice-check-bad", name: "VoiceCheck Bad", trackMelodies: [good, low] },
            );
            vm.presetQuery = "VoiceCheck";
            await vm.scanEscs();
            const rows = [...container.querySelectorAll(".library-preset-row")];
            expect(rows[0].querySelector(".library-compatibility")).toBeNull();
            expect(rows[1].querySelector(".library-compatibility").textContent).toContain("自动适配 BL32");
            expect(rows[1].querySelector(".library-compatibility").textContent).toContain("原曲保留");
            rows[1].querySelector(".melody-list-item").click();
            await nextTick();
            expect(vm.escs[1].editorMelody.notes[0].midi).toBe(59);
            expect(vm.writeValidation.valid).toBe(true);
            expect(vm.automaticBl32.tracks[0].notes[0].midi).toBe(72);
            expect(vm.automaticBl32.tracks[1].notes[0].midi).toBe(71);
            // A different connected firmware must not inherit the previous BLHeli_32 warning.
            scanEscs.mockResolvedValue(createWritableEscs([60, 60]));
            await vm.scanEscs();
            expect(container.querySelectorAll(".library-compatibility")).toHaveLength(0);
        } finally {
            app.unmount();
        }
    });

    it("does not claim library compatibility when scanned channels cannot write", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60]).map((esc) => ({
                ...esc,
                canWrite: false,
                melodyReadStatus: "unsupported",
                currentMelody: null,
            })),
        );
        const { app, vm, container } = await mountTab();
        try {
            await vm.scanEscs();
            expect(container.querySelectorAll(".library-compatibility").length).toBe(vm.filteredPresets.length);
            expect(container.querySelector(".library-compatibility").textContent).toContain("暂不可写");
            vm.presetQuery = "Bad Apple";
            await nextTick();
            expect(container.querySelector(".library-compatibility").textContent).toContain("暂不可写");
        } finally {
            app.unmount();
        }
    });

    it("clears device-specific library hints on disconnect and respects each channel's capacity", async () => {
        const model = reactive({ CONFIGURATOR: { connectionValid: true } });
        const targets = createWritableEscs([60, 60]);
        targets[1].capacity = 1;
        scanEscs.mockResolvedValue(targets);
        const { app, vm, container } = await mountTab(model);
        try {
            vm.presetQuery = "Two-Tigers";
            await vm.scanEscs();
            expect(container.querySelector(".library-compatibility").textContent).toContain("部分通道不适用");
            expect(container.querySelector(".library-compatibility").textContent).toContain("ESC 2");
            expect(container.querySelector(".library-compatibility").textContent).not.toContain("ESC 1");
            model.CONFIGURATOR.connectionValid = false;
            await nextTick();
            expect(container.querySelector(".library-compatibility")).toBeNull();
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("preserves an edited preset across tab unmount and remount", async () => {
        const { app, vm } = await mountTab();
        vm.melody.bpm = 177;
        await nextTick();
        app.unmount();
        const reopened = await mountTab();
        try {
            expect(reopened.vm.editRecovery).not.toBeNull();
            reopened.vm.restoreEditorRecovery();
            expect(reopened.vm.melody.bpm).toBe(177);
        } finally {
            reopened.app.unmount();
        }
    });

    it("preserves all edited voices and the active voice when leaving the tab", async () => {
        const { app, vm, container } = await mountTab();
        findButton(container, "Bad Apple").click();
        await nextTick();
        container.querySelectorAll(".preset-track-tab")[1].click();
        await nextTick();
        vm.melody.bpm = 177;
        await nextTick();
        app.unmount();
        const reopened = await mountTab();
        try {
            reopened.vm.restoreEditorRecovery();
            expect(reopened.vm.presetTrackTabs).toHaveLength(4);
            expect(reopened.vm.activePresetTrackIndex).toBe(1);
            expect(reopened.vm.melody.bpm).toBe(177);
        } finally {
            reopened.app.unmount();
        }
    });

    it("saves the current edit before browser unload and removes the listener on unmount", async () => {
        const { app, vm } = await mountTab();
        vm.melody.bpm = 177;
        await nextTick();
        window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
        const saved = localStorage.getItem("betaflight.esc-melody.edit-recovery.v1");
        expect(saved).toContain('"bpm":177');
        app.unmount();
        localStorage.removeItem("betaflight.esc-melody.edit-recovery.v1");
        window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
        expect(localStorage.getItem("betaflight.esc-melody.edit-recovery.v1")).toBeNull();
    });

    it("requests browser unload protection when the edited melody cannot be persisted", async () => {
        const { app, vm } = await mountTab();
        vm.melody.bpm = 177;
        await nextTick();
        const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("storage full");
        });
        try {
            const event = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);
            expect(vm.operationMessage).toContain("storage full");
        } finally {
            write.mockRestore();
            app.unmount();
        }
    });

    it("keeps offline editing available while locking the hardware safety flow", async () => {
        const { app, container } = await mountTab();
        const safetyButton = [...container.querySelectorAll("button")].find((button) =>
            button.textContent.includes("安全写入"),
        );
        const addRestButton = [...container.querySelectorAll("button")].find((button) =>
            button.textContent.includes("休止"),
        );
        const initialNotes = container.querySelectorAll(".esc-melody-note").length;

        expect(container.textContent).toContain("离线编辑");
        expect(container.textContent).toContain("OX32");
        expect(container.textContent).toContain("配置页 CRC");
        expect(container.querySelector(".melody-device-details .esc-scan-panel")).not.toBeNull();
        expect(container.querySelector(".melody-device-details").style.display).toBe("none");
        expect(container.querySelector('.melody-mode-nav [aria-pressed="true"]').textContent.trim()).toBe("选曲");
        expect(container.querySelector(".esc-melody-workflow")).toBeNull();
        expect(container.querySelector('[aria-label="扫描电调"]').disabled).toBe(true);
        expect(safetyButton.disabled).toBe(true);
        expect(container.querySelector(".safety-write-blocker").textContent).toContain("请先连接飞控");
        addRestButton.click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(initialNotes + 1);
        expect(contentReady).toHaveBeenCalledOnce();

        app.unmount();
    });

    it("opens scanned melodies immediately without a firmware confirmation dialog", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60, 64]).map((esc) => ({
                ...esc,
                confirmationStatus: "verified",
                layoutVerified: true,
            })),
        );
        const { app, container, vm } = await mountTab();
        try {
            await vm.scanEscs();
            expect(vm.escs.map((esc) => esc.editorMelody.notes[0].midi)).toEqual([60, 64]);
            expect(container.querySelector(".firmware-confirm-dialog")).toBeNull();
            expect(container.textContent).not.toContain("确认电调类型");
            expect(container.textContent).not.toContain("确认并验证");
            expect(container.textContent).toContain("已识别可读写");
            expect(scanEscs).toHaveBeenCalledOnce();
            expect(backupEscs).not.toHaveBeenCalled();
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("shows failed scan reasons without reopening a dialog or repeating requests", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            createWritableEscs([60, 64]).map((esc) => ({
                ...esc,
                canRead: false,
                canWrite: false,
                canBackup: false,
                currentMelody: null,
                melodyReadStatus: "idle",
                confirmationStatus: "failed",
                confirmationReason: `ESC ${esc.channel + 1} 程序指纹不匹配`,
            })),
        );
        const { app, container, vm } = await mountTab();
        try {
            await vm.scanEscs();
            expect(container.querySelector(".firmware-confirm-dialog")).toBeNull();
            expect(container.querySelector(".device-readiness").textContent).toContain("2 路验证失败");
            expect(container.querySelector(".safety-write-blocker").textContent).toContain("通道保持锁定");
            expect(container.textContent).toContain("ESC 1 程序指纹不匹配");
            expect(container.textContent).toContain("ESC 2 程序指纹不匹配");
            expect(findButton(container, "扫描电调").disabled).toBe(false);
            expect(scanEscs).toHaveBeenCalledOnce();
            expect(writeMelody).not.toHaveBeenCalled();
        } finally {
            app.unmount();
        }
    });

    it("keeps failed channels locked alongside editable scan results", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const records = createWritableEscs([60, 64]);
        Object.assign(records[1], {
            confirmationStatus: "failed",
            canRead: false,
            canBackup: false,
            canWrite: false,
            currentMelody: null,
            melodyReadStatus: "idle",
            confirmationReason: "配置布局无效",
        });
        scanEscs.mockResolvedValue(records);
        const { app, container, vm } = await mountTab();
        try {
            await vm.scanEscs();
            const buttons = container.querySelectorAll(".esc-record-select");
            expect(buttons[0].disabled).toBe(false);
            expect(buttons[1].disabled).toBe(true);
            expect(vm.escs[0].editorMelody.notes[0].midi).toBe(60);
            expect(container.textContent).toContain("配置布局无效");
            expect(container.textContent).not.toContain("确认电调类型");
        } finally {
            app.unmount();
        }
    });

    it("separates offline encoding from device and operation readiness", async () => {
        const { app, container } = await mountTab();
        expect(container.querySelector(".validation-badge").textContent).toContain("编码通过");
        expect(container.querySelector(".device-readiness").textContent).toContain("未连接");
        expect(container.textContent).not.toContain("原生等待");
        expect(container.querySelector(".channel-plan").textContent).toContain("未分配");
        app.unmount();
    });

    it.each([2, 4, 6, 8])("shows and edits voice allocation for %i channels", async (count) => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs(Array(count).fill(60)));
        const { app, container } = await mountTab();
        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".channel-plan tbody tr")).toHaveLength(count));
        findButton(container, "Bad Apple").click();
        await nextTick();
        const voices = container.querySelectorAll(".channel-plan select");
        expect(voices).toHaveLength(count);
        expect([...voices].map((input) => Number(input.value))).toEqual(Array.from({ length: count }, (_, i) => i % 4));
        expect(container.querySelector(".channel-plan").textContent).toContain("多声部合奏");
        if (count === 2) expect(container.querySelector(".channel-plan").textContent).toContain("缺少声部 3、4");
        if (count > 4) expect(container.querySelector(".channel-plan").textContent).toContain("将分配到多路电调");
        voices[0].value = "3";
        voices[0].dispatchEvent(new Event("change"));
        await nextTick();
        expect(container.querySelector(".channel-plan select").value).toBe("3");
        if (count === 4) expect(container.querySelector(".channel-plan").textContent).toContain("缺少声部 1");
        app.unmount();
    });

    it("keeps unsupported mixed-firmware channels out of the voice allocation", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const escs = createWritableEscs([60, 60, 60]);
        escs[1].firmwareFamily = "blheli32";
        escs[1].firmwareLabel = "BLHeli_32";
        escs[1].canWrite = false;
        escs[1].melodyReadStatus = "unsupported";
        scanEscs.mockResolvedValue(escs);
        const { app, container } = await mountTab();
        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".channel-plan tbody tr")).toHaveLength(3));
        findButton(container, "Bad Apple").click();
        await nextTick();
        expect(container.querySelectorAll(".channel-plan select")).toHaveLength(2);
        expect(container.querySelector(".channel-plan tbody tr:nth-child(2)").textContent).toContain("未参与");
        expect(container.querySelector(".channel-plan").textContent).toContain("ESC 2 未参与写入");
        app.unmount();
    });

    it("changes timeline density without stretching note duration and supports keyboard editing", async () => {
        const { app, container } = await mountTab();
        const initial = container.querySelector(".esc-melody-note");
        const note = container.querySelector('[aria-label="音符 1 起点"]');
        const before = Number(note.value);
        initial.focus();
        initial.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        await nextTick();
        expect(Number(container.querySelector('[aria-label="音符 1 起点"]').value)).toBeCloseTo(before + 0.125);
        const originalWidth = container.querySelector(".esc-melody-note").style.width;
        const originalTimelineWidth = parseFloat(container.querySelector(".piano-roll").style.width);
        const zoom = container.querySelector('[aria-label="卷帘缩放"]');
        zoom.value = "112";
        zoom.dispatchEvent(new Event("input"));
        await nextTick();
        expect(container.querySelector(".esc-melody-note").style.width).toBe(originalWidth);
        expect(container.querySelector(".piano-roll").style.width).toBe(`${originalTimelineWidth * 2}px`);
        initial.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("D#5");
        expect(container.querySelectorAll(".roll-time-ruler span").length).toBeGreaterThan(2);
        app.unmount();
    });

    it("traps code-dialog focus and restores the trigger after Escape", async () => {
        const { app, container } = await mountTab();
        const trigger = container.querySelector('[title="RTTTL 代码"]');
        trigger.focus();
        trigger.click();
        await nextTick();
        await nextTick();
        expect(container.querySelector("main").hasAttribute("inert")).toBe(true);
        const buttons = [
            ...container.querySelectorAll(".rtttl-code-dialog button:not([disabled]), .rtttl-code-dialog textarea"),
        ];
        buttons.at(-1).focus();
        buttons.at(-1).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(buttons[0]);
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
        await nextTick();
        await nextTick();
        expect(container.querySelector(".rtttl-code-dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
        expect(container.querySelector("main").hasAttribute("inert")).toBe(false);
        app.unmount();
    });

    it("persists favorites and scopes recent and multi-voice library results", async () => {
        const { app, container } = await mountTab();
        container.querySelector('[aria-label="收藏 Two-Tigers"]').click();
        await nextTick();
        const scope = container.querySelector("#melody-library-scope");
        scope.value = "favorites";
        scope.dispatchEvent(new Event("change"));
        await nextTick();
        expect(container.querySelectorAll(".library-preset-row")).toHaveLength(1);
        scope.value = "all";
        scope.dispatchEvent(new Event("change"));
        await nextTick();
        const voices = container.querySelector("#melody-library-voices");
        voices.value = "multi";
        voices.dispatchEvent(new Event("change"));
        await nextTick();
        expect(container.querySelectorAll(".library-preset-row").length).toBeGreaterThan(1);
        expect(container.querySelector(".library-preset-row").textContent).not.toContain("Two-Tigers");
        findButton(container, "Bad Apple").click();
        await nextTick();
        scope.value = "recent";
        scope.dispatchEvent(new Event("change"));
        await nextTick();
        expect(container.querySelectorAll(".library-preset-row")).toHaveLength(1);
        expect(container.querySelector(".library-preset-row").textContent).toContain("Bad Apple");
        app.unmount();
        const reopened = await mountTab();
        expect(reopened.container.querySelector('[aria-label="收藏 Two-Tigers"]').getAttribute("aria-pressed")).toBe(
            "true",
        );
        reopened.app.unmount();
    });

    it("preserves an edited multi-voice arrangement when switching presets", async () => {
        const { app, container } = await mountTab();
        findButton(container, "Bad Apple").click();
        await nextTick();
        container.querySelectorAll(".preset-track-tab")[1].click();
        await nextTick();
        findEditorButton(container, "音符").click();
        await nextTick();
        const editedCount = container.querySelectorAll(".esc-melody-note").length;
        findButton(container, "Two-Tigers").click();
        await nextTick();
        expect(container.querySelector(".edit-recovery-banner")).not.toBeNull();
        findButton(container, "恢复上次编辑").click();
        await nextTick();
        expect(container.querySelectorAll(".preset-track-tab")).toHaveLength(4);
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(editedCount);
        expect(container.querySelector(".preset-track-tab.active").textContent).toContain("声部 2");
        expect(writeMelody).not.toHaveBeenCalled();
        app.unmount();
    });

    it("preserves an edited roll for recovery when library audition switches the selected melody", async () => {
        const outputs = [];
        globalThis.AudioContext = class {
            currentTime = 0;
            destination = {};
            createGain() {
                const output = {
                    gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                };
                outputs.push(output);
                return output;
            }
            createOscillator() {
                return { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
            }
        };
        const { app, container } = await mountTab();
        findEditorButton(container, "音符").click();
        await nextTick();
        const notes = [...container.querySelectorAll(".esc-melody-note")].map((note) =>
            note.getAttribute("aria-label"),
        );
        const failedStorage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("storage full");
        });
        container.querySelector('[aria-label="试听 Bluejay Default"]').click();
        await nextTick();
        expect(
            [...container.querySelectorAll(".esc-melody-note")].map((note) => note.getAttribute("aria-label")),
        ).toEqual(notes);
        expect(outputs).toHaveLength(0);
        expect(container.querySelector(".esc-melody-notice").textContent).toContain("storage full");
        failedStorage.mockRestore();
        container.querySelector('[aria-label="试听 Bluejay Default"]').click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();
        expect(container.querySelector('[aria-label="试听 Bluejay Default"]').textContent).toContain("停止");
        expect(container.querySelector(".selection-preview-heading h2").textContent).toBe("Bluejay Default");
        expect(container.querySelector(".edit-recovery-banner")).not.toBeNull();
        const volume = container.querySelector('[aria-label="试听音量"]');
        volume.value = "25";
        volume.dispatchEvent(new Event("input"));
        await nextTick();
        expect(outputs[0].gain.value).toBe(0.25);
        findButton(container, "静音").click();
        await nextTick();
        expect(outputs[0].gain.value).toBe(0);
        findButton(container, "恢复上次编辑").click();
        await nextTick();
        expect(
            [...container.querySelectorAll(".esc-melody-note")].map((note) => note.getAttribute("aria-label")),
        ).toEqual(notes);
        expect(scanEscs).not.toHaveBeenCalled();
        expect(writeMelody).not.toHaveBeenCalled();
        app.unmount();
    });

    it("shows verified, failed and unexecuted channels, then preserves partial recovery progress", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 60, 60]));
        backupEscs.mockImplementation(async (targets) => {
            for (const esc of targets) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(1);
                esc.backedUp = true;
            }
        });
        let continueWrite;
        const gate = new Promise((resolve) => {
            continueWrite = resolve;
        });
        writeMelody.mockImplementation(async (targets) => {
            controllerProgress.send({ phase: "write", channel: 0 });
            await gate;
            controllerProgress.send({ phase: "verify", channel: 0 });
            return {
                ok: false,
                written: [targets[0]],
                failed: targets[1],
                rollback: targets.slice(0, 2),
                error: new Error("verify failed"),
            };
        });
        recoverEscs.mockImplementation(async (targets) => {
            controllerProgress.send({ phase: "recovered", channel: targets[0].channel });
            controllerProgress.send({ phase: "recoverFailed", channel: targets[1].channel, error: "link lost" });
            throw new Error("link lost");
        });
        const { app, container } = await mountTab();
        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-write-mark")).toHaveLength(3));
        findButton(container, "安全写入").click();
        await nextTick();
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => expect(container.querySelector(".safety-backup").textContent).toContain("已持久保存"));
        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        findButton(container, "开始写入").click();
        await nextTick();
        const dialog = container.querySelector('[aria-labelledby="safety-title"]');
        expect(dialog.querySelectorAll("table")).toHaveLength(1);
        expect(dialog.querySelector(".operation-progress")).toBeNull();
        expect(dialog.querySelectorAll(".channel-plan tbody tr")).toHaveLength(3);
        expect(dialog.querySelector('.channel-plan [data-state="write"] .channel-status').textContent).toContain(
            "写入中",
        );
        expect(dialog.querySelector('.channel-plan [data-state="pending"] .channel-status').textContent).toContain(
            "待处理",
        );
        const firstRow = dialog.querySelector(".channel-plan tbody tr");
        expect(firstRow.textContent).toContain("ESC 1");
        expect(firstRow.textContent).toContain("AM32");
        expect(firstRow.querySelector("td").textContent).toContain("/128 B");
        const close = container.querySelector('[aria-labelledby="safety-title"] [aria-label="关闭"]');
        expect(close.disabled).toBe(true);
        close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        expect(container.querySelector('[aria-labelledby="safety-title"]')).not.toBeNull();
        continueWrite();
        await vi.waitFor(() => expect(container.querySelector(".write-failure")).not.toBeNull());
        expect([...dialog.querySelectorAll(".channel-plan tbody tr")].map((row) => row.dataset.state)).toEqual([
            "written",
            "failed",
            "skipped",
        ]);
        expect(dialog.querySelector('[data-state="failed"] .channel-status-error').textContent).toBe("verify failed");
        expect(dialog.querySelector('[data-state="skipped"] .channel-status').textContent).toContain("未执行");
        findButton(container, "恢复受影响通道").click();
        await vi.waitFor(() => expect(container.querySelector('[data-state="recoverFailed"]')).not.toBeNull());
        expect([...dialog.querySelectorAll(".channel-plan tbody tr")].map((row) => row.dataset.state)).toEqual([
            "recovered",
            "recoverFailed",
            "skipped",
        ]);
        expect(dialog.querySelector('[data-state="recoverFailed"] .channel-status-error').textContent).toBe(
            "link lost",
        );
        expect(findButton(container, "备份到本机").disabled).toBe(true);
        expect(findButton(container, "开始写入").disabled).toBe(true);
        app.unmount();
    });

    it("preserves BPM-only edits that did not create note history", async () => {
        const { app, container } = await mountTab();
        const bpm = container.querySelector('.inline-melody-settings input[type="number"]');
        bpm.value = "137";
        bpm.dispatchEvent(new Event("input"));
        bpm.dispatchEvent(new Event("change"));
        await nextTick();
        findButton(container, "Bluejay Default").click();
        await nextTick();
        expect(container.querySelector(".edit-recovery-banner")).not.toBeNull();
        findButton(container, "恢复上次编辑").click();
        await nextTick();
        expect(container.querySelector('.inline-melody-settings input[type="number"]').value).toBe("137");
        app.unmount();
    });

    it("opens the music contribution popup with the QQ group QR code", async () => {
        const { app, container } = await mountTab();
        const contributionButton = [...container.querySelectorAll("button")].find((button) =>
            button.textContent.includes("联系投稿"),
        );

        expect(contributionButton).toBeTruthy();
        expect(container.querySelector(".melody-contribution-dialog")).toBeNull();

        contributionButton.click();
        await nextTick();

        const dialog = container.querySelector(".melody-contribution-dialog");
        const qrCode = dialog.querySelector('img[alt="花生 FPV 官方 QQ 群二维码"]');
        expect(dialog).toBeTruthy();
        expect(dialog.textContent).toContain("音乐投稿");
        expect(qrCode.getAttribute("src")).toContain("hs-qq-qr");
        expect(dialog.textContent).toContain("942085532");
        expect(dialog.querySelector('[aria-label="复制 QQ 群号 942085532"]')).not.toBeNull();

        dialog.querySelector('[aria-label="关闭音乐投稿"]').click();
        await nextTick();
        expect(container.querySelector(".melody-contribution-dialog")).toBeNull();

        app.unmount();
    });

    it("keeps the loaded preset melody in the visible piano-roll range", async () => {
        const { app, container } = await mountTab();
        const pianoRollWrap = container.querySelector(".piano-roll-wrap");
        const twoTigersButton = [...container.querySelectorAll("button")].find((button) =>
            button.textContent.includes("Two-Tigers"),
        );

        Object.defineProperties(pianoRollWrap, {
            clientHeight: { configurable: true, value: 200 },
            scrollHeight: { configurable: true, value: 768 },
        });
        pianoRollWrap.scrollTop = 0;

        twoTigersButton.click();
        await nextTick();
        await nextTick();

        expect(pianoRollWrap.scrollTop).toBeGreaterThan(0);
        expect(container.querySelector(".editor-title strong").textContent).toBe("Two-Tigers");

        app.unmount();
    });

    it("keeps every polyphonic preset voice available independently from the scanned ESC count", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 60]));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelector('[aria-label="编排方式"]').value).toBe("sync"));

        const search = container.querySelector('[aria-label="搜索旋律库"]');
        search.value = "Bad Apple";
        search.dispatchEvent(new Event("input"));
        await nextTick();

        const results = container.querySelectorAll(".melody-preset-list .melody-list-item");
        expect(results).toHaveLength(1);
        expect(results[0].textContent).toContain("4 声部");
        results[0].click();
        await nextTick();

        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("poly");
        expect(container.querySelector('[aria-label="编排方式"]').disabled).toBe(false);
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(34);

        const tabs = container.querySelectorAll(".preset-track-tab");
        expect(tabs).toHaveLength(4);
        expect([...tabs].map((tab) => tab.textContent.trim())).toEqual(["声部 1", "声部 2", "声部 3", "声部 4"]);
        tabs[1].click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(36);

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const codeInputs = container.querySelectorAll(".rtttl-code-card .rtttl-code-input");
        expect(codeInputs).toHaveLength(4);
        expect(
            [...container.querySelectorAll(".rtttl-code-card-header strong")].map((item) => item.textContent),
        ).toEqual(["声部 1", "声部 2", "声部 3", "声部 4"]);

        codeInputs[1].value = "Voice2:b=120,o=4,d=4:c";
        codeInputs[1].dispatchEvent(new Event("input"));
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(36);

        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(1);
        expect(container.querySelector(".esc-melody-note").textContent).toContain("C4");

        tabs[0].click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(34);
        tabs[1].click();
        await nextTick();
        container.querySelector('[title="撤销"]').click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(36);

        app.unmount();
    });

    it("overwrites every writable ESC with a one-track preset after a multi-track preset", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs([60, 62, 64, 65]);
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (escs) => {
            for (const esc of escs) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(esc.channel + 1);
                esc.backedUp = true;
            }
        });
        writeMelody.mockImplementation(async (targets) => ({ ok: true, written: targets }));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelector('[aria-label="编排方式"]').value).toBe("independent"));

        const search = container.querySelector('[aria-label="搜索旋律库"]');
        search.value = "Bad Apple";
        search.dispatchEvent(new Event("input"));
        await nextTick();
        container.querySelector(".melody-preset-list .melody-list-item").click();
        await nextTick();
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("poly");

        search.value = "Two-Tigers";
        search.dispatchEvent(new Event("input"));
        await nextTick();
        container.querySelector(".melody-preset-list .melody-list-item").click();
        await nextTick();

        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("sync");
        expect(container.querySelectorAll(".preset-track-tab")).toHaveLength(0);
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(0);
        expect(container.querySelectorAll(".melody-write-mark")).toHaveLength(4);
        expect(container.querySelector(".actionbar-status").textContent).toContain("4 路将分别写入");

        findButton(container, "安全写入").click();
        await nextTick();
        expect(container.querySelector(".safety-write-melody").textContent).toContain("Two-Tigers");
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => expect(container.querySelector(".safety-backup").textContent).toContain("已持久保存"));
        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        findButton(container, "开始写入").click();

        await vi.waitFor(() => expect(writeMelody).toHaveBeenCalledOnce());
        const [targets, melodyForEsc] = writeMelody.mock.calls[0];
        expect(targets.map((esc) => esc.channel)).toEqual([0, 1, 2, 3]);
        expect(
            targets.map((esc) => melodyForEsc(esc).notes.map((note) => [note.midi, note.start, note.duration])),
        ).toEqual(
            Array.from({ length: 4 }, () =>
                melodyForEsc(targets[0]).notes.map((note) => [note.midi, note.start, note.duration]),
            ),
        );

        app.unmount();
    });

    it("names, creates and selects an empty melody draft", async () => {
        const { app, container } = await mountTab();
        const createButton = container.querySelector('button[aria-label="新建草稿"]');

        expect(createButton).toBeTruthy();
        createButton.click();
        await nextTick();
        const nameInput = container.querySelector("#esc-melody-draft-name");
        expect(nameInput).toBeTruthy();
        nameInput.value = "起飞提示音";
        nameInput.dispatchEvent(new Event("input"));
        await nextTick();
        findButton(container, "创建").click();
        await nextTick();

        expect(container.querySelector(".esc-melody-note")).toBeNull();
        expect(container.querySelector(".editor-title strong").textContent).toBe("起飞提示音");
        expect(container.querySelectorAll(".draft-item")).toHaveLength(1);
        expect(container.querySelector(".draft-item").classList.contains("active")).toBe(true);
        expect(JSON.parse(localStorage.getItem("betaflight.esc-melody.drafts.v1"))).toHaveLength(1);

        expect(findButton(container, "已自动保存").disabled).toBe(true);
        findButton(container, "已自动保存").click();
        await nextTick();
        expect(JSON.parse(localStorage.getItem("betaflight.esc-melody.drafts.v1"))).toHaveLength(1);

        app.unmount();
    });

    it("renames an existing draft and rejects a duplicate name", async () => {
        const { app, container } = await mountTab();

        await createNamedDraft(container, "起飞提示音");
        await createNamedDraft(container, "降落提示音");

        container.querySelector('button[aria-label="管理草稿 降落提示音"]').click();
        await nextTick();
        findButton(container, "重命名").click();
        await nextTick();
        const nameInput = container.querySelector("#esc-melody-draft-name");
        nameInput.value = "起飞提示音";
        nameInput.dispatchEvent(new Event("input"));
        await nextTick();
        findButton(container, "保存名称").click();
        await nextTick();

        expect(container.querySelector(".draft-name-error").textContent).toContain("已有同名草稿");
        expect(container.querySelector(".draft-name-dialog")).toBeTruthy();

        nameInput.value = "返航提示音";
        nameInput.dispatchEvent(new Event("input"));
        await nextTick();
        findButton(container, "保存名称").click();
        await nextTick();

        expect(container.querySelector(".draft-name-dialog")).toBeNull();
        expect(container.querySelector(".editor-title strong").textContent).toBe("返航提示音");
        expect(JSON.parse(localStorage.getItem("betaflight.esc-melody.drafts.v1"))[0].name).toBe("返航提示音");

        app.unmount();
    });

    it("keeps a draft selected and auto-saves piano-roll edits before switching away", async () => {
        vi.useFakeTimers();
        const { app, container } = await mountTab();
        await createNamedDraft(container, "自动保存测试");

        findEditorButton(container, "音符").click();
        await nextTick();
        expect(container.querySelector(".draft-item").classList.contains("active")).toBe(true);
        expect(container.querySelector(".draft-storage-note").textContent).toContain("自动保存");

        await vi.advanceTimersByTimeAsync(450);
        await nextTick();
        expect(JSON.parse(localStorage.getItem("betaflight.esc-melody.drafts.v1"))[0].melody.notes).toHaveLength(1);
        expect(findButton(container, "已自动保存").disabled).toBe(true);

        findButton(container, "Two-Tigers").click();
        await nextTick();
        container.querySelector(".draft-item").click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(1);

        app.unmount();
    });

    it("keeps RTTTL edits attached to the current draft and saves them without creating a copy", async () => {
        vi.useFakeTimers();
        const { app, container } = await mountTab();
        await createNamedDraft(container, "代码同步测试");

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = "RTTTL 内部名称:d=4,o=5,b=120:c5";
        input.dispatchEvent(new Event("input"));
        await nextTick();

        expect(container.querySelector(".draft-item").classList.contains("active")).toBe(true);
        expect(JSON.parse(localStorage.getItem("betaflight.esc-melody.drafts.v1"))[0].melody.notes).toHaveLength(0);
        codeSaveButton(container).click();
        await nextTick();
        await vi.advanceTimersByTimeAsync(450);
        await nextTick();
        const storedDrafts = JSON.parse(localStorage.getItem("betaflight.esc-melody.drafts.v1"));
        expect(storedDrafts).toHaveLength(1);
        expect(storedDrafts[0].name).toBe("代码同步测试");
        expect(storedDrafts[0].melody.notes).toHaveLength(1);

        app.unmount();
    });

    it("requires a name when saving a preset and supports copy, export and confirmed deletion", async () => {
        const { app, container } = await mountTab();
        findButton(container, "另存为草稿").click();
        await nextTick();
        expect(container.querySelector(".draft-name-dialog")).toBeTruthy();
        expect(findButton(container, "保存草稿").disabled).toBe(false);
        const input = container.querySelector("#esc-melody-draft-name");
        input.value = "预置副本";
        input.dispatchEvent(new Event("input"));
        await nextTick();
        findButton(container, "保存草稿").click();
        await nextTick();

        container.querySelector('button[aria-label="管理草稿 预置副本"]').click();
        await nextTick();
        findButton(container, "复制").click();
        await nextTick();
        expect(container.querySelectorAll(".draft-item")).toHaveLength(2);

        container.querySelector('button[aria-label="管理草稿 预置副本 副本"]').click();
        await nextTick();
        findButton(container, "导出 RTTTL").click();
        expect(URL.createObjectURL).toHaveBeenCalled();

        container.querySelector('button[aria-label="管理草稿 预置副本 副本"]').click();
        await nextTick();
        findButton(container, "删除").click();
        await nextTick();
        expect(container.querySelector(".draft-delete-dialog")).toBeTruthy();
        container.querySelector(".draft-delete-dialog .danger-button").click();
        await nextTick();
        expect(container.querySelectorAll(".draft-item")).toHaveLength(1);

        app.unmount();
    });

    it("starts and stops preview through Web Audio without entering a hardware operation", async () => {
        vi.useFakeTimers();
        const stop = vi.fn();
        globalThis.AudioContext = class {
            currentTime = 1;
            destination = {};
            resume = vi.fn();
            createOscillator() {
                return {
                    type: "sine",
                    frequency: { value: 0 },
                    connect() {
                        return this;
                    },
                    start: vi.fn(),
                    stop,
                };
            }
            createGain() {
                return {
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                    connect() {
                        return this;
                    },
                };
            }
        };

        const { app, container } = await mountTab();
        const previewButton = [...container.querySelectorAll(".inspector-preview-actions button")].find((button) =>
            button.textContent.includes("试听当前声部"),
        );

        previewButton.click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();
        expect(previewButton.textContent).toContain("停止当前声部");
        const notes = [...container.querySelectorAll(".esc-melody-note")];
        expect(container.querySelectorAll(".esc-melody-note.preview-active")).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(40);
        await nextTick();
        expect(notes[0].classList.contains("preview-active")).toBe(true);

        await vi.advanceTimersByTimeAsync(429);
        await nextTick();
        expect(notes[0].classList.contains("preview-active")).toBe(false);
        expect(notes[1].classList.contains("preview-active")).toBe(true);

        previewButton.click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();
        expect(previewButton.textContent).toContain("试听当前声部");
        expect(container.querySelectorAll(".esc-melody-note.preview-active")).toHaveLength(0);
        expect(stop).toHaveBeenCalled();

        app.unmount();
    });

    it("plays every editable ESC from the inspector and keeps preview controls out of the action bar", async () => {
        const startTimes = [];
        const stops = [];
        globalThis.AudioContext = class {
            currentTime = 3;
            destination = {};
            resume = vi.fn();
            createOscillator() {
                const stop = vi.fn();
                stops.push(stop);
                return {
                    type: "sine",
                    frequency: { value: 0 },
                    connect() {
                        return this;
                    },
                    start: vi.fn((time) => startTimes.push(time)),
                    stop,
                };
            }
            createGain() {
                return {
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                    connect() {
                        return this;
                    },
                };
            }
        };
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 67]));
        const { app, container } = await mountTab();

        expect(container.querySelector(".actionbar-actions").textContent).not.toContain("试听");
        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(2));

        const playAllButton = findButton(container, "试听合奏");
        expect(playAllButton.disabled).toBe(false);
        playAllButton.click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();

        expect(startTimes).toHaveLength(2);
        expect(new Set(startTimes)).toEqual(new Set([3.04]));
        expect(playAllButton.textContent).toContain("停止合奏");

        playAllButton.click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();
        expect(playAllButton.textContent).toContain("试听合奏");
        expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
        expect(writeMelody).not.toHaveBeenCalled();

        app.unmount();
    });

    it("uses identified ESC count consistently after checking unavailable channels", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(
            Array.from({ length: 4 }, (_, channel) => ({
                id: `esc-${channel}`,
                channel,
                model: `ESC channel ${channel + 1}`,
                firmwareLabel: "Unknown",
                version: "--",
                layout: "Unknown EEPROM layout",
                reason: "No response",
                status: "unavailable",
                canWrite: false,
            })),
        );
        const { app, container } = await mountTab();
        const scanButton = [...container.querySelectorAll("button")].find((button) =>
            button.textContent.includes("扫描电调"),
        );

        scanButton.click();

        await vi.waitFor(() => {
            expect(container.querySelector(".device-connection small").textContent).toBe("0 路电调已识别");
            expect(container.querySelector(".esc-melody-notice").textContent).toContain("未识别到电调");
        });
        expect(container.querySelector(".melody-connection-status").textContent).toContain("0 路");
        expect(container.querySelector(".esc-melody-notice").textContent).toContain("已检查 4 路通道");
        expect(container.querySelector(".esc-list-panel .panel-count").textContent).toBe("4 路已检查");

        app.unmount();
    });

    it("keeps valid RTTTL staged until Save applies it to the piano roll", async () => {
        const code =
            "Melody:b=150,o=5,d=16:c5,p,g5,p,c6,p,d#6,p,8p,c6,p,8p,b5,p,c6,p,d6,p,8p,c6,p,g5,p,d#5,p,c5,p,d5,p,d#5,p,f#5,p,8p,g5,p,d#5,p,c5,p,g4,p,b4,p,c5,p,d5,p,8p,c5";
        const { app, container } = await mountTab();
        const openCodeButton = container.querySelector('[title="RTTTL 代码"]');

        openCodeButton.click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = code;
        input.dispatchEvent(new Event("input"));
        await nextTick();

        expect(container.querySelector(".rtttl-code-summary").textContent).toContain("23 音符 · 27 休止");
        expect(container.querySelector(".rtttl-code-summary").textContent).toContain("104/128 B");
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(32);
        expect(container.querySelector(".rtttl-code-dialog").textContent).toContain("修改后点击保存");
        expect(container.querySelector(".rtttl-code-dialog")).not.toBeNull();

        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelector(".rtttl-code-dialog")).toBeNull();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(50);
        expect(
            [...container.querySelectorAll(".esc-melody-note")].some((note) => note.textContent.includes("D#6")),
        ).toBe(true);
        expect(container.querySelector(".piano-roll").getAttribute("style")).toContain("--note-rows: 48");
        expect(container.querySelector(".editor-title strong").textContent).toBe("Melody");

        const undoButton = container.querySelector('[title="撤销"]');
        undoButton.click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(32);

        app.unmount();
    });

    it("accepts ESC Configurator duration and accidental syntax in the code dialog", async () => {
        const code =
            "bluejay:b=55,o=4,d=32:d5,32p,d5,32p,c5,32p,c5,32p,g,p,p,26f5,32p,g5#,32p,f5,16p,f5,16p,c5,16p,g,16p,c5,32p,f5#,32p,d5,d5,16p,d5,d5,16p,g#,64p,g#,32p,d5,32p,f5,32p,d5,16p,d5,16p,c5,32p,g5,32p,f5,32p,g5,32p,f5";
        const { app, container } = await mountTab();

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = code;
        input.dispatchEvent(new Event("input"));
        await nextTick();

        expect(container.querySelector(".rtttl-code-error")).toBeNull();
        expect(container.querySelector(".rtttl-code-summary").textContent).toContain("28 音符 · 26 休止");
        expect(codeSaveButton(container).disabled).toBe(false);

        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(54);
        expect(container.querySelector(".editor-title strong").textContent).toBe("bluejay");

        app.unmount();
    });

    it("previews staged single-voice RTTTL without saving it to the piano roll", async () => {
        vi.useFakeTimers();
        const starts = [];
        const stop = vi.fn();
        globalThis.AudioContext = class {
            currentTime = 1;
            destination = {};
            resume = vi.fn();
            createOscillator() {
                return {
                    type: "sine",
                    frequency: { value: 0 },
                    connect() {
                        return this;
                    },
                    start: vi.fn((time) => starts.push(time)),
                    stop,
                };
            }
            createGain() {
                return {
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                    connect() {
                        return this;
                    },
                };
            }
        };
        const { app, container } = await mountTab();

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = "Preview:d=4,o=4,b=120:a";
        input.dispatchEvent(new Event("input"));
        await nextTick();

        const playButton = container.querySelector('[aria-label="播放 RTTTL 代码"]');
        expect(playButton.disabled).toBe(false);
        playButton.click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();

        expect(starts).toEqual([1.04]);
        expect(container.querySelector('[aria-label="停止 RTTTL 代码"]')).toBeTruthy();
        expect(container.querySelector(".editor-title strong").textContent).toBe("Two-Tigers");
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(32);

        container.querySelector('[aria-label="停止 RTTTL 代码"]').click();
        await nextTick();
        expect(container.querySelector('[aria-label="播放 RTTTL 代码"]')).toBeTruthy();
        expect(stop).toHaveBeenCalled();
        expect(writeMelody).not.toHaveBeenCalled();

        app.unmount();
    });

    it("keeps the piano roll unchanged when RTTTL code cannot be parsed", async () => {
        const { app, container } = await mountTab();
        const initialNotes = container.querySelectorAll(".esc-melody-note").length;

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = "Broken";
        input.dispatchEvent(new Event("input"));
        await nextTick();

        expect(container.querySelector(".rtttl-code-error").textContent).toContain("代码需要旋律名");
        expect(container.querySelector(".rtttl-code-error").textContent).toContain("卷帘未发生变化");
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(initialNotes);
        expect(container.querySelector('[aria-label="播放 RTTTL 代码"]').disabled).toBe(true);
        expect(codeSaveButton(container).disabled).toBe(true);

        app.unmount();
    });

    it("applies the final staged code as one undo step", async () => {
        const { app, container } = await mountTab();

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = "First:b=120,o=4,d=4:c";
        input.dispatchEvent(new Event("input"));
        await nextTick();
        input.value = "Second:b=120,o=4,d=4:d";
        input.dispatchEvent(new Event("input"));
        await nextTick();

        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(32);
        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("D4");
        container.querySelector('[title="撤销"]').click();
        await nextTick();

        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(32);
        expect(container.querySelector('[title="撤销"]').disabled).toBe(true);

        app.unmount();
    });

    it("saves an RTTTL name-only change and can undo it", async () => {
        const { app, container } = await mountTab();

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = input.value.replace(/^Two-Tigers:/, "Renamed:");
        input.dispatchEvent(new Event("input"));
        await nextTick();

        expect(container.querySelector(".editor-title strong").textContent).toBe("Two-Tigers");
        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelector(".editor-title strong").textContent).toBe("Renamed");

        container.querySelector('[title="撤销"]').click();
        await nextTick();
        expect(container.querySelector(".editor-title strong").textContent).toBe("Two-Tigers");

        app.unmount();
    });

    it("requires explicit discard before closing staged RTTTL changes", async () => {
        const { app, container } = await mountTab();

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = "Discarded:b=120,o=4,d=4:a";
        input.dispatchEvent(new Event("input"));
        await nextTick();

        container.querySelector('.rtttl-code-dialog [aria-label="关闭"]').click();
        await nextTick();
        expect(container.querySelector(".code-discard-confirm")).not.toBeNull();
        findButton(container, "放弃更改并关闭").click();
        await nextTick();
        expect(container.querySelector(".rtttl-code-dialog")).toBeNull();
        expect(container.querySelector(".editor-title strong").textContent).toBe("Two-Tigers");
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(32);

        app.unmount();
    });

    it("reports clipboard permission failures without closing the code dialog", async () => {
        clipboard.writeText.mockImplementation((_text, _onSuccess, onError) => onError(new Error("denied")));
        const { app, container } = await mountTab();

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const copyButton = [...container.querySelectorAll("button")].find((button) =>
            button.textContent.includes("复制"),
        );
        copyButton.click();
        await nextTick();

        expect(container.querySelector(".rtttl-code-dialog")).not.toBeNull();
        expect(container.querySelector(".esc-melody-notice").textContent).toContain("无法复制 RTTTL 代码");

        app.unmount();
    });

    it("loads identical current ESC melodies into the synchronized piano roll", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([64, 64]));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();

        await vi.waitFor(() => {
            expect(container.querySelectorAll(".melody-read-mark.read-loaded")).toHaveLength(2);
        });
        expect(container.querySelector(".device-connection strong").textContent).toContain("STM32F051 · AM32 × 2");
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("sync");
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(0);
        expect(container.querySelector(".current-source-badge")).toBeNull();
        expect(container.querySelector(".editor-title strong").textContent).toBe("ESC 1");
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(1);
        expect(container.querySelector(".esc-melody-note").textContent).toContain("E4");
        expect(container.querySelector(".melody-conflict-notice")).toBeNull();
        expect(container.querySelectorAll(".melody-write-mark")).toHaveLength(2);
        expect(findButton(container, "安全写入").disabled).toBe(false);

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        expect(container.querySelectorAll(".rtttl-code-input")).toHaveLength(1);
        expect(container.querySelector('[aria-label="代码编辑器同步旋律"]').checked).toBe(true);
        expect(container.querySelectorAll(".shared-code-targets span")).toHaveLength(2);

        app.unmount();
    });

    it("switches the open code dialog between one shared editor and isolated channel editors", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([64, 64]));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-read-mark.read-loaded")).toHaveLength(2));
        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();

        expect(container.querySelectorAll(".rtttl-code-input")).toHaveLength(1);
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("sync");
        const dialogToggle = container.querySelector('[aria-label="代码编辑器同步旋律"]');
        expect(dialogToggle.checked).toBe(true);

        const sharedInput = container.querySelector(".rtttl-code-input");
        sharedInput.value = "Shared:b=120,o=4,d=4:c";
        sharedInput.dispatchEvent(new Event("input"));
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("E4");
        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("C4");

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const reopenedDialogToggle = container.querySelector('[aria-label="代码编辑器同步旋律"]');
        expect(reopenedDialogToggle.checked).toBe(true);
        reopenedDialogToggle.click();
        await nextTick();
        expect(container.querySelectorAll(".rtttl-code-card .rtttl-code-input")).toHaveLength(2);
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("independent");

        let inputs = container.querySelectorAll(".rtttl-code-card .rtttl-code-input");
        expect(inputs[0].value).toBe(inputs[1].value);
        inputs[0].value = "Broken";
        inputs[0].dispatchEvent(new Event("input"));
        await nextTick();
        container.querySelector('[aria-label="代码编辑器同步旋律"]').click();
        await nextTick();

        expect(container.querySelector(".sync-confirm-dialog")).toBeNull();
        expect(container.querySelector('[aria-label="代码编辑器同步旋律"]').checked).toBe(false);
        expect(container.querySelector(".esc-melody-notice").textContent).toContain("请先修正 ESC 1");

        inputs[0].value = "Source:b=120,o=4,d=4:d";
        inputs[0].dispatchEvent(new Event("input"));
        await nextTick();
        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("D4");

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        container.querySelector('[aria-label="代码编辑器同步旋律"]').click();
        await nextTick();

        expect(container.querySelector(".sync-confirm-dialog").textContent).toContain("以 ESC 1 为来源");
        findButton(container, "确认应用").click();
        await nextTick();
        expect(container.querySelectorAll(".rtttl-code-input")).toHaveLength(1);
        expect(container.querySelector('[aria-label="代码编辑器同步旋律"]').checked).toBe(true);
        expect(container.querySelector(".rtttl-code-input").value).toContain("d");

        container.querySelector('[aria-label="代码编辑器同步旋律"]').click();
        await nextTick();
        inputs = container.querySelectorAll(".rtttl-code-card .rtttl-code-input");
        expect(inputs).toHaveLength(2);
        expect(inputs[0].value).toBe(inputs[1].value);
        inputs[0].value = "Independent:b=120,o=4,d=4:e";
        inputs[0].dispatchEvent(new Event("input"));
        await nextTick();
        expect(inputs[1].value).not.toBe(inputs[0].value);

        app.unmount();
    });

    it("validates one synchronized RTTTL code against every target firmware and capacity", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const mixedEscs = createWritableEscs([64, 64]);
        mixedEscs[0].firmwareFamily = "bluejay";
        mixedEscs[0].firmwareLabel = "Bluejay";
        mixedEscs.push({
            ...mixedEscs[0],
            id: "esc-2",
            channel: 2,
            firmwareFamily: "ox32",
            firmwareLabel: "OX32",
            capacity: 8,
            currentMelody: createCurrentMelody(2, 64),
        });
        scanEscs.mockResolvedValue(mixedEscs);
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-read-mark.read-loaded")).toHaveLength(3));
        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();

        const input = container.querySelector(".rtttl-code-input");
        input.value = "Mixed:b=120,o=4,d=4:c,e,g";
        input.dispatchEvent(new Event("input"));
        await nextTick();

        const targets = container.querySelectorAll(".shared-code-targets span");
        expect(targets).toHaveLength(3);
        expect(targets[0].textContent).toContain("Bluejay");
        expect(targets[1].textContent).toContain("AM32");
        expect(targets[2].textContent).toContain("OX32");
        expect(targets[2].classList.contains("target-invalid")).toBe(true);
        expect(container.querySelector(".rtttl-code-summary .code-adjust")).not.toBeNull();
        expect(findButton(container, "安全写入").disabled).toBe(false);
        codeSaveButton(container).click();
        await nextTick();
        expect(findButton(container, "安全写入").disabled).toBe(true);

        app.unmount();
    });

    it("keeps different current melodies and undo histories isolated by ESC channel", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 67]));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelector(".melody-conflict-notice")).not.toBeNull());

        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("independent");
        expect(container.querySelector(".editor-channel-tab.active").textContent).toContain("ESC 1");
        expect(container.querySelector(".esc-melody-note").textContent).toContain("C4");

        container.querySelectorAll(".editor-channel-tab")[1].click();
        await nextTick();
        expect(container.querySelector(".editor-channel-tab.active").textContent).toContain("ESC 2");
        expect(container.querySelector(".esc-melody-note").textContent).toContain("G4");

        findEditorButton(container, "休止").click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(2);
        expect(container.querySelectorAll(".editor-channel-tab.dirty")).toHaveLength(1);
        expect(container.querySelectorAll(".melody-dirty-mark")).toHaveLength(1);

        container.querySelectorAll(".editor-channel-tab")[0].click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(1);
        expect(container.querySelector('[title="撤销"]').disabled).toBe(true);

        findButton(container, "应用当前旋律到全部").click();
        await nextTick();
        expect(container.querySelector(".sync-confirm-dialog")).not.toBeNull();
        findButton(container, "确认应用").click();
        await nextTick();
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("sync");
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(0);
        expect(container.querySelector(".current-source-badge")).toBeNull();
        expect(container.querySelectorAll(".melody-write-mark")).toHaveLength(2);

        app.unmount();
    });

    it("shows identified but unreadable channels as disabled editor tabs", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const [readable, unsupported] = createWritableEscs([60, 67]);
        scanEscs.mockResolvedValue([
            readable,
            {
                ...unsupported,
                firmwareFamily: "blheli32",
                firmwareLabel: "BLHeli_32",
                canBackup: false,
                canWrite: false,
                currentMelody: null,
                melodyReadStatus: "unsupported",
                melodyReadError: "当前固件不支持读取开机音乐",
            },
        ]);
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-read-mark")).toHaveLength(2));
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("sync");
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(0);

        toggleArrangement(container);
        await nextTick();

        const tabs = container.querySelectorAll(".editor-channel-tab");
        expect(tabs).toHaveLength(2);
        expect(tabs[0].disabled).toBe(false);
        expect(tabs[1].disabled).toBe(true);
        expect(tabs[1].classList.contains("unavailable")).toBe(true);
        expect(tabs[1].title).toContain("不支持读取");

        app.unmount();
    });

    it("does not replace the piano roll when every current melody is unreadable", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const unreadable = createWritableEscs().map((esc) => ({
            ...esc,
            currentMelody: null,
            melodyReadStatus: "error",
            melodyReadError: "Invalid RTTTL BPM",
        }));
        scanEscs.mockResolvedValue(unreadable);
        const { app, container } = await mountTab();
        const initialNotes = container.querySelectorAll(".esc-melody-note").length;

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-read-mark.read-error")).toHaveLength(2));

        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(initialNotes);
        expect(container.querySelectorAll(".melody-dirty-mark")).toHaveLength(0);
        expect(findButton(container, "安全写入").disabled).toBe(true);

        container.querySelectorAll(".replace-melody-button")[0].click();
        await nextTick();
        expect(container.querySelector(".editor-channel-tab.active").textContent).toContain("ESC 1");
        expect(container.querySelectorAll(".editor-channel-tab:not(:disabled)")).toHaveLength(1);
        expect(container.querySelectorAll(".melody-dirty-mark")).toHaveLength(1);

        app.unmount();
    });

    it("writes only the modified ESC channel after backing up all writable channels", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs([60, 67]);
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (escs) => {
            for (const esc of escs) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(esc.channel + 1);
                esc.backedUp = true;
            }
        });
        writeMelody.mockImplementation(async (targets) => ({ ok: true, written: targets }));
        const { app, container, vm } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelector(".melody-conflict-notice")).not.toBeNull());
        findEditorButton(container, "音符").click();
        await nextTick();
        expect(container.querySelectorAll(".melody-dirty-mark")).toHaveLength(1);

        findButton(container, "安全写入").click();
        await nextTick();
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => expect(container.querySelector(".safety-backup").textContent).toContain("已持久保存"));
        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        findButton(container, "开始写入").click();

        await vi.waitFor(() => expect(writeMelody).toHaveBeenCalledOnce());
        expect(writeMelody.mock.calls[0][0].map((esc) => esc.channel)).toEqual([0]);
        expect(backupEscs.mock.calls[0][0].map((esc) => esc.channel)).toEqual([0, 1]);
        expect(findButton(container, "安全写入").disabled).toBe(true);

        await vi.waitFor(() => expect(container.querySelector("#safety-title").textContent).toBe("写入完成"));
        const completed = container.querySelector('.safety-overlay[aria-labelledby="safety-title"]');
        expect(completed.querySelectorAll(".channel-plan tbody tr")).toHaveLength(1);
        expect(completed.querySelector(".channel-plan tbody tr").textContent).toContain("已完成");
        expect(completed.querySelector(".safety-write-melody").textContent).toContain(scannedEscs[0].editorMelody.name);
        expect(completed.textContent).toContain("已完成 1 路电调写入");
        expect(completed.textContent).not.toContain("将写入");
        expect(completed.textContent).not.toContain("无修改");
        expect(completed.querySelector(".safety-check")).toBeNull();
        expect(completed.querySelector(".safety-backup")).toBeNull();
        expect(completed.querySelectorAll(".safety-dialog-footer button")).toHaveLength(1);
        expect(completed.querySelector(".safety-dialog-footer button").textContent.trim()).toBe("完成");
        await vm.performWrite();
        expect(writeMelody).toHaveBeenCalledOnce();
        completed.querySelector(".safety-dialog-footer button").click();
        await nextTick();
        expect(container.querySelector('.safety-overlay[aria-labelledby="safety-title"]')).toBeNull();
        expect(writeMelody).toHaveBeenCalledOnce();

        app.unmount();
    });

    it("writes every writable ESC separately in synchronized mode even when the melody is unchanged", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs([64, 64]);
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (escs) => {
            for (const esc of escs) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(esc.channel + 1);
                esc.backedUp = true;
            }
        });
        writeMelody.mockImplementation(async (targets) => ({ ok: true, written: targets }));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-write-mark")).toHaveLength(2));
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("sync");
        expect(findButton(container, "安全写入").disabled).toBe(false);
        expect(container.querySelector(".actionbar-status").textContent).toContain("2 路将分别写入");

        findButton(container, "安全写入").click();
        await nextTick();
        expect(container.querySelector(".safety-dialog").textContent).toContain("逐路写入 2 路电调");
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => expect(container.querySelector(".safety-backup").textContent).toContain("已持久保存"));
        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        findButton(container, "开始写入").click();

        await vi.waitFor(() => expect(writeMelody).toHaveBeenCalledOnce());
        const [targets, melodyForEsc] = writeMelody.mock.calls[0];
        expect(targets.map((esc) => esc.channel)).toEqual([0, 1]);
        expect(melodyForEsc(targets[0]).notes[0].midi).toBe(64);
        expect(melodyForEsc(targets[1]).notes[0].midi).toBe(64);
        expect(backupEscs.mock.calls[0][0].map((esc) => esc.channel)).toEqual([0, 1]);

        await vi.waitFor(() => expect(container.querySelector("#safety-title").textContent).toBe("写入完成"));
        const completed = container.querySelector('.safety-overlay[aria-labelledby="safety-title"]');
        expect(completed.textContent).toContain("已完成 2 路电调写入");
        expect(
            [...completed.querySelectorAll(".channel-plan tbody tr td:last-child")].map((cell) =>
                cell.textContent.trim(),
            ),
        ).toEqual(["已完成", "已完成"]);
        expect(completed.textContent).not.toContain("开始写入");
        expect(completed.textContent).not.toContain("取消");
        findButton(container, "完成").click();
        await nextTick();
        findButton(container, "安全写入").click();
        await nextTick();
        expect(container.querySelector("#safety-title").textContent).toBe("写入前安全检查");
        expect(
            container.querySelectorAll('.safety-overlay[aria-labelledby="safety-title"] .safety-check'),
        ).toHaveLength(3);
        expect(findButton(container, "开始写入")).not.toBeNull();
        expect(writeMelody).toHaveBeenCalledOnce();

        app.unmount();
    });

    it("passes each independently edited channel melody into the serial write queue", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs([60, 67]);
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (escs) => {
            for (const esc of escs) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(esc.channel + 1);
                esc.backedUp = true;
            }
        });
        writeMelody.mockImplementation(async (targets) => ({ ok: true, written: targets }));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelector(".melody-conflict-notice")).not.toBeNull());
        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();

        const inputs = container.querySelectorAll(".rtttl-code-card .rtttl-code-input");
        inputs[0].value = "First:b=120,o=4,d=4:d";
        inputs[0].dispatchEvent(new Event("input"));
        inputs[1].value = "Second:b=120,o=4,d=4:a";
        inputs[1].dispatchEvent(new Event("input"));
        await nextTick();
        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelectorAll(".melody-dirty-mark")).toHaveLength(2);

        findButton(container, "安全写入").click();
        await nextTick();
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => expect(container.querySelector(".safety-backup").textContent).toContain("已持久保存"));
        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        findButton(container, "开始写入").click();

        await vi.waitFor(() => expect(writeMelody).toHaveBeenCalledOnce());
        const [targets, melodyForEsc] = writeMelody.mock.calls[0];
        expect(targets.map((esc) => esc.channel)).toEqual([0, 1]);
        expect(melodyForEsc(targets[0]).notes[0].midi).toBe(62);
        expect(melodyForEsc(targets[1]).notes[0].midi).toBe(69);

        app.unmount();
    });

    it("writes without a local EEPROM backup when the safety checks pass", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs();
        scanEscs.mockResolvedValue(scannedEscs);
        writeMelody.mockResolvedValue({ ok: true, written: scannedEscs });
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        findButton(container, "音符").click();
        await nextTick();
        findButton(container, "安全写入").click();
        await nextTick();
        expect(container.querySelector(".safety-backup").textContent).toContain("本地 EEPROM 备份（可选）");
        expect(container.querySelector(".safety-backup small").textContent).toContain("未备份也可写入");

        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        expect(findButton(container, "开始写入").disabled).toBe(false);
        findButton(container, "开始写入").click();

        await vi.waitFor(() => expect(writeMelody).toHaveBeenCalledOnce());
        expect(backupEscs).not.toHaveBeenCalled();
        expect(localStorage.getItem("betaflight.esc-melody.eeprom-backups.v1")).toBeNull();

        app.unmount();
    });

    it("allows EEPROM writing when the optional local backup download fails", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs();
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (escs) => {
            for (const esc of escs) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(0xa5);
                esc.backedUp = true;
            }
        });
        writeMelody.mockResolvedValue({ ok: true, written: scannedEscs });
        URL.createObjectURL.mockImplementation(() => {
            throw new Error("download blocked");
        });
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        findButton(container, "音符").click();
        await nextTick();
        findButton(container, "安全写入").click();
        await nextTick();
        findButton(container, "备份到本机").click();

        await vi.waitFor(() =>
            expect(container.querySelector(".esc-melody-notice").textContent).toContain("download blocked"),
        );
        expect(container.querySelector(".safety-backup small").textContent).toContain("未备份也可写入");

        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        expect(findButton(container, "开始写入").disabled).toBe(false);
        findButton(container, "开始写入").click();
        await vi.waitFor(() => expect(writeMelody).toHaveBeenCalledOnce());

        app.unmount();
    });

    it("preserves each scanned current-music snapshot after a one-track preset synchronizes ESCs", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 67]));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(2));

        expect(container.querySelector(".current-source-badge").textContent).toContain("ESC 1");
        findButton(container, "Two-Tigers").click();
        await nextTick();
        expect(container.querySelector(".current-melody-item").classList.contains("active")).toBe(false);
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("sync");

        toggleArrangement(container);
        await nextTick();
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(2);

        container.querySelectorAll(".editor-channel-tab")[1].click();
        await nextTick();
        expect(container.querySelector(".current-source-badge").textContent).toContain("ESC 2");
        findButton(container, "当前音乐").click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("G4");
        expect(container.querySelector(".current-melody-item").classList.contains("active")).toBe(true);

        app.unmount();
    });

    it("keeps each valid multi-channel RTTTL entry isolated when synchronization is off", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([64, 64]));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-read-mark.read-loaded")).toHaveLength(2));
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(0);
        expect(container.querySelector(".current-source-badge")).toBeNull();
        toggleArrangement(container);
        await nextTick();
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("independent");
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(2);
        expect(container.querySelector(".current-source-badge").textContent).toContain("ESC 1");
        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();

        const inputs = container.querySelectorAll(".rtttl-code-card .rtttl-code-input");
        expect(inputs).toHaveLength(2);
        inputs[1].value = "Broken";
        inputs[1].dispatchEvent(new Event("input"));
        await nextTick();

        expect(container.querySelectorAll(".rtttl-code-error")).toHaveLength(1);
        expect(container.querySelector('[aria-label="代码编辑器同步旋律"]').checked).toBe(false);
        expect(container.querySelector(".esc-melody-note").textContent).toContain("E4");

        inputs[0].value = "First:b=120,o=4,d=4:c";
        inputs[0].dispatchEvent(new Event("input"));
        await nextTick();

        expect(container.querySelector('[aria-label="代码编辑器同步旋律"]').checked).toBe(false);
        expect(container.querySelector(".esc-melody-note").textContent).toContain("E4");
        expect(container.querySelectorAll(".editor-channel-tab.dirty")).toHaveLength(0);
        expect(container.querySelector(".rtttl-code-dialog")).not.toBeNull();
        expect(codeSaveButton(container).disabled).toBe(true);

        inputs[1].value = "Second:b=120,o=4,d=4:a";
        inputs[1].dispatchEvent(new Event("input"));
        await nextTick();
        expect(codeSaveButton(container).disabled).toBe(false);
        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("C4");
        expect(container.querySelectorAll(".editor-channel-tab.dirty")).toHaveLength(2);
        container.querySelector('[title="撤销"]').click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("E4");

        container.querySelectorAll(".editor-channel-tab")[1].click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("A4");
        expect(container.querySelector('[title="撤销"]').disabled).toBe(false);
        container.querySelector('[title="撤销"]').click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("E4");

        app.unmount();
    });

    it("allows over-capacity multi-channel code into the roll while keeping writing invalid", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([64, 64]));
        const overCapacityCode = `Large:b=120,o=4,d=16:${Array(65).fill("c").join(",")}`;
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-read-mark.read-loaded")).toHaveLength(2));
        toggleArrangement(container);
        await nextTick();
        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();

        const inputs = container.querySelectorAll(".rtttl-code-card .rtttl-code-input");
        for (const input of inputs) {
            input.value = overCapacityCode;
            input.dispatchEvent(new Event("input"));
        }
        await nextTick();

        expect(container.querySelectorAll(".code-adjust")).toHaveLength(2);
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(1);
        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(65);
        expect(container.querySelector(".validation-badge").textContent).toContain("需调整");
        expect(findButton(container, "安全写入").disabled).toBe(true);

        app.unmount();
    });

    it("regenerates RTTTL from piano-roll edits when the code editor opens again", async () => {
        const { app, container } = await mountTab();
        const initialNoteCount = container.querySelectorAll(".esc-melody-note").length;

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const initialCode = container.querySelector(".rtttl-code-input").value;
        codeSaveButton(container).click();
        await nextTick();

        findEditorButton(container, "音符").click();
        await nextTick();
        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();

        expect(container.querySelector(".rtttl-code-input").value).not.toBe(initialCode);
        expect(container.querySelector(".rtttl-code-summary").textContent).toContain(`${initialNoteCount + 1} 音符`);

        app.unmount();
    });

    it("copies and pastes RTTTL independently for a selected code card", async () => {
        clipboard.readText.mockImplementation((onSuccess) => onSuccess("Pasted:b=120,o=4,d=4:a"));
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 67]));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(2));
        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();

        container.querySelector('[aria-label="粘贴 ESC 1 代码"]').click();
        await nextTick();
        const inputs = container.querySelectorAll(".rtttl-code-card .rtttl-code-input");
        expect(inputs[0].value).toBe("Pasted:b=120,o=4,d=4:a");
        expect(inputs[1].value).not.toBe(inputs[0].value);
        expect(container.querySelector(".esc-melody-note").textContent).toContain("C4");

        container.querySelector('[aria-label="复制 ESC 1 代码"]').click();
        expect(clipboard.writeText.mock.calls[0][0]).toBe(inputs[0].value);
        codeSaveButton(container).click();
        await nextTick();
        expect(container.querySelector(".esc-melody-note").textContent).toContain("A4");

        app.unmount();
    });

    it("starts every valid channel preview at the same Web Audio time and stops them together", async () => {
        const startTimes = [];
        const stops = [];
        globalThis.AudioContext = class {
            currentTime = 2;
            destination = {};
            resume = vi.fn();
            createOscillator() {
                const stop = vi.fn();
                stops.push(stop);
                return {
                    type: "sine",
                    frequency: { value: 0 },
                    connect() {
                        return this;
                    },
                    start: vi.fn((time) => startTimes.push(time)),
                    stop,
                };
            }
            createGain() {
                return {
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                    connect() {
                        return this;
                    },
                };
            }
        };
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs([60, 67]));
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(2));
        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();

        findButton(container, "播放全部").click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();
        expect(startTimes).toHaveLength(2);
        expect(new Set(startTimes)).toEqual(new Set([2.04]));
        expect(findButton(container, "停止全部")).toBeTruthy();
        findButton(container, "停止全部").click();
        await nextTick();
        expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
        expect(writeMelody).not.toHaveBeenCalled();

        app.unmount();
    });

    it("keeps EEPROM file restoration disabled until a connected scan completes", async () => {
        const offline = await mountTab();
        const offlineRestoreButton = findButton(offline.container, "恢复 EEPROM");

        expect(offlineRestoreButton.disabled).toBe(true);
        offline.app.unmount();

        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs());
        const { app, container } = await mountTab();
        const restoreButton = findButton(container, "恢复 EEPROM");

        expect(restoreButton.disabled).toBe(true);
        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(restoreButton.disabled).toBe(false));

        app.unmount();
    });

    it("imports a v1 backup and disables channels whose strict identity does not match", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs();
        const restorePackage = createRestorePackage(scannedEscs);
        scannedEscs[1].version = "2.00";
        scanEscs.mockResolvedValue(scannedEscs);
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        await selectRestoreFile(container, restorePackage);

        const cards = [...container.querySelectorAll(".restore-match-card")];
        expect(cards).toHaveLength(2);
        expect(cards[0].textContent).toContain("身份匹配");
        expect(cards[0].querySelector("input").checked).toBe(true);
        expect(cards[1].textContent).toContain("固件版本");
        expect(cards[1].querySelector("input").disabled).toBe(true);
        expect(container.querySelector(".restore-dialog").textContent).toContain("1/1 路已选择");

        app.unmount();
    });

    it("rejects an invalid EEPROM backup file without opening the restore dialog", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs());
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        await selectRestoreFile(container, "{", "broken.json");

        expect(container.querySelector(".restore-dialog")).toBeNull();
        expect(container.querySelector(".esc-melody-notice").textContent).toContain("不是有效的 JSON");

        app.unmount();
    });

    it("requires a freshly persisted and downloaded current-state backup before restoring selected channels", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs([60, 60]);
        const restorePackage = createRestorePackage(scannedEscs);
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (targets) => {
            for (const esc of targets) {
                esc.backedUp = true;
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(0x70 + esc.channel);
            }
            return targets.map((esc) => esc.originalEeprom);
        });
        restoreBackup.mockImplementation(async (targets) => {
            const leaving = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(leaving);
            expect(leaving.defaultPrevented).toBe(true);
            for (const { esc } of targets) {
                esc.currentMelody = createCurrentMelody(esc.channel, 72 + esc.channel);
                esc.melodyReadStatus = "loaded";
            }
            const restored = targets.map(({ esc }) => esc);
            return { ok: true, restored, rollback: restored };
        });
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        await selectRestoreFile(container, restorePackage);

        const startRestore = findButton(container, "开始恢复");
        expect(startRestore.disabled).toBe(true);
        findButton(container, "备份当前状态").click();
        await vi.waitFor(() =>
            expect(container.querySelector(".safety-backup").textContent).toMatch(/已(?:持久)?保存并下载/),
        );
        await vi.waitFor(() =>
            expect(container.querySelector(".restore-current-backup").textContent).toMatch(/已(?:持久)?保存并下载/),
        );
        expect(startRestore.disabled).toBe(true);

        for (const input of container.querySelectorAll(".restore-safety-section .safety-check input:not([disabled])")) {
            input.click();
        }
        await nextTick();
        expect(startRestore.disabled).toBe(false);
        startRestore.click();
        await vi.waitFor(() => expect(restoreBackup).toHaveBeenCalledOnce());

        expect(restoreBackup.mock.calls[0][0].map(({ esc }) => esc.channel)).toEqual([0, 1]);
        await vi.waitFor(() =>
            expect(container.querySelector(".restore-result")?.textContent).toContain("EEPROM 恢复完成"),
        );
        expect(container.querySelector(".restore-result").textContent).toContain("2 路电调");
        expect(scannedEscs.every((esc) => esc.backedUp === false)).toBe(true);
        expect(scannedEscs.every((esc) => esc.melodyDirty === false)).toBe(true);
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(2);
        expect(container.querySelector('[aria-label="编排方式"]').value).toBe("independent");
        expect(localStorage.getItem("betaflight.esc-melody.eeprom-backups.v1")).toBeTruthy();

        app.unmount();
    });

    it("keeps the physical restore safety confirmations checked while backing up the current state", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs();
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (escs) => {
            for (const esc of escs) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(esc.channel + 1);
                esc.backedUp = true;
            }
        });
        const restorePackage = createRestorePackage(scannedEscs);
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        await selectRestoreFile(container, restorePackage);

        const safetyInputs = container.querySelectorAll(".restore-safety-section .safety-check input");
        for (const input of [...safetyInputs].slice(0, 3)) input.click();
        await nextTick();
        expect([...safetyInputs].slice(0, 3).every((input) => input.checked)).toBe(true);

        findButton(container, "备份当前状态").click();
        await vi.waitFor(() =>
            expect(container.querySelector(".safety-backup").textContent).toMatch(/已(?:持久)?保存并下载/),
        );
        await vi.waitFor(() => expect(safetyInputs[3].checked).toBe(true));

        expect([...safetyInputs].slice(0, 3).every((input) => input.checked)).toBe(true);
        expect(findButton(container, "开始恢复").disabled).toBe(false);

        app.unmount();
    });

    it("blocks restoration when the mandatory current-state backup download fails", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs();
        const restorePackage = createRestorePackage(scannedEscs);
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (targets) => {
            for (const esc of targets) {
                esc.backedUp = true;
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(0x50 + esc.channel);
            }
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
            throw new Error("restore download blocked");
        });
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        await selectRestoreFile(container, restorePackage);
        findButton(container, "备份当前状态").click();
        await vi.waitFor(() =>
            expect(container.querySelector(".esc-melody-notice").textContent).toContain("restore download blocked"),
        );

        expect(findButton(container, "开始恢复").disabled).toBe(true);
        expect(restoreBackup).not.toHaveBeenCalled();

        app.unmount();
    });

    it("recovers an erased first channel even when no channel completed writing", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scanned = createWritableEscs([60]);
        scanEscs.mockResolvedValue(scanned);
        backupEscs.mockImplementation(async (targets) => {
            for (const esc of targets) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(0x42);
                esc.backedUp = true;
            }
        });
        writeMelody.mockImplementation(async ([esc]) => ({
            ok: false,
            written: [],
            failed: esc,
            rollback: [esc],
            error: new Error("failed after erase"),
        }));
        recoverEscs.mockImplementation(async (targets) => targets);
        const { app, container } = await mountTab();
        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelectorAll(".melody-write-mark")).toHaveLength(1));
        findButton(container, "安全写入").click();
        await nextTick();
        findButton(container, "备份到本机").click();
        await vi.waitFor(() =>
            expect(container.querySelector(".safety-backup").textContent).toMatch(/已(?:持久)?保存并下载/),
        );
        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        findButton(container, "开始写入").click();
        await vi.waitFor(() => expect(container.querySelector(".write-failure")).not.toBeNull());
        expect(findButton(container, "恢复受影响通道").disabled).toBe(false);
        expect(findButton(container, "开始写入").disabled).toBe(true);
        expect(findButton(container, "备份到本机").disabled).toBe(true);

        container.querySelector('.safety-overlay[aria-labelledby="safety-title"] [aria-label="关闭"]').click();
        await nextTick();
        findButton(container, "安全写入").click();
        await nextTick();
        expect(findButton(container, "恢复受影响通道").disabled).toBe(false);
        findButton(container, "恢复受影响通道").click();
        await vi.waitFor(() => expect(recoverEscs).toHaveBeenCalledOnce());
        expect(recoverEscs.mock.calls[0][0].map((esc) => esc.channel)).toEqual([0]);
        await vi.waitFor(() => expect(container.querySelector(".write-failure")).toBeNull());
        // Recovery clears the destroyed local backup state but no longer blocks a retry.
        expect(findButton(container, "备份到本机").disabled).toBe(false);
        expect(findButton(container, "开始写入").disabled).toBe(false);
        app.unmount();
    });

    it("offers rollback for all touched channels after a partial EEPROM restore failure", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs([60, 67]);
        const restorePackage = createRestorePackage(scannedEscs);
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (targets) => {
            for (const esc of targets) {
                esc.backedUp = true;
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(0x60 + esc.channel);
            }
        });
        restoreBackup.mockImplementation(async (targets) => ({
            ok: false,
            restored: [targets[0].esc],
            failed: targets[1].esc,
            rollback: [targets[0].esc, targets[1].esc],
            error: new Error("read-back mismatch"),
        }));
        recoverEscs.mockImplementation(async (targets) => targets);
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        await selectRestoreFile(container, restorePackage);
        findButton(container, "备份当前状态").click();
        await vi.waitFor(() =>
            expect(container.querySelector(".safety-backup").textContent).toMatch(/已(?:持久)?保存并下载/),
        );
        await vi.waitFor(() =>
            expect(container.querySelector(".restore-current-backup").textContent).toMatch(/已(?:持久)?保存并下载/),
        );
        for (const input of container.querySelectorAll(".restore-safety-section .safety-check input:not([disabled])")) {
            input.click();
        }
        await nextTick();
        expect(findButton(container, "开始恢复").disabled).toBe(false);
        findButton(container, "开始恢复").click();
        await vi.waitFor(() => expect(restoreBackup).toHaveBeenCalledOnce());

        await vi.waitFor(() => expect(container.querySelector(".restore-result")?.textContent).toContain("恢复已停止"));
        findButton(container, "回滚本次恢复").click();
        await vi.waitFor(() => expect(recoverEscs).toHaveBeenCalledOnce());
        expect(recoverEscs.mock.calls[0][0].map((esc) => esc.channel)).toEqual([0, 1]);
        await vi.waitFor(() =>
            expect(container.querySelector(".restore-result")?.textContent).toContain("本次恢复已回滚"),
        );

        app.unmount();
    });
});

async function createNamedDraft(container, name) {
    container.querySelector('button[aria-label="新建草稿"]').click();
    await nextTick();
    const input = container.querySelector("#esc-melody-draft-name");
    input.value = name;
    input.dispatchEvent(new Event("input"));
    await nextTick();
    findButton(container, "创建").click();
    await nextTick();
}

function findButton(container, text) {
    return [...container.querySelectorAll("button")].find((button) => button.textContent.includes(text));
}

function findEditorButton(container, text) {
    return [...container.querySelectorAll(".editor-actions button")].find((button) =>
        button.textContent.includes(text),
    );
}

function codeSaveButton(container) {
    return container.querySelector('.rtttl-code-footer [aria-label="保存 RTTTL 代码"]');
}

function createWritableEscs(pitches = [60, 60]) {
    return Array.from({ length: pitches.length }, (_, channel) => ({
        id: `esc-${channel}`,
        channel,
        model: "STM32F051",
        firmwareFamily: "am32",
        firmwareLabel: "AM32",
        version: "1.99",
        layout: "Flash EEPROM",
        signature: 0x1f06,
        interfaceMode: 4,
        inputPin: 2,
        settingsOffset: 0x7c00,
        settingsLength: 0xb0,
        melodyRelativeOffset: 0x30,
        status: "ready",
        canBackup: true,
        canWrite: true,
        capacity: 128,
        backedUp: false,
        melodyReadStatus: "loaded",
        currentMelody: createCurrentMelody(channel, pitches[channel] ?? pitches[0]),
    }));
}

function createCurrentMelody(channel, midi) {
    return {
        name: `ESC ${channel + 1}`,
        bpm: 120,
        key: "C",
        waitMs: 0,
        notes: [{ id: `current-${channel}`, midi, start: 0, duration: 1, rest: false }],
    };
}

function createRestorePackage(escs) {
    return createEscBackupPackage(
        escs.map((esc) => ({
            ...esc,
            backedUp: true,
            originalEeprom: new Uint8Array(esc.settingsLength).fill(0x20 + esc.channel),
        })),
        { id: "restore-file-test", now: new Date("2026-07-26T09:00:00.000Z") },
    );
}

async function selectRestoreFile(container, contents, filename = "betaflight-esc-eeprom-test.json") {
    const input = container.querySelector(".restore-file-input");
    const body = typeof contents === "string" ? contents : JSON.stringify(contents);
    const file = new File([body], filename, { type: "application/json" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => {
        if (typeof contents === "string") {
            expect(container.querySelector(".esc-melody-notice")).toBeTruthy();
        } else {
            expect(container.querySelector(".restore-dialog")).toBeTruthy();
        }
    });
}

function toggleArrangement(container) {
    const select = container.querySelector('[aria-label="编排方式"]');
    select.value = select.value === "sync" ? "independent" : "sync";
    select.dispatchEvent(new Event("change"));
}
