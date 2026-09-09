// Keep navigation tabs usable while disabling configuration/actions, including
// controls inserted later by async Vue rendering or teleported select triggers.
const controls = "input, select, textarea, button, [role='button'], [role='combobox'], [role='slider'], canvas";
export function guardSnapshotControls(root) {
    const originals = new Map();
    const allowed = (element) => element?.closest("[role='tab'], [data-snapshot-navigation]");
    const update = () => {
        for (const element of root.querySelectorAll(controls)) {
            if (allowed(element)) continue;
            if (!originals.has(element))
                originals.set(element, {
                    disabled: element.disabled,
                    aria: element.getAttribute("aria-disabled"),
                    tabIndex: element.getAttribute("tabindex"),
                });
            if ("disabled" in element && !element.disabled) element.disabled = true;
            if (element.getAttribute("aria-disabled") !== "true") element.setAttribute("aria-disabled", "true");
            if (element.getAttribute("tabindex") !== "-1") element.setAttribute("tabindex", "-1");
        }
    };
    const block = (event) => {
        if (allowed(event.target)) return;
        const control = event.target.closest?.(`${controls}, a:not([href^='https://']):not([href^='http://'])`);
        if (!control) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    const events = ["click", "keydown", "pointerdown", "input", "change", "submit", "dragstart", "drop"];
    events.forEach((type) => root.addEventListener(type, block, true));
    const observer = new MutationObserver(update);
    observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "aria-disabled", "tabindex"],
    });
    update();
    return () => {
        observer.disconnect();
        events.forEach((type) => root.removeEventListener(type, block, true));
        for (const [element, original] of originals) {
            if ("disabled" in element) element.disabled = original.disabled;
            for (const [key, value] of [
                ["aria-disabled", original.aria],
                ["tabindex", original.tabIndex],
            ]) {
                if (value === null) element.removeAttribute(key);
                else element.setAttribute(key, value);
            }
        }
    };
}
