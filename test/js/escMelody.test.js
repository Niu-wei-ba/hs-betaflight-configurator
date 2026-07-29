import CryptoES from "crypto-es";
import { describe, expect, it } from "vitest";
import {
    ESC_CONFIGURATOR_PRESETS,
    ESC_MELODY_MAX_MIDI,
    ESC_MELODY_MIN_MIDI,
    PRESET_MELODIES,
    encodeFirmwareMelody,
    decodeFirmwareMelody,
    melodiesEqual,
    melodyFingerprint,
    melodyToRtttl,
    rtttlToMelody,
    validateMelody,
} from "../../src/js/esc_melody/melody.js";
import {
    createEscRecord,
    decodeEscInfo,
    ESC_FIRMWARE,
    ESC_MELODY_READ_STATUS,
    getIdentifiedEscCount,
} from "../../src/js/esc_melody/esc_capabilities.js";
import { EscFourWayController, patchSettingsImage } from "../../src/js/esc_melody/esc_four_way_controller.js";
import {
    createMelodyDraft,
    createMelodyDraftPackage,
    deleteMelodyDraft,
    duplicateMelodyDraft,
    ESC_MELODY_DRAFT_LIMIT,
    importMelodyDraftPackage,
    loadMelodyDrafts,
    parseMelodyDraftPackage,
    saveMelodyDraft,
} from "../../src/js/esc_melody/drafts.js";
import {
    createEscBackupPackage,
    decodeEscBackupEntry,
    ESC_EEPROM_BACKUPS_KEY,
    ESC_EEPROM_BACKUP_FILE_MAX_BYTES,
    ESC_EEPROM_BACKUP_HISTORY_LIMIT,
    getEscRestoreIdentityErrors,
    getPersistedEscBackupStatus,
    loadEscBackups,
    matchEscBackupForRestore,
    parseEscBackupFile,
    saveEscBackup,
    validateEscBackup,
} from "../../src/js/esc_melody/backups.js";
import {
    createFourWayMessage,
    createFourWayResponse,
    parseFourWayMessages,
    crc16Xmodem,
    FOUR_WAY_ACK,
    FOUR_WAY_COMMANDS,
    FourWaySession,
} from "../../src/js/esc_melody/four_way.js";
import {
    createOx32ChecksumTrailer,
    getOx32Layout,
    OX32_HANDSHAKE_LENGTH,
    OX32_HANDSHAKE_OFFSET,
    OX32_SETTINGS_LENGTH,
    parseOx32Handshake,
    verifyOx32License,
} from "../../src/js/esc_melody/ox32.js";

