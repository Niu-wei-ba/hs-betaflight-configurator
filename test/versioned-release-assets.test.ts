import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];

afterEach(() => {
    for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function write(path: string, contents: string) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents);
}

function prepareRelease(script: string, args: string[]) {
    const source = readFileSync(join(process.cwd(), "scripts", script), "utf8");
    const remote = source.match(/<<'REMOTE'\n([\s\S]+?)\nREMOTE/)!;
    // Exercise artifact preparation without changing symlinks or deleting fixture releases.
    const preparation = remote[1].split("\nln -sfn ")[0];
    const result = spawnSync("bash", ["-s", "--", ...args], { input: preparation, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
}

describe.each(["2025.12.2", "2026.6.1"])("versioned release asset retention (%s)", (channel) => {
    it("keeps old entry scripts and lazy chunks across two test releases without copying the old shell", () => {
        const root = mkdtempSync(join(tmpdir(), "bfc-release-"));
        fixtures.push(root);
        const app = join(root, "apps", channel);
        const old = join(app, "releases/old");
        write(join(old, "index.html"), "old shell");
        write(join(old, "assets/main-old.js"), "old entry");
        write(join(old, "assets/lazy-old.js"), "old lazy chunk");
        symlinkSync(old, join(app, "current"));

        for (const id of ["next", "latest"]) {
            const next = join(app, "releases", id);
            write(join(next, "index.html"), id);
            write(join(next, "assets/shared.js"), "newest copy");
            prepareRelease("deploy-versioned-test-release.sh", [root, channel, id, "1"]);
            rmSync(old, { recursive: true, force: true });
            expect(readFileSync(join(next, "assets/main-old.js"), "utf8")).toBe("old entry");
            expect(readFileSync(join(next, "assets/lazy-old.js"), "utf8")).toBe("old lazy chunk");
            expect(readFileSync(join(next, "index.html"), "utf8")).toBe(id);
            expect(readFileSync(join(next, "assets/shared.js"), "utf8")).toBe("newest copy");
            rmSync(join(app, "current"));
            symlinkSync(next, join(app, "current"));
        }
    });

    it("retains production-only old assets when promoting an artifact from a different test history", () => {
        const root = mkdtempSync(join(tmpdir(), "bfc-promote-"));
        fixtures.push(root);
        const staging = join(root, "test");
        const production = join(root, "production");
        const staged = join(staging, "apps", channel, "releases/new");
        const old = join(production, "apps", channel, "releases/old");
        write(join(staged, "index.html"), "tested shell");
        write(join(staged, "assets/shared.js"), "tested asset");
        write(join(old, "assets/main-production-only.js"), "old production entry");
        write(join(old, "assets/shared.js"), "previous copy");
        symlinkSync(staged, join(staging, "apps", channel, "current"));
        symlinkSync(old, join(production, "apps", channel, "current"));

        prepareRelease("promote-versioned-release.sh", [staging, production, channel, "new"]);
        const release = join(production, "apps", channel, "releases/new");
        expect(readFileSync(join(release, "assets/main-production-only.js"), "utf8")).toBe("old production entry");
        expect(readFileSync(join(release, "assets/shared.js"), "utf8")).toBe("tested asset");
        expect(readFileSync(join(release, "index.html"), "utf8")).toBe("tested shell");
    });
});
