import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPresetModules(env = {}) {
    vi.resetModules();

    for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, value);
    }

    const [{ default: PresetsGithubRepo }, { default: PresetsWebsiteRepo }, { default: GitHubApi }] = await Promise.all(
        [
            import("../../src/tabs/presets/PresetsRepoIndexed/PresetsGithubRepo.js"),
            import("../../src/tabs/presets/PresetsRepoIndexed/PresetsWebsiteRepo.js"),
            import("../../src/js/GitHubApi.js"),
        ],
    );

    return {
        PresetsGithubRepo,
        PresetsWebsiteRepo,
        GitHubApi,
    };
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe("preset and GitHub proxy configuration", () => {
    it("routes GitHub preset sources through the mirror proxy when enabled", async () => {
        const { PresetsGithubRepo, PresetsWebsiteRepo, GitHubApi } = await loadPresetModules({
            VITE_BUILD_API_BASE_URL: "https://mirror.example.com",
            VITE_PROXY_THIRD_PARTY_PRESETS: "true",
        });

        const githubRepo = new PresetsGithubRepo("https://github.com/foo/bar", "main", false, "Repo");
        const websiteRepo = new PresetsWebsiteRepo("https://example.com/presets", false, "Site");
        const gitHubApi = new GitHubApi();

        expect(githubRepo._urlRaw).toBe(
            "https://mirror.example.com/api/external/raw/https/raw.githubusercontent.com/foo/bar/main/",
        );
        expect(websiteRepo._urlRaw).toBe("https://example.com/presets/");
        expect(gitHubApi.GITHUB_API_URL).toBe("https://mirror.example.com/api/external/github/");
    });

    it("preserves direct third-party preset URLs when proxy is disabled", async () => {
        const { PresetsGithubRepo, PresetsWebsiteRepo } = await loadPresetModules({
            VITE_BUILD_API_BASE_URL: "https://mirror.example.com",
            VITE_PROXY_THIRD_PARTY_PRESETS: "false",
        });

        const githubRepo = new PresetsGithubRepo("https://github.com/foo/bar", "main", false, "Repo");
        const websiteRepo = new PresetsWebsiteRepo("https://example.com/presets", false, "Site");

        expect(githubRepo._urlRaw).toBe("https://raw.githubusercontent.com/foo/bar/main/");
        expect(websiteRepo._urlRaw).toBe("https://example.com/presets/");
    });
});