describe("ESC melody model", () => {
    it("includes Two Tigers as a valid built-in preset", () => {
        const preset = PRESET_MELODIES.find((melody) => melody.id === "two-tigers");
        const validation = validateMelody(preset);

        expect(preset).toMatchObject({
            name: "Two-Tigers",
            description: "两只老虎",
            bpm: 125,
            key: "D",
        });
        expect(preset.notes).toHaveLength(32);
        expect(validation.valid).toBe(true);
        expect(melodyToRtttl(preset)).toContain("Two-Tigers:");
        const presetNames = PRESET_MELODIES.map((melody) => melody.name);
        expect(presetNames).not.toContain("Ascending");
        expect(presetNames).not.toContain("Beacon");
        expect(presetNames).not.toContain("Soft landing");
    });

    it("loads the complete ESC Configurator preset collection into the piano-roll range", () => {
        const tracks = ESC_CONFIGURATOR_PRESETS.flatMap((preset) => preset.trackMelodies);
        const pitchedNotes = tracks.flatMap((melody) => melody.notes.filter((note) => !note.rest));

        expect(ESC_CONFIGURATOR_PRESETS).toHaveLength(107);
        expect(tracks).toHaveLength(307);
        expect(ESC_CONFIGURATOR_PRESETS.find((preset) => preset.name === "Undertale OST - Bonetrousle")).toMatchObject({
            source: "esc-configurator",
            tracks: expect.any(Array),
        });
        expect(pitchedNotes.every((note) => note.midi >= ESC_MELODY_MIN_MIDI && note.midi <= ESC_MELODY_MAX_MIDI)).toBe(
            true,
        );
        expect(tracks.some((track) => track.notes.some((note) => note.duration < 0.125))).toBe(true);
    });

    it("round trips RTTTL notes, rests, dots and tempo", () => {
        const melody = rtttlToMelody("startup:d=8,o=5,b=144:4c5,8p,8g5.,16a5");
        expect(melody.bpm).toBe(144);
        expect(melody.notes).toHaveLength(4);
        expect(melody.notes[1].rest).toBe(true);
        expect(melodyToRtttl(melody)).toContain("b=144");
        expect(melodyToRtttl(melody)).toContain("p");
    });

    it("normalizes the extended RTTTL dialect accepted by ESC Configurator", () => {
        const code =
            "bluejay:b=55,o=4,d=32:d5,32p,d5,32p,c5,32p,c5,32p,g,p,p,26f5,32p,g5#,32p,f5,16p,f5,16p,c5,16p,g,16p,c5,32p,f5#,32p,d5,d5,16p,d5,d5,16p,g#,64p,g#,32p,d5,32p,f5,32p,d5,16p,d5,16p,c5,32p,g5,32p,f5,32p,g5,32p,f5";
        const imported = rtttlToMelody(code);
        const exported = melodyToRtttl(imported);
        const restored = rtttlToMelody(exported);
        const validation = validateMelody(imported);

        expect(imported).toMatchObject({ name: "bluejay", bpm: 55 });
        expect(imported.notes).toHaveLength(54);
        expect(imported.notes[11]).toMatchObject({ midi: 77, duration: 0.125 });
        expect(imported.notes[13]).toMatchObject({ midi: 80, duration: 0.125 });
        expect(imported.notes[25]).toMatchObject({ midi: 78, duration: 0.125 });
        expect(exported).not.toContain("26f");
        expect(exported).not.toContain("g5#");
        expect(melodiesEqual(restored, imported)).toBe(true);
        expect(validation).toMatchObject({ valid: true, encodedLength: 128 });
    });

    it("imports the supplied RTTTL code without changing its tempo or high notes", () => {
        const code =
            "Melody:b=150,o=5,d=16:c5,p,g5,p,c6,p,d#6,p,8p,c6,p,8p,b5,p,c6,p,d6,p,8p,c6,p,g5,p,d#5,p,c5,p,d5,p,d#5,p,f#5,p,8p,g5,p,d#5,p,c5,p,g4,p,b4,p,c5,p,d5,p,8p,c5";
        const imported = rtttlToMelody(code);
        const validation = validateMelody(imported);

        expect(imported).toMatchObject({ name: "Melody", bpm: 150, waitMs: 0 });
        expect(imported.notes).toHaveLength(50);
        expect(imported.notes.filter((note) => !note.rest)).toHaveLength(23);
        expect(imported.notes.filter((note) => note.rest)).toHaveLength(27);
        expect(imported.notes.some((note) => note.midi === 87)).toBe(true); // D#6
        expect(validation).toMatchObject({ valid: true, encodedLength: 104, durationMs: 5500 });
    });

    it("round trips RTTTL through the piano-roll model with equivalent ESC bytes", () => {
        const code = "Round trip:b=150,o=5,d=16:c5,p,d#6,8p,g4";
        const imported = rtttlToMelody(code);
        const exported = melodyToRtttl(imported);
        const restored = rtttlToMelody(exported);
        const originalBytes = encodeFirmwareMelody(imported, "am32").bytes;
        const restoredBytes = encodeFirmwareMelody(restored, "am32").bytes;

        expect(restored.bpm).toBe(150);
        expect(restored.notes.map(({ midi, start, duration, rest }) => ({ midi, start, duration, rest }))).toEqual(
            imported.notes.map(({ midi, start, duration, rest }) => ({ midi, start, duration, rest })),
        );
        expect(restoredBytes).toEqual(originalBytes);
    });

    it("maps leading RTTTL rests to the startup wait and rejects invalid code", () => {
        const melody = rtttlToMelody("Wait:d=16,o=5,b=150:8p,c5");

        expect(melody.waitMs).toBe(200);
        expect(melody.notes).toHaveLength(1);
        expect(melody.notes[0]).toMatchObject({ midi: 72, start: 0 });
        expect(() => rtttlToMelody("Broken:d=3,o=5,b=150:c5")).toThrow("Invalid RTTTL duration");
        expect(() => rtttlToMelody("Broken:d=16,o=5,b=150:c3")).toThrow("outside the ESC range");
        expect(() => rtttlToMelody("")).toThrow("RTTTL string is empty");
    });

    it("rejects melodies that exceed firmware capacity", () => {
        const melody = {
            name: "Long",
            bpm: 120,
            notes: Array.from({ length: 64 }, (_, index) => ({ midi: 60, start: index, duration: 1 })),
        };
        const result = validateMelody(melody, { capacity: 24 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes("容量"))).toBe(true);
    });

    it("reports an empty editor melody in Chinese without claiming EEPROM bytes", () => {
        const result = validateMelody({ name: "空旋律", bpm: 120, notes: [] });

        expect(result).toMatchObject({ valid: false, encodedLength: 0 });
        expect(result.errors).toEqual(["旋律至少需要一个音符或休止符。"]);
    });

    it("encodes fixed-size Bluejay and AM32 EEPROM payloads", () => {
        const encoded = encodeFirmwareMelody(
            { name: "A", bpm: 120, notes: [{ midi: 60, start: 0, duration: 1 }] },
            "bluejay",
        );
        expect(encoded.bytes).toBeInstanceOf(Uint8Array);
        expect(encoded.bytes).toHaveLength(128);
        expect(Array.from(encoded.bytes.slice(0, 4))).toEqual([0, 120, 5, 4]);
        expect(decodeFirmwareMelody(encoded.bytes).notes[0].midi).toBe(60);
    });

    it("encodes the configured startup wait as a leading rest", () => {
        const melody = { name: "A", bpm: 120, waitMs: 500, notes: [{ midi: 60, start: 0, duration: 1 }] };
        const encoded = encodeFirmwareMelody(melody, "am32");
        const decoded = decodeFirmwareMelody(encoded.bytes);

        expect(encoded.rtttl).toContain("p");
        expect(decoded.waitMs).toBe(500);
        expect(decoded.notes[0].midi).toBe(60);
    });

    it("keeps Bluejay wait time in its native field instead of consuming melody capacity", () => {
        const melody = { name: "A", bpm: 125, waitMs: 500, notes: [{ midi: 60, start: 0, duration: 1 }] };
        const encoded = encodeFirmwareMelody(melody, "bluejay");

        expect(encoded.rtttl).not.toContain("p");
        expect(encoded.waitMs).toBe(500);
    });

    it("restores a Bluejay native wait while decoding the current ESC melody", () => {
        const encoded = encodeFirmwareMelody(
            { name: "Current", bpm: 132, waitMs: 640, notes: [{ midi: 67, start: 0, duration: 0.5 }] },
            "bluejay",
        );
        const decoded = decodeFirmwareMelody(encoded.bytes, { name: "ESC 1", waitMs: 640 });

        expect(decoded).toMatchObject({ name: "ESC 1", bpm: 132, waitMs: 640 });
        expect(decoded.notes[0]).toMatchObject({ midi: 67, start: 0, duration: 0.5, rest: false });
    });

    it("compares current melodies by encoded meaning instead of names and note ids", () => {
        const first = rtttlToMelody("First:d=8,o=5,b=150:c5,p,g5");
        const second = rtttlToMelody("Second:d=8,o=5,b=150:c5,p,g5");
        const changed = rtttlToMelody("Changed:d=8,o=5,b=150:c5,p,a5");

        expect(melodiesEqual(first, second)).toBe(true);
        expect(melodyFingerprint(first)).toBe(melodyFingerprint(second));
        expect(melodiesEqual(first, changed)).toBe(false);
        expect(melodiesEqual(null, null)).toBe(true);
    });

    it("returns null for an empty firmware melody and rejects malformed bytes", () => {
        expect(decodeFirmwareMelody(new Uint8Array(128).fill(0xff))).toBeNull();
        expect(() => decodeFirmwareMelody(new Uint8Array([1, 2, 3, 4]))).toThrow("Invalid RTTTL");
    });

    it("converts empty piano-roll gaps into RTTTL rests", () => {
        const rtttl = melodyToRtttl({
            name: "Gap",
            bpm: 125,
            notes: [
                { midi: 60, start: 0, duration: 1 },
                { midi: 64, start: 2, duration: 1 },
            ],
        });

        expect(rtttl).toContain("c4,p,e4");
    });
});

