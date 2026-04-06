import { describe, expect, it } from "vitest";
import { createFirmwareApiRuntime } from "../../scripts/firmware-api-adapter.mjs";

describe("firmware api runtime", () => {
    it("serves metadata-backed GET endpoints", () => {
        const runtime = createFirmwareApiRuntime({
            projectRoot: process.cwd(),
            assetUrlPrefix: "/firmware-files",
            assetDirectory: "artifacts/firmware-files",
            supportIdPrefix: "TEST-SUPPORT",
        });

        const response = runtime.handleApiRequest({
            method: "GET",
            pathname: "/api/targets",
            searchParams: new URLSearchParams(),
            body: "",
        });

        expect(response.matched).toBe(true);
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual(
            expect.arrayContaining([expect.objectContaining({ target: "SPEEDYBEEF405V3", group: "supported" })]),
        );
    });

    it("creates build requests and exposes their status", () => {
        const runtime = createFirmwareApiRuntime({
            projectRoot: process.cwd(),
            assetUrlPrefix: "/firmware-files",
            assetDirectory: "artifacts/firmware-files",
            supportIdPrefix: "TEST-SUPPORT",
        });

        const buildResponse = runtime.handleApiRequest({
            method: "POST",
            pathname: "/api/builds",
            searchParams: new URLSearchParams(),
            body: JSON.stringify({
                target: "SPEEDYBEEF405V3",
                release: "2025.12.2",
                options: ["CORE_BUILD"],
            }),
        });

        const buildPayload = JSON.parse(buildResponse.body);

        expect(buildResponse.statusCode).toBe(202);
        expect(buildPayload).toEqual(
            expect.objectContaining({
                key: "bfspeedybeef405v3202512200000000",
                file: "SPEEDYBEEF405V3_2025.12.2.hex",
            }),
        );

        const statusResponse = runtime.handleApiRequest({
            method: "GET",
            pathname: `/api/builds/${buildPayload.key}/status`,
            searchParams: new URLSearchParams(),
            body: "",
        });

        expect(statusResponse.statusCode).toBe(200);
        expect(JSON.parse(statusResponse.body)).toEqual(
            expect.objectContaining({
                status: "success",
            }),
        );

        const rootResponse = runtime.handleApiRequest({
            method: "GET",
            pathname: `/api/builds/${buildPayload.key}`,
            searchParams: new URLSearchParams(),
            body: "",
        });

        expect(rootResponse.statusCode).toBe(200);
        expect(JSON.parse(rootResponse.body)).toEqual(
            expect.objectContaining({
                key: buildPayload.key,
                jsonUrl: `/api/builds/${buildPayload.key}/json`,
                logUrl: `/api/builds/${buildPayload.key}/log`,
            }),
        );

        const logResponse = runtime.handleApiRequest({
            method: "GET",
            pathname: `/api/builds/${buildPayload.key}/log`,
            searchParams: new URLSearchParams(),
            body: "",
        });

        expect(logResponse.statusCode).toBe(200);
        expect(logResponse.body).toContain(`buildKey=${buildPayload.key}`);
        expect(logResponse.body).toContain("target=SPEEDYBEEF405V3");
    });

    it("can return CDN object-key artifact URLs for production deployments", () => {
        const runtime = createFirmwareApiRuntime({
            projectRoot: process.cwd(),
            assetUrlPrefix: "/firmware-files",
            artifactUrlPrefix: "https://cdn.example.com",
            supportIdPrefix: "TEST-SUPPORT",
        });

        const response = runtime.handleApiRequest({
            method: "GET",
            pathname: "/api/firmware/url",
            searchParams: new URLSearchParams({
                version: "2025.12.2",
                target: "SPEEDYBEEF405V3",
            }),
            body: "",
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual(
            expect.objectContaining({
                hit: true,
                source: "cos",
                url: "https://cdn.example.com/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex",
            }),
        );
    });
});
