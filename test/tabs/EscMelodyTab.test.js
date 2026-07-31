import { createApp, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEscBackupPackage } from "../../src/js/esc_melody/backups.js";

const contentReady = vi.fn();
const scanEscs = vi.hoisted(() => vi.fn());
const backupEscs = vi.hoisted(() => vi.fn());
const writeMelody = vi.hoisted(() => vi.fn());
const restoreBackup = vi.hoisted(() => vi.fn());
const recoverEscs = vi.hoisted(() => vi.fn());
const clipboard = vi.hoisted(() => ({ readText: vi.fn(), writeText: vi.fn() }));

vi.mock("../../src/js/gui.js", () => ({
    default: { active_tab: null, connect_lock: false, content_ready: contentReady },
}));

vi.mock("../../src/js/esc_melody/esc_four_way_controller.js", () => ({
    EscFourWayController: class {
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
        vi.stubGlobal("URL", {
            createObjectURL: vi.fn(() => "blob:esc-backup"),
            revokeObjectURL: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        delete globalThis.AudioContext;
        delete globalThis.CONFIGURATOR;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function mountTab() {
        const { default: EscMelodyTab } = await import("../../src/components/tabs/EscMelodyTab.vue");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const app = createApp(EscMelodyTab);
        app.mount(container);
        await nextTick();
        return { app, container };
    }

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
        expect(container.querySelector(".esc-melody-sidebar > .esc-scan-panel")).not.toBeNull();
        expect(container.querySelector(".esc-melody-header .esc-melody-connection")).toBeNull();
        const workflowSteps = container.querySelectorAll(".esc-melody-workflow-step");
        expect(workflowSteps).toHaveLength(3);
        expect([...workflowSteps].map((step) => step.textContent.trim())).toEqual([
            "1扫描电调",
            "2选择 / 编辑音乐",
            "3安全写入",
        ]);
        expect(container.querySelector('[aria-label="扫描电调"]').disabled).toBe(true);
        expect(safetyButton.disabled).toBe(true);
        expect(container.querySelector(".safety-write-blocker").textContent).toContain("请先连接飞控");
        addRestButton.click();
        await nextTick();
        expect(container.querySelectorAll(".esc-melody-note")).toHaveLength(initialNotes + 1);
        expect(contentReady).toHaveBeenCalledOnce();

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
        await vi.waitFor(() => expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(true));

        const search = container.querySelector('[aria-label="搜索旋律库"]');
        search.value = "Bad Apple";
        search.dispatchEvent(new Event("input"));
        await nextTick();

        const results = container.querySelectorAll(".melody-preset-list .melody-list-item");
        expect(results).toHaveLength(1);
        expect(results[0].textContent).toContain("4 声部");
        results[0].click();
        await nextTick();

        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(false);
        expect(container.querySelector('[aria-label="页面同步旋律"]').disabled).toBe(true);
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
        await vi.waitFor(() => expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(false));

        const search = container.querySelector('[aria-label="搜索旋律库"]');
        search.value = "Bad Apple";
        search.dispatchEvent(new Event("input"));
        await nextTick();
        container.querySelector(".melody-preset-list .melody-list-item").click();
        await nextTick();
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(false);

        search.value = "Two-Tigers";
        search.dispatchEvent(new Event("input"));
        await nextTick();
        container.querySelector(".melody-preset-list .melody-list-item").click();
        await nextTick();

        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(true);
        expect(container.querySelectorAll(".preset-track-tab")).toHaveLength(0);
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(0);
        expect(container.querySelectorAll(".melody-write-mark")).toHaveLength(4);
        expect(container.querySelector(".actionbar-status").textContent).toContain("4 路将分别写入");

        findButton(container, "安全写入").click();
        await nextTick();
        expect(container.querySelector(".safety-write-melody").textContent).toContain("Two-Tigers");
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => expect(backupEscs).toHaveBeenCalledOnce());
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
            button.textContent.includes("单路播放"),
        );

        previewButton.click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();
        expect(previewButton.textContent).toContain("停止单路");
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
        expect(previewButton.textContent).toContain("单路播放");
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

        const playAllButton = findButton(container, "全部播放");
        expect(playAllButton.disabled).toBe(false);
        playAllButton.click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();

        expect(startTimes).toHaveLength(2);
        expect(new Set(startTimes)).toEqual(new Set([3.04]));
        expect(playAllButton.textContent).toContain("停止全部");

        playAllButton.click();
        await Promise.resolve();
        await Promise.resolve();
        await nextTick();
        expect(playAllButton.textContent).toContain("全部播放");
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
            expect(container.querySelector(".esc-scan-copy small").textContent).toBe("0 路电调已识别");
            expect(container.querySelector(".esc-melody-notice").textContent).toContain("未识别到电调");
        });
        expect(container.querySelector(".esc-scan-count").textContent).toContain("0 路");
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

    it("discards staged RTTTL changes when the dialog is closed", async () => {
        const { app, container } = await mountTab();

        container.querySelector('[title="RTTTL 代码"]').click();
        await nextTick();
        const input = container.querySelector(".rtttl-code-input");
        input.value = "Discarded:b=120,o=4,d=4:a";
        input.dispatchEvent(new Event("input"));
        await nextTick();

        container.querySelector('.rtttl-code-dialog [aria-label="关闭"]').click();
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
        expect(container.querySelector(".esc-scan-models").textContent).toContain("当前型号");
        expect(container.querySelector(".esc-scan-models").textContent).toContain("STM32F051 · AM32 × 2");
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(true);
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
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(true);
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
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(false);

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

        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(false);
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
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(true);
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
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(true);
        expect(container.querySelectorAll(".editor-channel-tab")).toHaveLength(0);

        container.querySelector('[aria-label="页面同步旋律"]').click();
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
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(container.querySelector(".melody-conflict-notice")).not.toBeNull());
        findEditorButton(container, "音符").click();
        await nextTick();
        expect(container.querySelectorAll(".melody-dirty-mark")).toHaveLength(1);

        findButton(container, "安全写入").click();
        await nextTick();
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => expect(backupEscs).toHaveBeenCalledOnce());
        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        findButton(container, "开始写入").click();

        await vi.waitFor(() => expect(writeMelody).toHaveBeenCalledOnce());
        expect(writeMelody.mock.calls[0][0].map((esc) => esc.channel)).toEqual([0]);
        expect(backupEscs.mock.calls[0][0].map((esc) => esc.channel)).toEqual([0, 1]);
        expect(findButton(container, "安全写入").disabled).toBe(true);

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
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(true);
        expect(findButton(container, "安全写入").disabled).toBe(false);
        expect(container.querySelector(".actionbar-status").textContent).toContain("2 路将分别写入");

        findButton(container, "安全写入").click();
        await nextTick();
        expect(container.querySelector(".safety-dialog").textContent).toContain("逐路写入 2 路电调");
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => expect(backupEscs).toHaveBeenCalledOnce());
        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        findButton(container, "开始写入").click();

        await vi.waitFor(() => expect(writeMelody).toHaveBeenCalledOnce());
        const [targets, melodyForEsc] = writeMelody.mock.calls[0];
        expect(targets.map((esc) => esc.channel)).toEqual([0, 1]);
        expect(melodyForEsc(targets[0]).notes[0].midi).toBe(64);
        expect(melodyForEsc(targets[1]).notes[0].midi).toBe(64);
        expect(backupEscs.mock.calls[0][0].map((esc) => esc.channel)).toEqual([0, 1]);

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
        await vi.waitFor(() => expect(backupEscs).toHaveBeenCalledOnce());
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

    it("requires a downloaded and persisted local backup before every EEPROM write", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        const scannedEscs = createWritableEscs();
        scanEscs.mockResolvedValue(scannedEscs);
        backupEscs.mockImplementation(async (escs) => {
            for (const esc of escs) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(esc.channel + 1);
                esc.backedUp = true;
            }
        });
        writeMelody.mockResolvedValue({ ok: true, written: scannedEscs });
        const { app, container } = await mountTab();

        findButton(container, "扫描电调").click();
        await vi.waitFor(() => expect(scanEscs).toHaveBeenCalledOnce());
        findButton(container, "音符").click();
        await nextTick();
        findButton(container, "安全写入").click();
        await nextTick();
        findButton(container, "备份到本机").click();
        await vi.waitFor(() => {
            expect(backupEscs).toHaveBeenCalledOnce();
            expect(container.querySelector(".esc-melody-notice").textContent).toContain("已保存到本地历史并下载");
        });

        expect(URL.createObjectURL).toHaveBeenCalledOnce();
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
        const storedBackups = JSON.parse(localStorage.getItem("betaflight.esc-melody.eeprom-backups.v1"));
        expect(storedBackups).toHaveLength(1);
        expect(storedBackups[0].escs).toHaveLength(2);

        for (const input of container.querySelectorAll(".safety-check input:not([disabled])")) input.click();
        await nextTick();
        const writeButton = findButton(container, "开始写入");
        expect(writeButton.disabled).toBe(false);

        localStorage.clear();
        writeButton.click();
        await vi.waitFor(() =>
            expect(container.querySelector(".esc-melody-notice").textContent).toContain("本地 EEPROM 备份校验失败"),
        );
        expect(writeMelody).not.toHaveBeenCalled();
        expect(findButton(container, "开始写入").disabled).toBe(true);

        app.unmount();
    });

    it("keeps EEPROM writing disabled when the mandatory backup download fails", async () => {
        globalThis.CONFIGURATOR.connectionValid = true;
        scanEscs.mockResolvedValue(createWritableEscs());
        backupEscs.mockImplementation(async (escs) => {
            for (const esc of escs) {
                esc.originalEeprom = new Uint8Array(esc.settingsLength).fill(0xa5);
                esc.backedUp = true;
            }
        });
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
        expect(findButton(container, "开始写入").disabled).toBe(true);
        expect(container.querySelector(".safety-backup small").textContent).toContain("必须读取全部可写电调");
        expect(writeMelody).not.toHaveBeenCalled();

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
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(true);

        container.querySelector('[aria-label="页面同步旋律"]').click();
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
        container.querySelector('[aria-label="页面同步旋律"]').click();
        await nextTick();
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(false);
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
        container.querySelector('[aria-label="页面同步旋律"]').click();
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
        await vi.waitFor(() => expect(backupEscs).toHaveBeenCalledOnce());
        await vi.waitFor(() =>
            expect(container.querySelector(".restore-current-backup").textContent).toContain("已保存并下载"),
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
        expect(container.querySelector('[aria-label="页面同步旋律"]').checked).toBe(false);
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
        await vi.waitFor(() => expect(backupEscs).toHaveBeenCalledOnce());
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
        await vi.waitFor(() => expect(backupEscs).toHaveBeenCalledOnce());
        await vi.waitFor(() =>
            expect(container.querySelector(".restore-current-backup").textContent).toContain("已保存并下载"),
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