describe("ESC EEPROM local backups", () => {
    it("serializes every ESC identity, EEPROM byte and OX32 checksum for recovery", () => {
        const escs = [
            createBackedUpEsc(0),
            createBackedUpEsc(1, {
                firmwareFamily: ESC_FIRMWARE.OX32,
                firmwareLabel: "OX32",
                model: "SpeedyBee 25A AIO ESC",
                version: "1.14",
                bootloader: "IO02",
                bootloaderVersion: "3.00",
                parameterVersion: "1",
                deviceIdentity: "00112233445566778899aabb",
                settingsOffset: 0xf400,
                settingsLength: 204,
                settingsPageSize: 1024,
                settingsChecksumAddress: 0xf7fc,
                originalEeprom: new Uint8Array(204).fill(0x32),
                originalSettingsChecksum: new Uint8Array([0x12, 0x34, 0x56, 0x78]),
            }),
        ];
        const backup = createEscBackupPackage(escs, {
            now: new Date("2026-07-26T08:09:10.000Z"),
            id: "backup-test",
        });

        expect(backup).toMatchObject({
            format: "betaflight-esc-eeprom-backup",
            version: 1,
            id: "backup-test",
            createdAt: "2026-07-26T08:09:10.000Z",
            escCount: 2,
        });
        expect(backup.escs[0].eeprom).toMatchObject({ encoding: "hex", byteLength: 176 });
        expect(backup.escs[1]).toMatchObject({
            channel: 1,
            firmwareFamily: "ox32",
            firmwareVersion: "1.14",
            deviceIdentity: "00112233445566778899aabb",
            settingsChecksum: { encoding: "hex", byteLength: 4, data: "12345678" },
        });
        expect(validateEscBackup(backup, escs)).toEqual({ valid: true, errors: [] });
    });

    it("keeps only the latest local backup history and ignores damaged entries", () => {
        const storage = createMemoryStorage();
        for (let index = 0; index < ESC_EEPROM_BACKUP_HISTORY_LIMIT + 3; index += 1) {
            saveEscBackup(
                createEscBackupPackage([createBackedUpEsc(0)], {
                    now: new Date(1_700_000_000_000 + index * 1000),
                    id: `backup-${index}`,
                }),
                storage,
            );
        }

        const history = loadEscBackups(storage);
        expect(history).toHaveLength(ESC_EEPROM_BACKUP_HISTORY_LIMIT);
        expect(history[0].id).toBe(`backup-${ESC_EEPROM_BACKUP_HISTORY_LIMIT + 2}`);
        expect(history.at(-1).id).toBe("backup-3");

        storage.setItem(ESC_EEPROM_BACKUPS_KEY, JSON.stringify([{ format: "damaged" }, history[0]]));
        expect(loadEscBackups(storage)).toEqual([history[0]]);
        storage.setItem(ESC_EEPROM_BACKUPS_KEY, "{");
        expect(loadEscBackups(storage)).toEqual([]);
    });

    it("rejects a persisted backup when the scanned ESC identity or original bytes change", () => {
        const storage = createMemoryStorage();
        const esc = createBackedUpEsc(0);
        const backup = createEscBackupPackage([esc], { id: "identity-test" });
        saveEscBackup(backup, storage);

        esc.version = "2.0";
        esc.originalEeprom[0] = 0xff;
        const result = getPersistedEscBackupStatus(backup.id, [esc], storage);

        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes("固件版本"))).toBe(true);
        expect(result.errors.some((error) => error.includes("原始 EEPROM"))).toBe(true);
    });

    it("parses a valid v1 backup file and decodes EEPROM bytes", () => {
        const backup = createEscBackupPackage([createBackedUpEsc(0)], { id: "file-test" });
        const parsed = parseEscBackupFile(JSON.stringify(backup));
        const decoded = decodeEscBackupEntry(parsed.escs[0]);

        expect(parsed).toEqual(backup);
        expect(decoded.eeprom).toEqual(new Uint8Array(0xb0).fill(1));
        expect(decoded.settingsChecksum).toBeNull();
    });

    it("rejects invalid, oversized, unsupported and structurally damaged backup files", () => {
        const backup = createEscBackupPackage([createBackedUpEsc(0)], { id: "invalid-file-test" });

        expect(() => parseEscBackupFile("")).toThrow("文件为空");
        expect(() => parseEscBackupFile("{")).toThrow("有效的 JSON");
        expect(() =>
            parseEscBackupFile(JSON.stringify(backup), { fileSize: ESC_EEPROM_BACKUP_FILE_MAX_BYTES + 1 }),
        ).toThrow("超过 1 MiB");
        expect(() => parseEscBackupFile(JSON.stringify({ ...backup, format: "other" }))).toThrow("不是 Betaflight");
        expect(() => parseEscBackupFile(JSON.stringify({ ...backup, version: 2 }))).toThrow("不支持");

        const duplicate = {
            ...backup,
            escCount: 2,
            escs: [backup.escs[0], { ...backup.escs[0] }],
        };
        expect(() => parseEscBackupFile(JSON.stringify(duplicate))).toThrow("数据不完整");

        const invalidHex = structuredClone(backup);
        invalidHex.escs[0].eeprom.data = "zz";
        expect(() => parseEscBackupFile(JSON.stringify(invalidHex))).toThrow("数据不完整");

        const invalidLength = structuredClone(backup);
        invalidLength.escs[0].settingsLength += 1;
        expect(() => parseEscBackupFile(JSON.stringify(invalidLength))).toThrow("数据不完整");
    });

    it("rejects OX32 files without the separate four-byte settings checksum", () => {
        const ox32 = createBackedUpEsc(0, {
            firmwareFamily: ESC_FIRMWARE.OX32,
            firmwareLabel: "OX32",
            model: "OX32 ESC",
            version: "1.14",
            bootloader: "IO02",
            bootloaderVersion: "3.00",
            parameterVersion: "1.00",
            deviceIdentity: "00112233445566778899AABB",
            settingsOffset: 0xf400,
            settingsLength: 204,
            settingsPageSize: 1024,
            settingsChecksumAddress: 0xf7fc,
            originalEeprom: new Uint8Array(204).fill(0x32),
            originalSettingsChecksum: new Uint8Array([1, 2, 3, 4]),
        });
        const backup = createEscBackupPackage([ox32]);
        backup.escs[0].settingsChecksum = null;

        expect(() => parseEscBackupFile(JSON.stringify(backup))).toThrow("数据不完整");
    });

    it("reports every strict hardware identity mismatch and keeps valid channels selectable", () => {
        const first = createBackedUpEsc(0);
        const second = createBackedUpEsc(1);
        const backup = createEscBackupPackage([first, second]);
        const identityChanges = [
            ["model", "different"],
            ["firmwareFamily", ESC_FIRMWARE.BLUEJAY],
            ["version", "2.0"],
            ["layout", "different layout"],
            ["signature", 0xe8b2],
            ["deviceIdentity", "different-device"],
            ["interfaceMode", 1],
            ["inputPin", 20],
            ["bootloader", "different-loader"],
            ["bootloaderVersion", "9.99"],
            ["parameterVersion", "9"],
            ["settingsOffset", 0x1a00],
            ["settingsLength", 0xff],
            ["melodyRelativeOffset", 0x70],
            ["waitRelativeOffset", 0xf0],
            ["settingsPageSize", 1024],
            ["settingsChecksumAddress", 0xf7fc],
        ];
        const changed = { ...first };
        for (const [key, value] of identityChanges) changed[key] = value;

        const errors = getEscRestoreIdentityErrors(backup.escs[0], changed);
        const result = matchEscBackupForRestore(backup, [changed, second]);

        expect(errors).toHaveLength(identityChanges.length);
        expect(result.validCount).toBe(1);
        expect(result.matches[0]).toMatchObject({ valid: false, esc: changed });
        expect(result.matches[1]).toMatchObject({ valid: true, esc: second });
    });
});

