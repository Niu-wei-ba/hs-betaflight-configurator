// SPDX-License-Identifier: GPL-3.0-or-later
import { conclusionMessages, parseConclusion } from "./ai-conclusion.js";
export const AI_STORAGE_KEY = "passiveTune.ai.v1";
export const DEFAULT_AI_BASE_URL = "https://8stoken.com/v1";

export function normalizeBaseUrl(value) {
    let url;
    try {
        url = new URL(value.trim());
    } catch {
        throw new Error("AI_INVALID_URL");
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
        (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error("AI_INVALID_URL");
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/v1";
    return url.href.replace(/\/$/, "");
}

export function loadAiConfig(storage) {
    const defaults = { baseUrl: DEFAULT_AI_BASE_URL, apiKey: "", model: "" };
    try {
        const saved = JSON.parse(storage.getItem(AI_STORAGE_KEY));
        if (
            saved?.version !== 1 ||
            ![saved.baseUrl, saved.apiKey, saved.model].every((value) => typeof value === "string")
        )
            return defaults;
        return { baseUrl: normalizeBaseUrl(saved.baseUrl), apiKey: saved.apiKey, model: saved.model };
    } catch {
        return defaults;
    }
}

export function saveAiConfig(storage, config) {
    try {
        storage.setItem(AI_STORAGE_KEY, JSON.stringify({ version: 1, ...config }));
    } catch {
        throw new Error("AI_STORAGE_FAILED");
    }
}

/** The relay is required by 8sToken's API, which currently has no browser CORS support. */
export async function providerRequest(config, endpoint, { signal, body, fetchFn = fetch } = {}) {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const apiKey = config.apiKey.trim();
    if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("AI_KEY_REQUIRED");
    if (!["models", "chat/completions"].includes(endpoint)) throw new Error("AI_INVALID_RESPONSE");
    const relay = new URL(baseUrl).origin === "https://8stoken.com";
    const url = relay ? `./__passive-ai/${endpoint}` : `${baseUrl}/${endpoint}`;
    let response;
    try {
        response = await fetchFn(url, {
            method: body ? "POST" : "GET",
            signal,
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                ...(relay ? { "X-AI-Base-URL": baseUrl } : {}),
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error("AI_NETWORK_FAILED");
    }
    if (!response.ok) {
        let relayFailure = null;
        if (relay)
            try {
                relayFailure = await response.json();
            } catch {
                /* Error bodies remain optional. */
            }
        const statusCode = {
            401: "AI_AUTH_FAILED",
            403: "AI_AUTH_FAILED",
            429: "AI_RATE_LIMIT",
            413: "AI_REQUEST_TOO_LARGE",
            504: "AI_TIMEOUT",
        }[response.status];
        const upstreamCode =
            relayFailure?.error === "relay_upstream_failed"
                ? {
                    400: "AI_PROVIDER_REJECTED",
                    402: "AI_PROVIDER_QUOTA",
                    500: "AI_PROVIDER_TEMPORARY",
                    502: "AI_PROVIDER_TEMPORARY",
                    503: "AI_PROVIDER_TEMPORARY",
                    504: "AI_PROVIDER_TEMPORARY",
                }[relayFailure.upstreamStatus]
                : null;
        const networkCode = relayFailure?.error === "relay_network_failed" ? "AI_NETWORK_FAILED" : null;
        throw new Error(
            statusCode ||
                upstreamCode ||
                networkCode ||
                (relay && [404, 405].includes(response.status) ? "AI_RELAY_UNAVAILABLE" : "AI_PROVIDER_FAILED"),
        );
    }
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(relay ? "AI_RELAY_UNAVAILABLE" : "AI_INVALID_RESPONSE");
    }
    return data;
}

export async function fetchModels(config, options) {
    const data = await providerRequest(config, "models", options);
    if (!Array.isArray(data.data)) throw new Error("AI_INVALID_RESPONSE");
    const models = [
        ...new Set(
            data.data.map((item) => item?.id).filter((id) => typeof id === "string" && id.length && id.length <= 256),
        ),
    ].sort();
    if (!models.length) throw new Error("AI_NO_MODELS");
    return models;
}

export { aiEvidence } from "./ai-evidence.js";

export async function explainEvidence(config, evidence, options) {
    const messages = conclusionMessages(evidence);
    const attempts = evidence.schemaVersion === "passive-ai-evidence-1.2" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
        const data = await providerRequest(config, "chat/completions", {
            ...options,
            body: {
                model: config.model,
                stream: false,
                max_tokens: 6000,
                messages: attempt
                    ? [
                        ...messages,
                        {
                            role: "user",
                            content:
                                  "上一份输出未通过本地校验。请重新输出完整JSON，逐项核对：所有字段与示例一致；metricRefs只能复制引用表中的路径，路径第一段必须属于本项evidenceIds，不能引用points数组或猜测字段。findings.text不出现数字且不超过120字；summary不超过150字，每轴结论不超过120字；nextSteps和verification不超过80字，仅补充已有记录或配置，不提出参数修改或快速输入测试。possible_explanation同时具备metricRefs、支持的explanationCategory、limitations、verification。",
                        },
                    ]
                    : messages,
            },
        });
        const message = data.choices?.[0]?.message?.content;
        const content =
            typeof message === "string"
                ? message
                : Array.isArray(message)
                    ? message
                        .filter((part) => part.type === "text")
                        .map((part) => part.text)
                        .join("\n")
                    : "";
        if (!content.trim()) throw new Error("AI_INVALID_RESPONSE");
        if (data.choices[0].finish_reason === "length") throw new Error("AI_TRUNCATED");
        try {
            const conclusion = parseConclusion(content, evidence);
            return {
                conclusion,
                omittedNextSteps: conclusion.omittedNextSteps,
                model: typeof data.model === "string" ? data.model : config.model,
                evidenceVersion: evidence.schemaVersion,
                repairAttempted: attempt > 0,
            };
        } catch (error) {
            if (error.message !== "AI_CONCLUSION_INVALID" || attempt + 1 === attempts || options?.signal?.aborted)
                throw error;
        }
    }
}
