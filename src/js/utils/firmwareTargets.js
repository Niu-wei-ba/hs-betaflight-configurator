export function normalizeFirmwareTargetDescriptors(targets) {
    if (Array.isArray(targets)) {
        return targets;
    }

    if (Array.isArray(targets?.targetDescriptors)) {
        return targets.targetDescriptors;
    }

    return [];
}

export function groupFirmwareTargetDescriptors(targets) {
    return normalizeFirmwareTargetDescriptors(targets).reduce((groups, descriptor) => {
        const group = descriptor.group ? descriptor.group : "unsupported";
        groups[group] = groups[group] || [];
        groups[group].push(descriptor);
        return groups;
    }, {});
}
