import Spectator from "./Spectator.vue";
import { createCommonApp } from "./appCommon.js";

const app = createCommonApp(Spectator);
app.mount("#main-vue");
