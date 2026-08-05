import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const videos = [
    "BV17D4y1r7jL", "BV1rPwyzLEEg", "BV1tf421o7hH", "BV1iZoVBgEJv",
    "BV1gk4y1u7yv", "BV17gopBPEkj", "BV1Fuw2zDEy3", "BV16K41127Bn",
    "BV1Mnw7zSEnF", "BV1NKg4z8EqL", "BV1Tx31zpEnM", "BV1SV3XzCEPG",
];
const config = await readFile(join(homedir(), ".codex", "config.toml"), "utf8");
const match = config.match(/^SESSDATA\s*=\s*"([^"]+)"\s*$/m);
if (!match) throw new Error("Bilibili MCP SESSDATA is not configured.");

const child = spawn("uvx", ["bilibili-video-info-mcp"], {
    env: { ...process.env, SESSDATA: match[1] },
    stdio: ["pipe", "pipe", "pipe"],
});
let buffer = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
            const message = JSON.parse(line);
            if (message.id !== undefined && pending.has(message.id)) {
                const listener = pending.get(message.id);
                pending.delete(message.id);
                message.error
                    ? listener.reject(new Error(message.error.message ?? JSON.stringify(message.error)))
                    : listener.resolve(message.result);
            }
        } catch {}
    }
});
child.stderr.on("data", () => {});
child.once("error", (error) => {
    for (const listener of pending.values()) listener.reject(error);
});

let requestId = 1;
const request = (method, params) => new Promise((resolve, reject) => {
    const id = requestId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
});

await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "betaflight-configurator", version: "1.0" },
});
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);

const outputDir = ".video-ingest-retry/mcp-raw";
await mkdir(outputDir, { recursive: true });
const results = [];
for (const bvid of videos) {
    try {
        const response = await request("tools/call", {
            name: "get_subtitles",
            arguments: { url: `${"https://www.bilibili.com/video/" + bvid + "/"}` },
        });
        const text = response?.content?.find((item) => item?.type === "text")?.text;
        const subtitle = JSON.parse(text);
        if (!Array.isArray(subtitle.content) || subtitle.content.length === 0) {
            throw new Error("MCP returned no subtitle lines.");
        }
        const raw = {
            source: "bilibili-video-info-mcp",
            lan: subtitle.lan,
            content: subtitle.content,
            mcpResponse: response,
        };
        await writeFile(join(outputDir, `${bvid + ".json"}`), `${JSON.stringify(raw, null, 2) + "\n"}`, "utf8");
        results.push({ bvid, status: "saved", lines: subtitle.content.length });
    } catch (error) {
        results.push({ bvid, status: "failed", error: error.message });
    }
}
child.kill();
console.log(JSON.stringify(results, null, 2));
