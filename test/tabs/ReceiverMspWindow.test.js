import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReceiverMspWindow from "../../src/components/tabs/receiver-msp/ReceiverMspWindow.vue";

describe("Receiver simulator window translations", () => {
    let app;
    let container;

    afterEach(() => {
        app?.unmount();
        container?.remove();
        vi.unstubAllGlobals();
    });

    async function mountWindow() {
        container = document.createElement("div");
        document.body.appendChild(container);
        app = createApp(ReceiverMspWindow);
        app.mount(container);
        await nextTick();
    }

    it("uses the translator handed to the child window by the receiver tab", async () => {
        vi.stubGlobal("opener", {});
        vi.stubGlobal("i18n", { getMessage: (key) => `translated:${key}` });
        await mountWindow();

        expect(document.title).toBe("translated:receiverButtonSticks");
        expect(container.textContent).toContain("translated:receiverMspEnableButton");
        expect(container.querySelector("input").getAttribute("aria-label")).toBe("translated:controlAxisAux1");
    });

    it("keeps an independently opened window usable without a translator", async () => {
        vi.stubGlobal("opener", null);
        vi.stubGlobal("i18n", undefined);
        await mountWindow();

        expect(container.querySelectorAll('input[type="range"]')).toHaveLength(4);
        expect(container.textContent).toContain("receiverMspEnableButton");
    });
});
