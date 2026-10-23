import { beforeEach, describe, expect, it } from "vitest";
import {
    LIBRARY_STATE_KEY,
    EDIT_RECOVERY_KEY,
    loadLibraryState,
    saveLibraryState,
    saveEditRecovery,
    loadEditRecovery,
} from "../../src/js/esc_melody/library_state.ts";
import { PRESET_MELODIES } from "../../src/js/esc_melody/melody.js";
import { sidebarItems } from "../../src/components/sidebar/sidebar_items.js";
import GUI from "../../src/js/gui.js";

describe("ESC workbench browser state", () => {
    beforeEach(() => localStorage.clear());
    it("exposes ESC music only after connecting a flight controller", () => {
        expect(sidebarItems.find((item) => item.key === "esc_melody").mode).toBe("connected");
        expect(GUI.defaultAllowedTabsWhenDisconnected).not.toContain("esc_melody");
        expect(GUI.defaultAllowedTabs).toContain("esc_melody");
    });
    it("ignores corrupt preferences and filters stale IDs and duplicates", () => {
        localStorage.setItem(LIBRARY_STATE_KEY, "{");
        expect(loadLibraryState(PRESET_MELODIES)).toEqual({ favorites: [], recent: [] });
        saveLibraryState({
            favorites: [PRESET_MELODIES[0].id, "missing", PRESET_MELODIES[0].id],
            recent: PRESET_MELODIES.map((preset) => preset.id),
        });
        const state = loadLibraryState(PRESET_MELODIES);
        expect(state.favorites).toEqual([PRESET_MELODIES[0].id]);
        expect(state.recent).toHaveLength(12);
    });
    it("round-trips every voice independently of device state", () => {
        const melodies = PRESET_MELODIES.slice(0, 4).map((preset) => ({ ...preset, originalEeprom: [123] }));
        saveEditRecovery(melodies, 3);
        const recovered = loadEditRecovery();
        expect(recovered.package.drafts).toHaveLength(4);
        expect(recovered.activeIndex).toBe(3);
        expect(recovered.package.drafts.map((draft) => draft.melody.notes.length)).toEqual(
            melodies.map((melody) => melody.notes.length),
        );
        expect(localStorage.getItem(EDIT_RECOVERY_KEY)).not.toContain("originalEeprom");
    });
    it("refuses oversized voice sets instead of silently dropping voices", () => {
        expect(() => saveEditRecovery(Array(9).fill(PRESET_MELODIES[0]))).toThrow();
        expect(loadEditRecovery()).toBeNull();
    });
    it("does not reuse damaged or oversized recovery content", () => {
        localStorage.setItem(EDIT_RECOVERY_KEY, JSON.stringify({ version: 1, package: { drafts: [] } }));
        expect(loadEditRecovery()).toBeNull();
        localStorage.setItem(EDIT_RECOVERY_KEY, " ".repeat(256 * 1024 + 1));
        expect(loadEditRecovery()).toBeNull();
    });
    it("reports persistence failure without replacing the previous recovery", () => {
        const storage = {
            getItem: () => "{}",
            setItem: () => {
                throw new Error("quota");
            },
        };
        expect(() => saveEditRecovery([PRESET_MELODIES[0]], 0, storage)).toThrow("quota");
        expect(
            loadLibraryState(PRESET_MELODIES, {
                getItem: () => {
                    throw new Error("blocked");
                },
            }),
        ).toEqual({ favorites: [], recent: [] });
    });
});
