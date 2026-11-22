import { addCollection } from "@iconify/vue";
import lucide from "@iconify-json/lucide/icons.json";

if (import.meta.env.VITE_WIRING_VIRTUAL_FC === "1") {
    addCollection(lucide);
}
