/** Recheck the installed app when it becomes active, without interrupting controller work. */
export function monitorServiceWorkerUpdates(registration?: ServiceWorkerRegistration): () => void {
    if (!registration) return () => {};

    let stopped = false;
    let pending = false;
    const check = () => {
        if (stopped || pending || !navigator.onLine || document.visibilityState === "hidden") return;
        pending = true;
        void registration
            .update()
            .catch((error: unknown) => console.warn("Unable to check for an app update", error))
            .finally(() => {
                pending = false;
            });
    };
    const interval = window.setInterval(check, 15 * 60 * 1000);
    const stop = () => {
        stopped = true;
        window.clearInterval(interval);
        document.removeEventListener("visibilitychange", check);
        window.removeEventListener("online", check);
        window.removeEventListener("pageshow", check);
        window.removeEventListener("pagehide", onPageHide);
    };
    const onPageHide = (event: PageTransitionEvent) => {
        if (!event.persisted) stop();
    };

    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("pagehide", onPageHide);
    check();
    return stop;
}
