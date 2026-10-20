import { createApp, defineComponent, h, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FC from "../../src/js/fc.js";

vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn(async () => {}) } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({ mspHelper: {} }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/gui", () => ({ default: { content_ready: vi.fn() } }));
vi.mock("../../src/js/peripherals", () => ({ default: (_id, name) => name }));
vi.mock("../../src/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot: vi.fn() }) }));
vi.mock("../../src/composables/useSaving", () => ({ useSaving: () => ({ runSave: (save) => save() }) }));
vi.mock("../../src/composables/useTabLoad", () => ({ runTabLoad: (load) => load() }));
vi.mock("../../src/components/tabs/BaseTab.vue", () => ({
    default: defineComponent({ setup: (_, { slots }) => () => h("div", slots.default?.()) }),
}));
vi.mock("../../src/components/elements/UiBox.vue", () => ({
    default: defineComponent({ setup: (_, { slots }) => () => h("section", slots.default?.()) }),
}));
vi.mock("../../src/components/elements/SettingRow.vue", () => ({
    default: defineComponent({
        props: ["label"],
        setup: (props, { slots }) => () => h("div", { "data-label": props.label }, slots.default?.()),
    }),
}));
vi.mock("../../src/components/elements/WikiButton.vue", () => ({ default: { render: () => null } }));

describe("Failsafe form firmware compatibility", () => {
    let app;
    let container;
    let pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
        FC.resetState();
        FC.FAILSAFE_CONFIG.failsafe_procedure = 2;
        FC.GPS_RESCUE.minStartDistM = 15;
    });

    afterEach(() => {
        app?.unmount();
        container?.remove();
    });

    async function mountTab(version) {
        FC.CONFIG.apiVersion = version;
        const { default: FailsafeTab } = await import("../../src/components/tabs/FailsafeTab.vue");
        container = document.createElement("div");
        document.body.appendChild(container);
        app = createApp(FailsafeTab);
        app.use(pinia);
        app.config.globalProperties.$t = (key) => key;
        app.mount(container);
        await vi.waitFor(() => expect(container.querySelector("input")).not.toBeNull());
        await nextTick();
    }

    const input = (label) => container.querySelector(`[data-label="${label}"] input`);

    it.each(["1.46.0", "1.47.0", "1.48.0"])("preserves a valid 15m rescue distance on API %s", async (version) => {
        await mountTab(version);
        const distance = input("failsafeGpsRescueItemMinDth");
        expect(distance).not.toBeNull();
        expect(Number(distance.value)).toBe(15);
        distance.dispatchEvent(new Event("blur"));
        await nextTick();
        expect(FC.GPS_RESCUE.minStartDistM).toBe(15);
    });

    it.each([
        ["1.46.0", 50, 5],
        ["1.47.0", 60, 60],
        ["1.48.0", 60, 60],
    ])("displays landing time in seconds on API %s", async (version, stored, displayed) => {
        FC.FAILSAFE_CONFIG.failsafe_procedure = 0;
        FC.FAILSAFE_CONFIG.failsafe_off_delay = stored;
        await mountTab(version);
        const delay = input("failsafeOffDelayItem");
        expect(delay).not.toBeNull();
        expect(Number(delay.value)).toBe(displayed);
        delay.dispatchEvent(new Event("blur"));
        await nextTick();
        expect(FC.FAILSAFE_CONFIG.failsafe_off_delay).toBe(stored);
    });

    it("preserves the default 1.5m/s descent rate after editing", async () => {
        FC.GPS_RESCUE.descendRate = 150;
        await mountTab("1.46.0");
        const rate = input("failsafeGpsRescueItemDescendRate");
        rate.value = "1.5";
        rate.dispatchEvent(new Event("input", { bubbles: true }));
        rate.dispatchEvent(new Event("blur"));
        await nextTick();
        expect(Number(rate.value)).toBe(1.5);
        expect(FC.GPS_RESCUE.descendRate).toBe(150);
    });
});
