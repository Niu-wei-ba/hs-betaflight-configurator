import { cloneMelody, normalizeMelody } from "./melody.js";

export const ESC_MELODY_DRAFTS_KEY = "betaflight.esc-melody.drafts.v1";
export const ESC_MELODY_DRAFT_LIMIT = 20;
export const ESC_MELODY_DRAFT_PACKAGE_FORMAT = "betaflight-esc-melody-drafts";
export const ESC_MELODY_DRAFT_PACKAGE_VERSION = 1;
export const ESC_MELODY_DRAFT_FILE_MAX_BYTES = 1024 * 1024;

function normalizedDraftName(value) {
    return String(value || "")
        .trim()
        .slice(0, 32);
}

function serializeDraft(draft) {
    return {
        id: String(draft.id),
        name: normalizedDraftName(draft.name),
        updatedAt: draft.updatedAt,
        melody: cloneMelody(draft.melody),
    };
}

export function loadMelodyDrafts(storage = globalThis.localStorage) {
    if (!storage?.getItem) return [];
    try {
        const value = JSON.parse(storage.getItem(ESC_MELODY_DRAFTS_KEY) || "[]");
        if (!Array.isArray(value)) return [];
        return value
            .filter((draft) => draft?.id && draft?.melody && normalizedDraftName(draft.name))
            .map((draft) => ({
                ...draft,
                name: normalizedDraftName(draft.name),
                melody: normalizeMelody(draft.melody),
            }))
            .slice(0, ESC_MELODY_DRAFT_LIMIT);
    } catch {
        return [];
    }
}

function createDraftId(drafts) {
    const base = `draft-${Date.now().toString(36)}`;
    let id = base;
    let suffix = 2;
    while (drafts.some((draft) => draft.id === id)) {
        id = `${base}-${suffix++}`;
    }
    return id;
}

export function hasMelodyDraftName(drafts, name, excludeId = null) {
    const normalized = normalizedDraftName(name).toLocaleLowerCase();
    return Boolean(
        normalized &&
            drafts.some(
                (draft) => draft.id !== excludeId && normalizedDraftName(draft.name).toLocaleLowerCase() === normalized,
            ),
    );
}

export function createUniqueMelodyDraftName(drafts, requestedName) {
    const base = normalizedDraftName(requestedName) || "未命名草稿";
    if (!hasMelodyDraftName(drafts, base)) return base;
    let suffix = 2;
    while (hasMelodyDraftName(drafts, `${base} (${suffix})`)) suffix += 1;
    return `${base.slice(0, Math.max(1, 28 - String(suffix).length))} (${suffix})`;
}

export function saveMelodyDraft(draft, storage = globalThis.localStorage) {
    const currentDrafts = loadMelodyDrafts(storage);
    const existing = draft.id ? currentDrafts.find((item) => item.id === draft.id) : null;
    if (!existing && currentDrafts.length >= ESC_MELODY_DRAFT_LIMIT) {
        throw new Error(`草稿数量已达到 ${ESC_MELODY_DRAFT_LIMIT} 条上限，请先删除不需要的草稿。`);
    }

    const name = normalizedDraftName(draft.name || draft.melody?.name);
    if (!name) throw new Error("请输入草稿名称。");
    if (hasMelodyDraftName(currentDrafts, name, existing?.id)) {
        throw new Error("已有同名草稿，请使用其他名称。");
    }

    const next = {
        id: existing?.id || createDraftId(currentDrafts),
        name,
        updatedAt: new Date().toISOString(),
        melody: cloneMelody(draft.melody),
    };
    const drafts = currentDrafts.filter((item) => item.id !== next.id);
    drafts.unshift(next);
    if (storage?.setItem) storage.setItem(ESC_MELODY_DRAFTS_KEY, JSON.stringify(drafts));
    return next;
}

