import { afterEach, describe, expect, it, vi } from "vitest";
import { monitorServiceWorkerUpdates } from "../../src/js/pwaUpdates";

let stop: (() => void) | undefined;
afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

function registration(update: ReturnType<typeof vi.fn>) {
    return { update } as unknown as ServiceWorkerRegistration;
}

describe("PWA update checks", () => {
    it("checks immediately and after returning to the page, without overlapping requests", async () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        let finish!: () => void;
        const update = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
        stop = monitorServiceWorkerUpdates(registration(update));
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("online"));
        expect(update).toHaveBeenCalledTimes(1);
        finish();
        await new Promise((resolve) => setTimeout(resolve, 0));
        window.dispatchEvent(new Event("pageshow"));
        expect(update).toHaveBeenCalledTimes(2);
    });

    it("waits for connectivity and checks long-lived pages on a timer", async () => {
        vi.useFakeTimers();
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
        const update = vi.fn().mockResolvedValue(undefined);
        stop = monitorServiceWorkerUpdates(registration(update));
        await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
        expect(update).not.toHaveBeenCalled();
        online.mockReturnValue(true);
        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(0);
        expect(update).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
        expect(update).toHaveBeenCalledTimes(2);
        stop();
        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
        expect(update).toHaveBeenCalledTimes(2);
    });

    it("recovers from a failed update check without reloading or activating a worker", async () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const update = vi.fn().mockRejectedValueOnce(new Error("network error")).mockResolvedValue(undefined);
        stop = monitorServiceWorkerUpdates(registration(update));
        await new Promise((resolve) => setTimeout(resolve, 0));
        document.dispatchEvent(new Event("visibilitychange"));
        expect(update).toHaveBeenCalledTimes(2);
    });
});
