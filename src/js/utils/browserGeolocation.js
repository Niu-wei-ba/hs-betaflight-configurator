export const BrowserGeolocationErrorCode = Object.freeze({
    UNSUPPORTED: "unsupported",
    DENIED: "denied",
    TIMEOUT: "timeout",
    UNAVAILABLE: "unavailable",
});

export class BrowserGeolocationError extends Error {
    constructor(code, cause) {
        super(cause?.message || "Browser geolocation failed", { cause });
        this.name = "BrowserGeolocationError";
        this.code = code;
    }
}

export function parseCoordinatePair(latitudeValue, longitudeValue) {
    const latitude = String(latitudeValue).trim();
    const longitude = String(longitudeValue).trim();
    const lat = latitude === "" ? Number.NaN : Number(latitude);
    const lon = longitude === "" ? Number.NaN : Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return { ok: false, error: "latitude" };
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        return { ok: false, error: "longitude" };
    }
    return { ok: true, coords: { lat, lon } };
}

function classifyGeolocationError(error) {
    switch (error?.code) {
        case 1:
            return BrowserGeolocationErrorCode.DENIED;
        case 3:
            return BrowserGeolocationErrorCode.TIMEOUT;
        default:
            return BrowserGeolocationErrorCode.UNAVAILABLE;
    }
}

function requestPosition(geolocation, options) {
    return new Promise((resolve, reject) => {
        geolocation.getCurrentPosition(
            (position) => {
                const lat = position?.coords?.latitude;
                const lon = position?.coords?.longitude;
                if (
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lon) ||
                    lat < -90 ||
                    lat > 90 ||
                    lon < -180 ||
                    lon > 180
                ) {
                    reject(new BrowserGeolocationError(BrowserGeolocationErrorCode.UNAVAILABLE));
                    return;
                }
                resolve({ lat, lon });
            },
            reject,
            options,
        );
    });
}

/**
 * Get the ground-station coordinates from the browser. A high-accuracy request
 * is attempted first, followed by a lower-accuracy request for devices where
 * high-accuracy positioning is unavailable.
 *
 * @returns {Promise<{lat: number, lon: number}>}
 */
export async function getBrowserCoordinates() {
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation) {
        throw new BrowserGeolocationError(BrowserGeolocationErrorCode.UNSUPPORTED);
    }

    let highAccuracyError;
    try {
        return await requestPosition(geolocation, { enableHighAccuracy: true, timeout: 3000 });
    } catch (error) {
        highAccuracyError = error;
    }

    try {
        return await requestPosition(geolocation, { enableHighAccuracy: false, timeout: 3000 });
    } catch (lowAccuracyError) {
        const error =
            classifyGeolocationError(highAccuracyError) === BrowserGeolocationErrorCode.DENIED
                ? highAccuracyError
                : lowAccuracyError;
        throw new BrowserGeolocationError(classifyGeolocationError(error), error);
    }
}
