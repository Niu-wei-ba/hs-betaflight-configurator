const portalUrl = String(import.meta.env.VITE_VERSION_PORTAL_URL || "").trim();

function getPortalUrl() {
    if (!portalUrl || typeof window === "undefined") {
        return null;
    }

    const target = new URL(portalUrl, window.location.origin);
    const sourceVersion = window.location.pathname.match(/\/v\/(2025\.12\.2|2026\.6\.1)(?:\/|$)/);

    if (sourceVersion) {
        target.searchParams.set("from", sourceVersion[1]);
    }

    return target.origin === window.location.origin ? target.href : null;
}

function mountVersionPicker() {
    const target = getPortalUrl();
    if (!target || document.getElementById("version-picker-link")) {
        return;
    }

    const link = document.createElement("a");
    link.id = "version-picker-link";
    link.href = target;
    link.textContent = "切换版本";
    link.title = "返回地面站版本选择";
    link.setAttribute("aria-label", "返回地面站版本选择");
    link.style.cssText = [
        "position:fixed",
        "right:12px",
        "bottom:12px",
        "z-index:10000",
        "padding:7px 10px",
        "border:1px solid var(--surface-500)",
        "border-radius:6px",
        "background:var(--surface-700)",
        "color:var(--text)",
        "font:600 12px/1.2 sans-serif",
        "text-decoration:none",
        "box-shadow:0 4px 14px rgb(0 0 0 / 25%)",
    ].join(";");
    document.body.append(link);
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mountVersionPicker, { once: true });
    } else {
        mountVersionPicker();
    }
}
