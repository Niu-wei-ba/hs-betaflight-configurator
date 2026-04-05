<template>
    <div class="logo">
        <div class="brand">{{ appName }}</div>
        <div class="logo_text">
            <span>{{ $t("versionLabelConfigurator") }}: {{ configuratorVersion }}</span>
            <span v-if="firmwareVersion && firmwareId">
                {{ $t("versionLabelFirmware") }}: {{ firmwareVersion }} {{ firmwareId }}
            </span>
            <span v-if="hardwareId">{{ $t("versionLabelTarget") }}: {{ hardwareId }}</span>
        </div>
    </div>
</template>

<script>
import { appConfig } from "../../js/AppConfig";

export default {
    props: {
        configuratorVersion: {
            type: String,
            required: true,
        },
        firmwareVersion: {
            type: String,
            default: "",
        },
        firmwareId: {
            type: String,
            default: "",
        },
        hardwareId: {
            type: String,
            default: "",
        },
    },
    data() {
        return {
            appName: appConfig.appName,
        };
    },
};
</script>

<style>
.logo {
    min-height: 70px;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border-left: 3px solid var(--accent, #eea600);
}

.brand {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--text);
}

.logo_text {
    color: var(--text);
    font-size: 10px;
    display: flex;
    flex-direction: column;
}

.tab_container .logo {
    display: none;
}

@media all and (max-width: 575px) {
    .logo {
        min-height: 24px;
        min-width: 150px;
        order: 2;
        margin-top: 0;
        padding: 6px 10px;
    }

    .brand {
        font-size: 14px;
    }

    .logo_text {
        display: none !important;
    }

    .tab_container .logo {
        display: flex;
        min-height: 120px;
        width: auto;
        margin-top: unset;
        position: relative;
        border-bottom: 1px solid rgba(0, 0, 0, 0.3);
        border-left: 0;
        padding: 20px 12px;
        justify-content: center;
    }

    .tab_container .logo .logo_text {
        display: flex !important;
    }
}

@media all and (min-width: 1125px) {
    .logo {
        min-width: 340px;
    }

    .logo_text {
        font-size: inherit;
        position: relative;
    }
}
</style>
