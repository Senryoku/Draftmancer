import { createApp } from "vue";
import FloatingVue from "floating-vue";
import ReadOnlyBracket from "./ReadOnlyBracket.vue";

const app = createApp(ReadOnlyBracket);
app.use(FloatingVue);
app.mount("#main-vue");