export function createMelodyDraft({ name = "未命名草稿", melody = {} } = {}, storage = globalThis.localStorage) {
    const source = melody || {};
    const nextMelody = normalizeMelody({
        name,
        bpm: source.bpm ?? 120,
        key: source.key || "C",
        waitMs: source.waitMs ?? 0,
        notes: source.notes || [],
    });
    return saveMelodyDraft({ name: nextMelody.name, melody: nextMelody }, storage);
}

export function deleteMelodyDraft(id, storage = globalThis.localStorage) {
    const drafts = loadMelodyDrafts(storage);
    const next = drafts.filter((draft) => draft.id !== id);
    if (next.length === drafts.length) return false;
    if (storage?.setItem) storage.setItem(ESC_MELODY_DRAFTS_KEY, JSON.stringify(next));
    return true;
}

export function duplicateMelodyDraft(draft, storage = globalThis.localStorage) {
    const drafts = loadMelodyDrafts(storage);
    const name = createUniqueMelodyDraftName(drafts, `${draft.name} 副本`);
    return saveMelodyDraft({ name, melody: { ...draft.melody, name } }, storage);
}

export function createMelodyDraftPackage(drafts, now = new Date()) {
    return {
        format: ESC_MELODY_DRAFT_PACKAGE_FORMAT,
        version: ESC_MELODY_DRAFT_PACKAGE_VERSION,
        exportedAt: now.toISOString(),
        drafts: drafts.map(serializeDraft),
    };
}

export function parseMelodyDraftPackage(text) {
    if (typeof text !== "string" || !text.trim()) throw new Error("草稿文件为空。");
    if (new TextEncoder().encode(text).byteLength > ESC_MELODY_DRAFT_FILE_MAX_BYTES) {
        throw new Error("草稿文件超过 1 MiB 限制。");
    }

    let value;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error("草稿文件不是有效的 JSON。");
    }
    if (value?.format !== ESC_MELODY_DRAFT_PACKAGE_FORMAT || value?.version !== ESC_MELODY_DRAFT_PACKAGE_VERSION) {
        throw new Error("不支持的草稿文件格式或版本。");
    }
    if (!Array.isArray(value.drafts)) throw new Error("草稿文件缺少 drafts 列表。");

    const ids = new Set();
    const names = new Set();
    const drafts = value.drafts.map((draft, index) => {
        const name = normalizedDraftName(draft?.name);
        const id = String(draft?.id || "");
        if (!id || ids.has(id)) throw new Error(`第 ${index + 1} 条草稿 ID 缺失或重复。`);
        if (!name || names.has(name.toLocaleLowerCase())) {
            throw new Error(`第 ${index + 1} 条草稿名称缺失或重复。`);
        }
        if (!draft?.melody || !Array.isArray(draft.melody.notes)) {
            throw new Error(`第 ${index + 1} 条草稿旋律数据无效。`);
        }
        ids.add(id);
        names.add(name.toLocaleLowerCase());
        return {
            id,
            name,
            updatedAt: draft.updatedAt || value.exportedAt || new Date(0).toISOString(),
            melody: normalizeMelody(draft.melody),
        };
    });
    return { ...value, drafts };
}

export function importMelodyDraftPackage(packageValue, storage = globalThis.localStorage) {
    const current = loadMelodyDrafts(storage);
    const available = ESC_MELODY_DRAFT_LIMIT - current.length;
    if (packageValue.drafts.length > available) {
        throw new Error(`只能再导入 ${available} 条草稿，请先删除不需要的草稿。`);
    }

    const imported = [];
    const next = [...current];
    for (const draft of packageValue.drafts) {
        const name = createUniqueMelodyDraftName(next, draft.name);
        const copy = {
            id: createDraftId([...next, ...imported]),
            name,
            updatedAt: new Date().toISOString(),
            melody: cloneMelody(draft.melody),
        };
        imported.push(copy);
        next.push(copy);
    }
    const combined = [...imported].reverse().concat(current);
    if (storage?.setItem) storage.setItem(ESC_MELODY_DRAFTS_KEY, JSON.stringify(combined));
    return imported;
}
