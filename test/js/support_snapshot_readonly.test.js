import { describe, expect, it, vi } from "vitest";
import { guardSnapshotControls } from "../../src/js/support/SnapshotReadOnly";

describe("snapshot read-only controls", () => {
    it("blocks editing/actions while preserving subtab navigation and restores on exit", async () => {
        const root = document.createElement("div");
        root.innerHTML = '<input value="42"><button id="save">保存</button><button role="tab">Rates</button>';
        const save = vi.fn();
        const navigate = vi.fn();
        root.querySelector("#save").addEventListener("click", save);
        root.querySelector("[role=tab]").addEventListener("click", navigate);
        const release = guardSnapshotControls(root);
        expect(root.querySelector("input").disabled).toBe(true);
        root.querySelector("#save").dispatchEvent(new MouseEvent("click", { bubbles: true }));
        root.querySelector("[role=tab]").click();
        expect(save).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledOnce();
        const select = document.createElement("select");
        root.append(select);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(select.disabled).toBe(true);
        release();
        expect(root.querySelector("input").disabled).toBe(false);
        expect(select.disabled).toBe(false);
        root.querySelector("#save").click();
        expect(save).toHaveBeenCalledOnce();
    });
});
