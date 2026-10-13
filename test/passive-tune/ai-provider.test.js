import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
    AI_STORAGE_KEY,
    aiEvidence,
    explainEvidence,
    fetchModels,
    loadAiConfig,
    normalizeBaseUrl,
    providerRequest,
    saveAiConfig,
} from "../../src/js/passive-tune/ai-provider.js";
import { aiConclusion, aiResult, aiSource } from "./ai-fixtures.js";
import { analyzeLog } from "../../src/js/passive-tune/analysis.js";
import { makeLog } from "./fixtures.js";
import { usePassiveAi } from "../../src/composables/usePassiveAi.js";
const config = { baseUrl: "https://8stoken.com/v1", apiKey: "test-key", model: "model-a" };
const response = (data) => ({ ok: true, json: async () => data });
const v12Evidence = aiEvidence(analyzeLog(makeLog(), 0), aiSource);
const storage = () => {
    const data = new Map();
    return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value),
        removeItem: (key) => data.delete(key),
    };
};

describe("AI provider and persisted configuration", () => {
    beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });
    it("normalizes API roots and rejects unsafe or ambiguous URLs", () => {
        expect(normalizeBaseUrl(" https://8stoken.com/ ")).toBe(config.baseUrl);
        expect(normalizeBaseUrl("https://other.example/api/v1/")).toBe("https://other.example/api/v1");
        for (const value of [
            "http://8stoken.com",
            "javascript:alert(1)",
            "https://key@8stoken.com",
            "https://8stoken.com/?secret=key",
            "invalid",
        ])
            expect(() => normalizeBaseUrl(value)).toThrow("AI_INVALID_URL");
    });
    it("persists base URL, key and model and tolerates corrupt storage", () => {
        const local = storage();
        saveAiConfig(local, config);
        expect(loadAiConfig(local)).toEqual(config);
        local.setItem(AI_STORAGE_KEY, "invalid json");
        expect(loadAiConfig(local).apiKey).toBe("");
        expect(() =>
            saveAiConfig(
                {
                    setItem() {
                        throw new Error("quota");
                    },
                },
                config,
            ),
        ).toThrow("AI_STORAGE_FAILED");
    });
    it("keeps the page usable when browser storage access is denied", async () => {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
            throw new Error("denied");
        });
        const ai = usePassiveAi();
        Object.assign(ai.draft, config);
        await ai.save();
        expect(ai.error.value).toBe("AI_STORAGE_FAILED");
        expect(fetch).not.toHaveBeenCalled();
    });
    it("uses the bounded same-origin 8sToken relay and a direct API for other providers", async () => {
        fetch.mockResolvedValue(response({ data: [{ id: "b" }, { id: "a" }, { id: "a" }, {}] }));
        expect(await fetchModels(config)).toEqual(["a", "b"]);
        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe("./__passive-ai/models");
        expect(options.headers.Authorization).toBe("Bearer test-key");
        expect(options.headers["X-AI-Base-URL"]).toBe(config.baseUrl);
        expect(options).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" });
        await fetchModels({ ...config, baseUrl: "https://other.example/v1" });
        expect(fetch.mock.calls[1][0]).toBe("https://other.example/v1/models");
    });
    it("reports auth, missing relay and empty models without exposing upstream error text", async () => {
        fetch.mockResolvedValue({ ok: false, status: 401 });
        await expect(providerRequest(config, "models")).rejects.toThrow("AI_AUTH_FAILED");
        fetch.mockResolvedValue({ ok: false, status: 404 });
        await expect(fetchModels(config)).rejects.toThrow("AI_RELAY_UNAVAILABLE");
        fetch.mockResolvedValue(response({ data: [] }));
        await expect(fetchModels(config)).rejects.toThrow("AI_NO_MODELS");
    });
    it("sends only curated evidence and selected model, never raw log or headers", async () => {
        const result = {
            schemaVersion: "0.2",
            algorithmVersion: "core",
            logIndex: 2,
            firmware: "BF",
            timing: { reasonCodes: [], spans: [[0, 100]] },
            axes: { roll: { charts: { samples: [1] }, reasonCodes: [], frequency: null, noise: null } },
            events: [{ gps: 1 }],
            configAtFlight: { rawHeaders: { secret: "hidden" } },
        };
        const evidence = aiEvidence(result, { sha256: "hash", fileName: "private.bbl" });
        fetch.mockResolvedValue(
            response({
                model: "actual-model",
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                ...aiConclusion(),
                                overallStatus: "insufficient_evidence",
                                axes: aiConclusion().axes.map((axis) => ({ ...axis, status: "insufficient_evidence" })),
                            }),
                        },
                        finish_reason: "stop",
                    },
                ],
            }),
        );
        const answer = await explainEvidence(config, evidence);
        const body = JSON.parse(fetch.mock.calls[0][1].body);
        expect(body).toMatchObject({ model: "model-a", stream: false });
        expect(JSON.stringify(body)).not.toMatch(/private\.bbl|rawHeaders|hidden|samples|gps/);
        expect(body.messages[0].content).toContain("不得声称参数已应用");
        expect(answer).toMatchObject({ model: "actual-model", conclusion: { pidDecision: "not_determined" } });
    });
    it("distinguishes bounded relay transport, request and provider errors without exposing returned messages", async () => {
        for (const [status, body, expected] of [
            [
                502,
                { error: "relay_upstream_failed", upstreamStatus: 503, message: "private-key" },
                "AI_PROVIDER_TEMPORARY",
            ],
            [502, { error: "relay_upstream_failed", upstreamStatus: 402 }, "AI_PROVIDER_QUOTA"],
            [502, { error: "relay_network_failed" }, "AI_NETWORK_FAILED"],
            [504, { error: "relay_timeout" }, "AI_TIMEOUT"],
            [413, { error: "relay_request_limit" }, "AI_REQUEST_TOO_LARGE"],
        ]) {
            fetch.mockResolvedValueOnce({ ok: false, status, json: async () => body });
            await expect(fetchModels(config)).rejects.toThrow(expected);
        }
    });
    it("rejects truncated answers instead of presenting partial text as a conclusion", async () => {
        fetch.mockResolvedValue(
            response({ choices: [{ message: { content: "partial JSON" }, finish_reason: "length" }] }),
        );
        await expect(explainEvidence(config, {})).rejects.toThrow("AI_TRUNCATED");
    });
    it.each([
        [{ choices: [{ message: { content: "" }, finish_reason: "length" }] }, "AI_TRUNCATED"],
        [{ choices: [{ message: { content: null }, finish_reason: "stop" }] }, "AI_EMPTY_RESPONSE"],
        [{ choices: [{ message: { content: "  " } }] }, "AI_EMPTY_RESPONSE"],
        [{ choices: [{ message: { content: [null, { type: "text", text: 123 }] } }] }, "AI_EMPTY_RESPONSE"],
        [{ choices: [{ message: { content: null }, finish_reason: "content_filter" }] }, "AI_RESPONSE_REFUSED"],
        [{ choices: [{ message: { content: null, refusal: "private provider message" } }] }, "AI_RESPONSE_REFUSED"],
        [{ choices: [{ message: { content: { text: "unsupported" } } }] }, "AI_INVALID_RESPONSE"],
        [null, "AI_INVALID_RESPONSE"],
        [{ choices: [] }, "AI_INVALID_RESPONSE"],
        [{ error: { message: "private-key" } }, "AI_PROVIDER_FAILED"],
    ])("classifies incomplete provider replies before conclusion validation (%j)", async (body, expected) => {
        fetch.mockResolvedValue(response(body));
        await expect(explainEvidence(config, v12Evidence)).rejects.toThrow(expected);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it("accepts text content blocks while ignoring malformed or non-text blocks", async () => {
        const conclusion = aiConclusion();
        fetch.mockResolvedValue(
            response({
                choices: [
                    {
                        message: {
                            content: [
                                null,
                                { type: "text", text: 123 },
                                { type: "thinking", text: "hidden" },
                                { type: "text", text: JSON.stringify(conclusion) },
                            ],
                        },
                        finish_reason: "stop",
                    },
                ],
            }),
        );
        expect((await explainEvidence(config, aiEvidence(aiResult(), aiSource))).conclusion).toEqual(conclusion);
    });
    it("preserves model-discovery errors when new local evidence arrives", async () => {
        const local = storage();
        saveAiConfig(local, config);
        const ai = usePassiveAi(local);
        fetch.mockResolvedValue({ ok: false, status: 401 });
        await ai.refreshModels();
        ai.clearAnswer();
        expect(ai.error.value).toBe("AI_AUTH_FAILED");
        expect(ai.ready.value).toBe(false);
    });
    it("refreshes models after save, persists switching, and clears configuration", async () => {
        const local = storage();
        const ai = usePassiveAi(local);
        Object.assign(ai.draft, config);
        fetch.mockResolvedValue(response({ data: [{ id: "model-a" }, { id: "model-b" }] }));
        await ai.save();
        ai.selectModel("model-b");
        expect(loadAiConfig(local).model).toBe("model-b");
        const reopened = usePassiveAi(local);
        await reopened.refreshModels();
        expect(reopened.config.model).toBe("model-b");
        ai.clear();
        expect(local.getItem(AI_STORAGE_KEY)).toBeNull();
        expect(ai.models.value).toEqual([]);
        expect(ai.ready.value).toBe(false);
    });
    it("ignores stale model lists when changing credentials and cancellation", async () => {
        const ai = usePassiveAi(storage());
        Object.assign(ai.draft, config);
        let finish;
        fetch.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const old = ai.save();
        ai.draft.apiKey = "new-key";
        fetch.mockResolvedValueOnce(response({ data: [{ id: "new-model" }] }));
        await ai.save();
        finish(response({ data: [{ id: "stale-model" }] }));
        await old;
        expect(ai.models.value).toEqual(["new-model"]);
        expect(ai.config.apiKey).toBe("new-key");
        let late;
        fetch.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    late = resolve;
                }),
        );
        const pending = ai.explain({ source: { sha256: "first" } });
        ai.invalidate();
        late(response({ choices: [{ message: { content: "stale explanation" } }] }));
        await pending;
        expect(ai.answer.value).toBeNull();
    });
});
