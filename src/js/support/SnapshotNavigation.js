export function isSupportSnapshotMenuVisible(connection) {
    return Boolean(
        connection.supportSnapshotMode ||
        (!connection.connectionValid &&
            !connection.connectingTo &&
            !connection.connectedTo &&
            ["IDLE", "FAILED"].includes(connection.connectionPhase)),
    );
}
