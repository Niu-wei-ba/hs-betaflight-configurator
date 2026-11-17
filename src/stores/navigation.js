import { defineStore } from "pinia";
import { computed, ref } from "vue";
import GUI from "../js/gui";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";

export const useNavigationStore = defineStore("navigation", () => {
    // Proxy state directly to legacy reactive objects
    // This ensures full bi-directional synchronization during migration

    const activeTab = computed({
        get: () => GUI.active_tab,
        set: (val) => (GUI.active_tab = val),
    });

    const tabSwitchInProgress = computed({
        get: () => GUI.tab_switch_in_progress,
        set: (val) => (GUI.tab_switch_in_progress = val),
    });

    const expertMode = ref(false);
    const escMelodyEnabled = ref(getConfig("escMelodyEnabled").escMelodyEnabled === true);

    /** @param {boolean} enabled */
    function setEscMelodyEnabled(enabled) {
        escMelodyEnabled.value = enabled;
        setConfig({ escMelodyEnabled: enabled });
    }

    // Set to true to imperatively open the OptionsDialog (e.g. on first run).
    // Sidebar.vue consumes and resets this flag.
    const optionsDialogOpen = ref(false);

    function cleanup(callback) {
        GUI.tab_switch_cleanup(callback);
    }

    return {
        activeTab,
        tabSwitchInProgress,
        expertMode,
        escMelodyEnabled,
        setEscMelodyEnabled,
        optionsDialogOpen,
        cleanup,
    };
});
