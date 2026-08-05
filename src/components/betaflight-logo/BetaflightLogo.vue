<template>
    <div class="logo">
        <div class="brand_line">
            <img class="brand_mark" :src="logoUrl" alt="HS-FPV" />
            <div class="brand">{{ appName }}</div>
        </div>
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
import logoUrl from "../../images/hs-logo.png";

const appName = "花生FPV | Betaflight镜像站";

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
            appName,
            logoUrl,
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

.brand_line {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.brand_mark {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    object-fit: contain;
}

.brand {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--text);
    min-width: 0;
    overflow-wrap: anywhere;
}

.logo_text {
    color: var(--text);
    font-size: 10px;
    display: flex;
    flex-direction: column;
}

.tab_container .logo {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}

@media all and (max-width: 1055px) and (min-width: 576px) {
    .tab_container .logo {
        min-width: 0;
        align-items: center;
        padding: 8px 0;
        border-left: 0;
    }

    .tab_container .brand,
    .tab_container .logo_text {
        display: none;
    }
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

    .brand_mark {
        width: 28px;
        height: 28px;
        flex-basis: 28px;
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
</style>