describe("ESC melody drafts", () => {
    it("stores normalized drafts locally and updates an existing draft in place", () => {
        const values = new Map();
        const storage = {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
        };
        const melody = { name: "Draft", bpm: 123, notes: [{ midi: 60, start: 0, duration: 1 }] };
        const first = saveMelodyDraft({ name: "Draft", melody }, storage);
        saveMelodyDraft({ id: first.id, name: "Updated", melody }, storage);
        const drafts = loadMelodyDrafts(storage);

        expect(drafts).toHaveLength(1);
        expect(drafts[0].name).toBe("Updated");
        expect(drafts[0].melody.bpm).toBe(123);
    });

    it("creates an empty draft and rejects duplicate names", () => {
        const storage = createMemoryStorage();
        const first = createMelodyDraft({}, storage);
        const drafts = loadMelodyDrafts(storage);

        expect(first.name).toBe("未命名草稿");
        expect(first.melody.notes).toEqual([]);
        expect(() => createMelodyDraft({}, storage)).toThrow("已有同名草稿");
        expect(drafts).toHaveLength(1);
    });

    it("blocks the twenty-first draft without discarding the oldest one", () => {
        const storage = createMemoryStorage();
        const ids = [];
        for (let index = 0; index < ESC_MELODY_DRAFT_LIMIT; index += 1) {
            ids.push(createMelodyDraft({ name: `草稿 ${index + 1}` }, storage).id);
        }

        expect(() => createMelodyDraft({ name: "草稿 21" }, storage)).toThrow("20 条上限");
        expect(loadMelodyDrafts(storage)).toHaveLength(ESC_MELODY_DRAFT_LIMIT);
        expect(loadMelodyDrafts(storage).some((draft) => draft.id === ids[0])).toBe(true);
    });

    it("duplicates, deletes and round-trips a versioned draft package", () => {
        const sourceStorage = createMemoryStorage();
        const targetStorage = createMemoryStorage();
        const first = createMelodyDraft(
            {
                name: "起飞音",
                melody: { bpm: 150, notes: [{ midi: 72, start: 0, duration: 0.5 }] },
            },
            sourceStorage,
        );
        const copy = duplicateMelodyDraft(first, sourceStorage);
        expect(copy.name).toBe("起飞音 副本");
        expect(deleteMelodyDraft(copy.id, sourceStorage)).toBe(true);

        const packageValue = createMelodyDraftPackage(loadMelodyDrafts(sourceStorage), new Date(0));
        const parsed = parseMelodyDraftPackage(JSON.stringify(packageValue));
        const imported = importMelodyDraftPackage(parsed, targetStorage);

        expect(imported).toHaveLength(1);
        expect(loadMelodyDrafts(targetStorage)[0]).toMatchObject({ name: "起飞音" });
        expect(loadMelodyDrafts(targetStorage)[0].melody.bpm).toBe(150);
        expect(() => parseMelodyDraftPackage("{")).toThrow("有效的 JSON");
    });
});

describe("4-way protocol", () => {
    it("uses XMODEM CRC and parses a complete response", () => {
        expect(crc16Xmodem(new Uint8Array([0x31, 0x32, 0x33]))).toBe(0x9752);
        const response = createFourWayResponse(0x30, [0x12, 0x34], 0, 0x0001);
        const result = parseFourWayMessages(response);
        expect(result.backlog).toHaveLength(0);
        expect(result.messages[0]).toMatchObject({ command: 0x30, address: 1, ack: 0 });
        expect(Array.from(result.messages[0].params)).toEqual([0x12, 0x34]);
    });

    it("keeps partial frames until the next serial chunk", () => {
        const response = createFourWayResponse(0x3d, [1, 2, 3], 0);
        const split = parseFourWayMessages(response.slice(0, 5));
        expect(split.messages).toHaveLength(0);
        expect(split.backlog.length).toBe(5);
        const complete = parseFourWayMessages(response.slice(5), split.backlog);
        expect(complete.messages).toHaveLength(1);
    });

    it("creates the PC-to-interface frame with a big-endian address", () => {
        const frame = createFourWayMessage(0x3e, [1, 2], 0x1234);
        expect(Array.from(frame.slice(0, 5))).toEqual([0x2f, 0x3e, 0x12, 0x34, 2]);
    });

    it("encodes an empty command with the protocol-required zero parameter", () => {
        const frame = createFourWayMessage(FOUR_WAY_COMMANDS.interfaceTestAlive);
        expect(Array.from(frame.slice(0, 6))).toEqual([0x2f, 0x30, 0, 0, 1, 0]);
        expect(frame).toHaveLength(8);
    });

    it("rejects pending commands immediately when the serial link disconnects", async () => {
        const serial = new EventTarget();
        serial.send = () => ({ bytesSent: 8 });
        const session = new FourWaySession({ serial, timeout: 1000 });
        const pending = session.send(FOUR_WAY_COMMANDS.interfaceTestAlive);
        serial.dispatchEvent(new Event("disconnect"));
        await expect(pending).rejects.toThrow("connection was lost");
        expect(session.started).toBe(false);
    });
});

describe("ESC capability matrix", () => {
    it("counts only channels that returned identifiable ESC information", () => {
        const escs = ["ready", "unavailable", "verified", "failed", "recovered", "idle"].map((status, channel) =>
            createEscRecord(channel, { status }),
        );

        expect(getIdentifiedEscCount(escs)).toBe(4);
    });

    it("locks BLHeli_32 writes while keeping identification available", () => {
        const esc = createEscRecord(0, { firmwareFamily: ESC_FIRMWARE.BLHELI32, model: "BLHeli 32" });
        expect(esc.canRead).toBe(true);
        expect(esc.canBackup).toBe(true);
        expect(esc.canWrite).toBe(false);
        expect(esc.reason).toContain("AM32");
    });

    it("exposes OX32 as a native writable 128-byte melody target", () => {
        const esc = createEscRecord(0, { firmwareFamily: ESC_FIRMWARE.OX32, model: "OX32 ESC" });
        expect(esc).toMatchObject({
            firmwareLabel: "OX32",
            canRead: true,
            canBackup: true,
            canWrite: true,
            capacity: 128,
            supportsWait: true,
        });
    });

    it("identifies supported AM32 MCU signatures and firmware layout", () => {
        const esc = decodeEscInfo(new Uint8Array([0x06, 0x1f, 0x02, 0x04]), 1);
        expect(esc.firmwareFamily).toBe(ESC_FIRMWARE.AM32);
        expect(esc.model).toBe("STM32F051");
        expect(esc.settingsOffset).toBe(0x7c00);
        expect(esc.melodyRelativeOffset).toBe(0x30);
        expect(esc.supportsWait).toBe(true);
    });

    it("patches only the Bluejay melody and native wait regions", () => {
        const original = new Uint8Array(0xff).fill(0xaa);
        const melody = new Uint8Array(128).fill(0x44);
        const patched = patchSettingsImage(
            original,
            { melodyRelativeOffset: 0x70, waitRelativeOffset: 0xf0 },
            melody,
            500,
        );
        expect(patched.slice(0, 0x70)).toEqual(original.slice(0, 0x70));
        expect(Array.from(patched.slice(0x70, 0x74))).toEqual([0x44, 0x44, 0x44, 0x44]);
        expect(Array.from(patched.slice(0xf0, 0xf2))).toEqual([0xf4, 0x01]);
        expect(patched.slice(0xf2)).toEqual(original.slice(0xf2));
        expect(original.every((byte) => byte === 0xaa)).toBe(true);
    });

    it("parses OX32 handshake versions and builds the page checksum trailer", () => {
        const handshake = createOx32Handshake();
        const parsed = parseOx32Handshake(handshake);
        const settings = new Uint8Array(OX32_SETTINGS_LENGTH).map((_, index) => index);
        const trailer = createOx32ChecksumTrailer(settings);
        const checksum = crc16Xmodem(settings);

        expect(parsed).toMatchObject({
            bootloader: "IO02",
            bootloaderVersion: "3.00",
            firmwareVersion: "1.14",
            parameterVersion: "1.00",
        });
        expect(verifyOx32License(parsed)).toBe(true);
        expect(getOx32Layout(parsed.bootloaderVersion)).toMatchObject({
            settingsOffset: 0xf400,
            settingsLength: 204,
            melodyRelativeOffset: 0x44,
            checksumAddress: 0xf7fc,
        });
        expect(Array.from(trailer)).toEqual([0xff, 0xff, checksum & 0xff, (checksum >> 8) & 0xff]);
    });
});

