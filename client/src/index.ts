import AppComponent from "./App.vue";
import { createCommonApp } from "./appCommon";

const app = createCommonApp(AppComponent);
app.mount("#main-vue");
