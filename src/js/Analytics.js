class NoopAnalytics {
    constructor() {
        this.EVENT_CATEGORIES = {
            APPLICATION: "Application",
            FLIGHT_CONTROLLER: "FlightController",
            FLASHING: "Flashing",
        };
    }

    send() {}
    sendSettings() {}
    sendEvent() {}
    sendChangeEvents() {}
    sendSaveAndChangeEvents() {}
    sendAppView() {}
    sendTiming() {}
    sendException() {}
    setOptOut() {}
}

let tracking = new NoopAnalytics();

export { tracking };

export function createAnalytics() {
    tracking = new NoopAnalytics();
    window.tracking = tracking;
    return tracking;
}

export function checkSetupAnalytics(callback) {
    if (callback) {
        callback(tracking);
    }
}