describe("ESC 4-way controller integration", () => {
    it("uses the legacy empty passthrough payload and scans the channel count returned by Betaflight", async () => {
        const mspCalls = [];
        const delays = [];
        const session = createSession((command) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) return response([0x78, 0x56, 0, 0]);
            throw new Error("Unexpected command");
        });
        const countBuffer = new Uint8Array([1]).buffer;
        const msp = {
            callbacks: [{}],
            send_message(code, payload, _sent, callback) {
                mspCalls.push({ code, payload });
                callback({ data: new DataView(countBuffer) });
                return true;
            },
        };
        const controller = new EscFourWayController({
            msp,
            serialAdapter: { send() {} },
            sessionFactory: () => session,
            delay(milliseconds) {
                delays.push(milliseconds);
                if (milliseconds === 25) msp.callbacks = [];
                return Promise.resolve();
            },
        });

        const escs = await controller.scan();

        expect(mspCalls).toEqual([{ code: 245, payload: false }]);
        expect(delays).toEqual([25, 4500, 3000]);
        expect(escs).toHaveLength(1);
        expect(session.calls.filter((call) => call.command === FOUR_WAY_COMMANDS.deviceInitFlash)).toHaveLength(1);
    });

    it("retries transient init-flash failures using the OX32-compatible delays", async () => {
        const delays = [];
        let attempts = 0;
        const session = createSession((command) => {
            if (command !== FOUR_WAY_COMMANDS.deviceInitFlash) throw new Error("Unexpected command");
            attempts += 1;
            if (attempts < 3) throw ackError(FOUR_WAY_ACK.generalError);
            return response([0x78, 0x56, 0, 0]);
        });
        const controller = new EscFourWayController({
            msp: {
                send_message(_code, _payload, _sent, callback) {
                    callback();
                    return true;
                },
            },
            serialAdapter: { send() {} },
            sessionFactory: () => session,
            passthroughSettleDelay: 0,
            delay(milliseconds) {
                delays.push(milliseconds);
                return Promise.resolve();
            },
        });

        const escs = await controller.scan({ channels: 1 });

        expect(attempts).toBe(3);
        expect(delays).toEqual([500, 1000, 3000]);
        expect(escs[0].status).toBe("ready");
    });

    it("returns four unavailable records when no ESC channels respond", async () => {
        const session = createSession(() => {
            throw ackError(FOUR_WAY_ACK.invalidChannel);
        });
        const controller = createController([session]);

        const escs = await controller.scan({ channels: 4 });

        expect(escs).toHaveLength(4);
        expect(escs.every((esc) => esc.status === "unavailable")).toBe(true);
        expect(session.stops).toEqual([{ exit: true }]);
        expect(controller.inPassthrough).toBe(false);
    });

    it("identifies a single Bluejay ESC and restores MSP after scanning", async () => {
        const current = encodeFirmwareMelody(
            { name: "Current", bpm: 132, notes: [{ midi: 67, start: 0, duration: 1 }] },
            "bluejay",
        );
        const session = createSession((command, params, address) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                if (params[0] === 0) return response([0xb2, 0xe8, 0, 1]);
                throw ackError(FOUR_WAY_ACK.invalidChannel);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x1a60) {
                return response(Array.from(new TextEncoder().encode("Bluejay TEST\0\0\0\0")));
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x1a00) return response([0, 21, 0]);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x1a70) return response(current.bytes);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x1af0) return response([0x80, 0x02]);
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        const escs = await controller.scan({ channels: 4 });

        expect(escs[0]).toMatchObject({
            firmwareFamily: ESC_FIRMWARE.BLUEJAY,
            canWrite: true,
            version: "0.21",
            waitRelativeOffset: 0xf0,
            melodyReadStatus: ESC_MELODY_READ_STATUS.LOADED,
        });
        expect(escs[0].currentMelody).toMatchObject({ name: "ESC 1", bpm: 132, waitMs: 640 });
        expect(escs[0].currentMelody.notes[0].midi).toBe(67);
        expect(escs[0].backedUp).toBe(false);
        expect(escs.slice(1).every((esc) => esc.status === "unavailable")).toBe(true);
        expect(session.stops).toEqual([{ exit: true }]);
    });

    it("reports mixed Bluejay, AM32, BLHeli_32 and unknown channels", async () => {
        const bluejayMelody = encodeFirmwareMelody(
            { name: "Bluejay", bpm: 120, notes: [{ midi: 60, start: 0, duration: 1 }] },
            "bluejay",
        );
        const infoByChannel = [
            [0xb5, 0xe8, 0, 1],
            [0x06, 0x1f, 0x02, 4],
            [0x34, 0x12, 0x01, 4],
            [0x78, 0x56, 0, 0],
        ];
        let selectedChannel = null;
        const session = createSession((command, params, address) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                selectedChannel = params[0];
                return response(infoByChannel[selectedChannel]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x3060) {
                return response(Array.from(new TextEncoder().encode("Bluejay TEST\0\0\0\0")));
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x3000) return response([0, 22, 0]);
            if (
                command === FOUR_WAY_COMMANDS.deviceRead &&
                address === OX32_HANDSHAKE_OFFSET &&
                [1, 2].includes(selectedChannel)
            ) {
                return response(new Uint8Array(OX32_HANDSHAKE_LENGTH));
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x7c00) return response([1, 3, 3, 2, 16]);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x3070) {
                return response(bluejayMelody.bytes);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x30f0) return response([0, 0]);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x7c30) {
                const malformed = new Uint8Array(128);
                malformed.set([1, 2, 3, 4]);
                return response(malformed);
            }
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        const escs = await controller.scan({ channels: 4 });

        expect(escs.map((esc) => esc.firmwareFamily)).toEqual([
            ESC_FIRMWARE.BLUEJAY,
            ESC_FIRMWARE.AM32,
            ESC_FIRMWARE.BLHELI32,
            ESC_FIRMWARE.UNKNOWN,
        ]);
        expect(escs.map((esc) => esc.canWrite)).toEqual([true, true, false, false]);
        expect(escs[1]).toMatchObject({ version: "2.16", settingsLength: 0xc0, supportsWait: true });
        expect(escs.map((esc) => esc.melodyReadStatus)).toEqual([
            ESC_MELODY_READ_STATUS.LOADED,
            ESC_MELODY_READ_STATUS.ERROR,
            ESC_MELODY_READ_STATUS.UNSUPPORTED,
            ESC_MELODY_READ_STATUS.UNSUPPORTED,
        ]);
        expect(escs[0].currentMelody.notes[0].midi).toBe(60);
    });

    it("identifies an activated OX32 ESC before the generic ARM families", async () => {
        const handshake = createOx32Handshake();
        const model = fixedAscii("SpeedyBee 25A AIO ESC", 32);
        const current = encodeFirmwareMelody(
            { name: "OX32", bpm: 120, waitMs: 500, notes: [{ midi: 72, start: 0, duration: 1 }] },
            "ox32",
        );
        const session = createSession((command, params, address) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                if (params[0] === 0) return response([0x06, 0x35, 0x02, 4]);
                throw ackError(FOUR_WAY_ACK.invalidChannel);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === OX32_HANDSHAKE_OFFSET) {
                return response(handshake);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0xf000) return response(model);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0xf444) return response(current.bytes);
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        const escs = await controller.scan({ channels: 4 });

        expect(escs[0]).toMatchObject({
            model: "SpeedyBee 25A AIO ESC",
            firmwareFamily: ESC_FIRMWARE.OX32,
            firmwareLabel: "OX32",
            version: "1.14",
            bootloader: "IO02",
            bootloaderVersion: "3.00",
            settingsOffset: 0xf400,
            settingsLength: 204,
            melodyRelativeOffset: 0x44,
            settingsChecksumAddress: 0xf7fc,
            activated: true,
            canWrite: true,
            melodyReadStatus: ESC_MELODY_READ_STATUS.LOADED,
        });
        expect(escs[0].currentMelody).toMatchObject({ bpm: 120, waitMs: 500 });
        expect(escs.slice(1).every((esc) => esc.status === "unavailable")).toBe(true);
        expect(
            session.calls.some((call) => call.command === FOUR_WAY_COMMANDS.deviceRead && call.address === 0xf800),
        ).toBe(false);
    });

    it("keeps unactivated and unknown-layout OX32 devices read only", async () => {
        const handshakes = [
            createOx32Handshake({ activated: false }),
            createOx32Handshake({ bootloaderVersion: "4.00" }),
        ];
        let selectedChannel = 0;
        const session = createSession((command, params, address) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                selectedChannel = params[0];
                return response([0x06, 0x35, 0x02, 4]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === OX32_HANDSHAKE_OFFSET) {
                return response(handshakes[selectedChannel]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0xf000) {
                return response(fixedAscii("OX32 Test ESC", 32));
            }
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        const escs = await controller.scan({ channels: 2 });

        expect(escs.map((esc) => esc.firmwareFamily)).toEqual([ESC_FIRMWARE.OX32, ESC_FIRMWARE.OX32]);
        expect(escs.map((esc) => esc.canWrite)).toEqual([false, false]);
        expect(escs[0]).toMatchObject({ activated: false, canBackup: true });
        expect(escs[0].reason).toContain("not activated");
        expect(escs[1]).toMatchObject({ bootloaderVersion: "4.00", canBackup: false });
        expect(escs[1].reason).toContain("unknown settings layout");
    });

    it("does not fall back to writable AM32 when the OX32 handshake probe fails", async () => {
        const session = createSession((command) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) return response([0x06, 0x35, 0x02, 4]);
            if (command === FOUR_WAY_COMMANDS.deviceRead) throw ackError(FOUR_WAY_ACK.invalidParam);
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        const [esc] = await controller.scan({ channels: 1 });

        expect(esc).toMatchObject({
            firmwareFamily: ESC_FIRMWARE.UNKNOWN,
            status: "ready",
            canRead: true,
            canBackup: false,
            canWrite: false,
        });
        expect(esc.reason).toContain("could not be distinguished safely");
    });

    it("backs up, writes, verifies and recovers OX32 settings with the page checksum", async () => {
        const handshake = createOx32Handshake();
        const layout = getOx32Layout("3.00");
        const originalSettings = new Uint8Array(OX32_SETTINGS_LENGTH).fill(0xaa);
        const originalChecksum = new Uint8Array([0xff, 0xff, 0x12, 0x34]);
        const memory = new Map([
            [layout.settingsOffset, new Uint8Array(originalSettings)],
            [layout.checksumAddress, new Uint8Array(originalChecksum)],
        ]);
        const handler = (command, params, address) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) return response([0x06, 0x35, 0x02, 4]);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === OX32_HANDSHAKE_OFFSET) {
                return response(handshake);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && memory.has(address)) {
                return response(memory.get(address));
            }
            if (command === FOUR_WAY_COMMANDS.deviceWrite) {
                memory.set(address, new Uint8Array(params));
                return response([0]);
            }
            throw new Error("Unexpected command");
        };
        const writeSession = createSession(handler);
        const recoverySession = createSession(handler);
        const controller = createController([writeSession, recoverySession]);
        const esc = createEscRecord(0, {
            firmwareFamily: ESC_FIRMWARE.OX32,
            signature: 0x3506,
            settingsOffset: layout.settingsOffset,
            settingsLength: layout.settingsLength,
            melodyRelativeOffset: layout.melodyRelativeOffset,
            settingsChecksumAddress: layout.checksumAddress,
            bootloader: "IO02",
            bootloaderVersion: "3.00",
            deviceIdentity: parseOx32Handshake(handshake).mcuId,
            activated: true,
        });
        const melody = { name: "OX32", bpm: 104, notes: [{ midi: 60, start: 0, duration: 1 }] };

        const result = await controller.writeEsc(esc, melody);
        const writtenSettings = memory.get(layout.settingsOffset);
        const writtenChecksum = memory.get(layout.checksumAddress);

        expect(esc.originalEeprom).toEqual(originalSettings);
        expect(esc.originalSettingsChecksum).toEqual(originalChecksum);
        expect(writtenSettings.slice(layout.melodyRelativeOffset, layout.melodyRelativeOffset + 128)).toEqual(
            result.encoded.bytes,
        );
        expect(writtenChecksum).toEqual(createOx32ChecksumTrailer(writtenSettings));
        expect(esc.verified).toBe(true);
        expect(writeSession.calls.some((call) => call.command === FOUR_WAY_COMMANDS.devicePageErase)).toBe(false);

        await controller.recoverEsc(esc);

        expect(memory.get(layout.settingsOffset)).toEqual(originalSettings);
        expect(memory.get(layout.checksumAddress)).toEqual(originalChecksum);
        expect(esc.status).toBe("recovered");
    });

    it("stops serial writes after the first read-back mismatch", async () => {
        const escs = [0, 1, 2].map((channel) =>
            createEscRecord(channel, {
                firmwareFamily: ESC_FIRMWARE.AM32,
                signature: 0x1f06,
                settingsOffset: 0x7c00,
                settingsLength: 0xb0,
                melodyRelativeOffset: 0x30,
                backedUp: true,
                originalEeprom: new Uint8Array(0xb0).fill(0xaa),
            }),
        );
        const writes = new Map();
        let selectedChannel = null;
        const session = createSession((command, params) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                selectedChannel = params[0];
                return response([0x06, 0x1f, 0x02, 4]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceWrite) {
                writes.set(selectedChannel, new Uint8Array(params));
                return response([0]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead) {
                const readBack = new Uint8Array(writes.get(selectedChannel));
                if (selectedChannel === 1) readBack[0] ^= 0xff;
                return response(readBack);
            }
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);
        const melody = { name: "Test", bpm: 132, notes: [{ midi: 60, start: 0, duration: 1 }] };

        const result = await controller.writeMelody(escs, melody);

        expect(result.ok).toBe(false);
        expect(result.failed.channel).toBe(1);
        expect(result.written.map((esc) => esc.channel)).toEqual([0]);
        expect(Array.from(writes.keys())).toEqual([0, 1]);
        expect(session.calls.filter((call) => call.command === FOUR_WAY_COMMANDS.deviceInitFlash)).toHaveLength(2);
        expect(session.calls.filter((call) => call.command === FOUR_WAY_COMMANDS.deviceWrite)).toHaveLength(2);
        expect(session.calls.some((call) => call.command === FOUR_WAY_COMMANDS.devicePageErase)).toBe(false);
        expect(session.stops).toEqual([{ exit: true }]);
    });

    it("restores each written channel from its own backup", async () => {
        const escs = [0, 1].map((channel) =>
            createEscRecord(channel, {
                firmwareFamily: ESC_FIRMWARE.AM32,
                signature: 0x1f06,
                settingsOffset: 0x7c00,
                settingsLength: 0xb0,
                melodyRelativeOffset: 0x30,
                originalEeprom: new Uint8Array(0xb0).fill(0x40 + channel),
            }),
        );
        let selectedChannel = null;
        const restored = new Map();
        const session = createSession((command, params) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                selectedChannel = params[0];
                return response([0x06, 0x1f, 0x02, 4]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceWrite) {
                restored.set(selectedChannel, new Uint8Array(params));
                return response([0]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead) return response(restored.get(selectedChannel));
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        await controller.recoverEscs(escs);

        expect(restored.get(0)).toEqual(escs[0].originalEeprom);
        expect(restored.get(1)).toEqual(escs[1].originalEeprom);
        expect(escs.map((esc) => esc.status)).toEqual(["recovered", "recovered"]);
    });

    it("restores complete EEPROM images serially, erases required pages and supports operation rollback", async () => {
        const backupEscs = [0, 1].map((channel) =>
            createBackedUpEsc(channel, {
                erasePage: 62,
                originalEeprom: new Uint8Array(0xb0).fill(0x20 + channel),
            }),
        );
        const backup = createEscBackupPackage(backupEscs);
        const escs = backupEscs.map((esc, channel) => ({
            ...esc,
            originalEeprom: new Uint8Array(0xb0).fill(0x70 + channel),
            currentEeprom: new Uint8Array(0xb0).fill(0x70 + channel),
        }));
        const restoredMemory = new Map();
        let selectedChannel = null;
        const handler = (command, params) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                selectedChannel = params[0];
                return response([0x06, 0x1f, 0x02, 4]);
            }
            if (command === FOUR_WAY_COMMANDS.devicePageErase) return response([0]);
            if (command === FOUR_WAY_COMMANDS.deviceWrite) {
                restoredMemory.set(selectedChannel, new Uint8Array(params));
                return response([0]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead) return response(restoredMemory.get(selectedChannel));
            throw new Error("Unexpected command");
        };
        const restoreSession = createSession(handler);
        const rollbackSession = createSession(handler);
        const controller = createController([restoreSession, rollbackSession]);

        const result = await controller.restoreBackup(
            escs.map((esc, index) => ({ esc, backupEntry: backup.escs[index] })),
        );

        expect(result).toMatchObject({ ok: true, restored: escs, rollback: escs });
        expect(restoredMemory.get(0)).toEqual(backupEscs[0].originalEeprom);
        expect(restoredMemory.get(1)).toEqual(backupEscs[1].originalEeprom);
        expect(restoreSession.calls.filter((call) => call.command === FOUR_WAY_COMMANDS.devicePageErase)).toHaveLength(
            2,
        );
        expect(restoreSession.stops).toEqual([{ exit: true }]);

        await controller.recoverEscs(result.rollback);

        expect(restoredMemory.get(0)).toEqual(new Uint8Array(0xb0).fill(0x70));
        expect(restoredMemory.get(1)).toEqual(new Uint8Array(0xb0).fill(0x71));
        expect(rollbackSession.stops).toEqual([{ exit: true }]);
    });

    it("stops EEPROM restoration after the first mismatch and includes the touched failed channel in rollback", async () => {
        const backupEscs = [0, 1, 2].map((channel) =>
            createBackedUpEsc(channel, { originalEeprom: new Uint8Array(0xb0).fill(0x30 + channel) }),
        );
        const backup = createEscBackupPackage(backupEscs);
        const escs = backupEscs.map((esc) => ({
            ...esc,
            originalEeprom: new Uint8Array(0xb0).fill(0x80 + esc.channel),
        }));
        const memory = new Map();
        let selectedChannel = null;
        const session = createSession((command, params) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) {
                selectedChannel = params[0];
                return response([0x06, 0x1f, 0x02, 4]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceWrite) {
                memory.set(selectedChannel, new Uint8Array(params));
                return response([0]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead) {
                const readBack = new Uint8Array(memory.get(selectedChannel));
                if (selectedChannel === 1) readBack[0] ^= 0xff;
                return response(readBack);
            }
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        const result = await controller.restoreBackup(
            escs.map((esc, index) => ({ esc, backupEntry: backup.escs[index] })),
        );

        expect(result.ok).toBe(false);
        expect(result.failed).toBe(escs[1]);
        expect(result.restored).toEqual([escs[0]]);
        expect(result.rollback).toEqual([escs[0], escs[1]]);
        expect(memory.has(2)).toBe(false);
        expect(session.calls.filter((call) => call.command === FOUR_WAY_COMMANDS.deviceInitFlash)).toHaveLength(2);
        expect(session.stops).toEqual([{ exit: true }]);
    });

    it("restores and verifies the separate OX32 configuration checksum", async () => {
        const layout = getOx32Layout("3.00");
        const desiredSettings = new Uint8Array(layout.settingsLength).fill(0x32);
        const desiredChecksum = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
        const esc = createBackedUpEsc(0, {
            firmwareFamily: ESC_FIRMWARE.OX32,
            firmwareLabel: "OX32",
            model: "OX32 ESC",
            version: "1.14",
            signature: 0x3506,
            deviceIdentity: "00112233445566778899AABB",
            bootloader: "IO02",
            bootloaderVersion: "3.00",
            parameterVersion: "1.00",
            settingsOffset: layout.settingsOffset,
            settingsLength: layout.settingsLength,
            melodyRelativeOffset: layout.melodyRelativeOffset,
            settingsPageSize: layout.pageSize,
            settingsChecksumAddress: layout.checksumAddress,
            originalEeprom: desiredSettings,
            originalSettingsChecksum: desiredChecksum,
        });
        const backup = createEscBackupPackage([esc]);
        esc.originalEeprom = new Uint8Array(layout.settingsLength).fill(0x77);
        esc.originalSettingsChecksum = new Uint8Array([9, 9, 9, 9]);
        const memory = new Map();
        const session = createSession((command, params, address) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) return response([0x06, 0x35, 0x02, 4]);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === OX32_HANDSHAKE_OFFSET) {
                return response(createOx32Handshake());
            }
            if (command === FOUR_WAY_COMMANDS.deviceWrite) {
                memory.set(address, new Uint8Array(params));
                return response([0]);
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead) return response(memory.get(address));
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        const result = await controller.restoreBackup([{ esc, backupEntry: backup.escs[0] }]);

        expect(result.ok).toBe(true);
        expect(memory.get(layout.settingsOffset)).toEqual(desiredSettings);
        expect(memory.get(layout.checksumAddress)).toEqual(desiredChecksum);
        expect(esc.currentSettingsChecksum).toEqual(desiredChecksum);
        expect(session.stops).toEqual([{ exit: true }]);
    });

    it("exits 4-way when EEPROM restoration loses the transport", async () => {
        const esc = createBackedUpEsc(0);
        const backup = createEscBackupPackage([esc]);
        const session = createSession((command) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) return response([0x06, 0x1f, 0x02, 4]);
            throw new Error("4-way restore timed out");
        });
        const controller = createController([session]);

        const result = await controller.restoreBackup([{ esc, backupEntry: backup.escs[0] }]);

        expect(result.ok).toBe(false);
        expect(result.error.message).toContain("timed out");
        expect(session.stops).toEqual([{ exit: true }]);
        expect(controller.inPassthrough).toBe(false);
    });

    it("exits 4-way immediately when scanning times out", async () => {
        const session = createSession(() => {
            throw new Error("4-way command 0x37 timed out");
        });
        const controller = createController([session]);

        await expect(controller.scan()).rejects.toThrow("timed out");
        expect(session.calls).toHaveLength(1);
        expect(session.stops).toEqual([{ exit: true }]);
        expect(controller.inPassthrough).toBe(false);
    });

    it("aborts scanning and exits 4-way when the current-melody read times out", async () => {
        const session = createSession((command, _params, address) => {
            if (command === FOUR_WAY_COMMANDS.deviceInitFlash) return response([0xb2, 0xe8, 0, 1]);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x1a60) {
                return response(fixedAscii("Bluejay TEST", 16));
            }
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x1a00) return response([0, 21, 0]);
            if (command === FOUR_WAY_COMMANDS.deviceRead && address === 0x1a70) {
                throw new Error("4-way current melody read timed out");
            }
            throw new Error("Unexpected command");
        });
        const controller = createController([session]);

        await expect(controller.scan({ channels: 1 })).rejects.toThrow("timed out");
        expect(session.stops).toEqual([{ exit: true }]);
        expect(controller.inPassthrough).toBe(false);
    });
});

