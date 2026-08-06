/** Resolve an application-owned static resource without escaping a hosted version channel. */
export function runtimeAssetUrl(path: string): string {
    const base = String(import.meta.env.BASE_URL || "/");
    const prefix = base === "./" ? "./" : `${base.replace(/\/?$/, "/")}`;
    return `${prefix}${String(path).replace(/^\/+/, "")}`;
}
