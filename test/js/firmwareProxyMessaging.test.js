import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("firmware proxy messaging", () => {
    it("does not mention COS in firmware download UI, docs, or status copy", () => {
        const projectRoot = process.cwd();
        const files = [
            "README.md",
            ".env.example",
            "src/components/tabs/HelpTab.vue",
            "src/js/BuildApi.js",
            "src/js/tabs/firmware_flasher.js",
            "locales/en/messages.json",
            "locales/zh_CN/messages.json",
        ];

        for (const file of files) {
            const content = fs.readFileSync(path.join(projectRoot, file), "utf8");

            expect(content, file).not.toMatch(/\bCOS\b|UploadingCos|pre-sync/);
        }
    });
});