function response(params) {
    return { params: params instanceof Uint8Array ? params : new Uint8Array(params) };
}

function createOx32Handshake({
    activated = true,
    mcuId = "00112233445566778899AABB",
    bootloader = "IO02",
    bootloaderVersion = "3.00",
    firmwareVersion = "1.14",
    parameterVersion = "1.00",
} = {}) {
    const bytes = new Uint8Array(OX32_HANDSHAKE_LENGTH);
    const license = activated ? CryptoES.SHA1(mcuId).toString().slice(0, 16).toUpperCase() : "0000000000000000";
    writeHex(bytes, 0, license);
    writeHex(bytes, 8, mcuId);
    writeAscii(bytes, 20, bootloader);
    writeAscii(bytes, 24, encodeOx32Version(bootloaderVersion));
    writeAscii(bytes, 27, encodeOx32Version(firmwareVersion));
    writeHex(bytes, 30, "010203040506");
    writeAscii(bytes, 36, encodeOx32Version(parameterVersion));
    return bytes;
}

function fixedAscii(value, length) {
    const bytes = new Uint8Array(length);
    writeAscii(bytes, 0, value);
    return bytes;
}

function writeAscii(target, offset, value) {
    target.set(new TextEncoder().encode(value), offset);
}

function writeHex(target, offset, value) {
    const pairs = value.match(/.{2}/g) || [];
    target.set(
        pairs.map((pair) => Number.parseInt(pair, 16)),
        offset,
    );
}

