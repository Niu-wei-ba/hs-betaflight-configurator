import { createMelodyDraftPackage, parseMelodyDraftPackage } from "./drafts.js";

export const LIBRARY_STATE_KEY = "betaflight.esc-melody.library.v1";
export const EDIT_RECOVERY_KEY = "betaflight.esc-melody.edit-recovery.v1";

/** Read only known preset IDs; damaged or unavailable browser storage is optional. */
export function loadLibraryState(presets, storage = globalThis.localStorage) {
    const known = new Set(presets.map((preset) => preset.id));
    const validIds = (ids, limit) =>
        Array.isArray(ids) ? [...new Set(ids.filter((id) => known.has(id)))].slice(0, limit) : [];
    try {
        const parsed = JSON.parse(storage.getItem(LIBRARY_STATE_KEY) || "{}");
        return { favorites: validIds(parsed.favorites, presets.length), recent: validIds(parsed.recent, 12) };
    } catch {
        return { favorites: [], recent: [] };
    }
}

export function saveLibraryState(state, storage = globalThis.localStorage) {
    storage.setItem(LIBRARY_STATE_KEY, JSON.stringify(state));
}

/** Recovery stores melodies only, never device fingerprints or EEPROM backups. */
export function saveEditRecovery(melodies, activeIndex = 0, storage = globalThis.localStorage) {
    if (!Array.isArray(melodies) || !melodies.length || melodies.length > 8)
        throw new Error("最多保留八个声部，请先导出完整编排。");
    if (melodies.some((melody) => !Array.isArray(melody?.notes) || melody.notes.length > 512))
        throw new Error("每个保留声部最多512个事件，请先导出完整编排。");
    const drafts = melodies
        .slice(0, 8)
        .map((melody, index) => ({ id: `voice-${index}`, name: `声部 ${index + 1}`, melody }));
    const value = { version: 1, activeIndex, package: createMelodyDraftPackage(drafts) };
    const text = JSON.stringify(value);
    if (new TextEncoder().encode(text).byteLength > 256 * 1024)
        throw new Error("切换前编排超过恢复容量，请先导出草稿。");
    storage.setItem(EDIT_RECOVERY_KEY, text);
    return value;
}

export function loadEditRecovery(storage = globalThis.localStorage) {
    try {
        const text = storage.getItem(EDIT_RECOVERY_KEY);
        if (!text || text.length > 256 * 1024) return null;
        const parsed = JSON.parse(text);
        if (
            parsed?.version !== 1 ||
            !Array.isArray(parsed.package?.drafts) ||
            !parsed.package.drafts.length ||
            parsed.package.drafts.length > 8 ||
            parsed.package.drafts.some(
                (draft) => !Array.isArray(draft?.melody?.notes) || draft.melody.notes.length > 512,
            )
        )
            return null;
        const pack = parseMelodyDraftPackage(JSON.stringify(parsed.package));
        return {
            ...parsed,
            package: pack,
            activeIndex: Math.max(
                0,
                Math.min(pack.drafts.length - 1, Number.isInteger(parsed.activeIndex) ? parsed.activeIndex : 0),
            ),
        };
    } catch {
        return null;
    }
}
