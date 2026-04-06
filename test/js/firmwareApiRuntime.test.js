import { describe, expect, it } from "vitest";
import { createFirmwareApiRuntime } from "../../scripts/firmware-api-adapter.mjs";

describe("firmware api runtime", () => {
    it("serves metadata-backed GET endpoints", () => {
        const runtime = createFirmwareApiRuntime({
            projectRoot: process.cwd(),
            assetUrlPrefix: "/mock-api/firmware",
            assetDirectory: "mock-api/assets/firmware",
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
            expect.arrayContaining([expect.objectContaining({ target: "HSF405", group: "supported" })]),
        );
    });

    it("creates build requests and exposes their status", () => {
        const runtime = createFirmwareApiRuntime({
            projectRoot: process.cwd(),
            assetUrlPrefix: "/mock-api/firmware",
            assetDirectory: "mock-api/assets/firmware",
            supportIdPrefix: "TEST-SUPPORT",
        });

        const buildResponse = runtime.handleApiRequest({
            method: "POST",
            pathname: "/api/builds",
            searchParams: new URLSearchParams(),
            body: JSON.stringify({
                target: "HSF405",
                release: "2025.12.2",
                options: ["CORE_BUILD"],
            }),
        });

        const buildPayload = JSON.parse(buildResponse.body);

        expect(buildResponse.statusCode).toBe(202);
        expect(buildPayload).toEqual(
            expect.objectContaining({
                key: "mockhsf4052025122000000000000000",
                file: "HSF405_2025.12.2.hex",
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
        expect(logResponse.body).toContain("target=HSF405");
    });
});