function encodeOx32Version(value) {
    return String(value).replace(".", "").padEnd(3, "0").slice(0, 3);
}

function ackError(ack) {
    const error = new Error(`ACK 0x${ack.toString(16)}`);
    error.ack = ack;
    return error;
}

function createSession(handler) {
    return {
        calls: [],
        stops: [],
        start() {},
        async send(command, params = [], address = 0) {
            this.calls.push({ command, params: Array.from(params), address });
            return handler(command, params, address);
        },
        async stop(options) {
            this.stops.push(options);
        },
    };
}

function createController(sessions) {
    return new EscFourWayController({
        msp: {
            send_message(_code, _payload, _sent, callback) {
                callback();
                return true;
            },
        },
        serialAdapter: { send() {} },
        sessionFactory: () => sessions.shift(),
        delay: () => Promise.resolve(),
    });
}

function createBackedUpEsc(channel, overrides = {}) {
    return createEscRecord(channel, {
        firmwareFamily: ESC_FIRMWARE.AM32,
        model: "STM32F051",
        version: "1.99",
        signature: 0x1f06,
        interfaceMode: 4,
        inputPin: 2,
        settingsOffset: 0x7c00,
        settingsLength: 0xb0,
        melodyRelativeOffset: 0x30,
        backedUp: true,
        originalEeprom: new Uint8Array(0xb0).fill(channel + 1),
        ...overrides,
    });
}

function createMemoryStorage() {
    const values = new Map();
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        },
    };
}
