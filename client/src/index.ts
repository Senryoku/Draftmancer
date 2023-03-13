import { createApp } from "vue";
import App from "./App.vue";
import cardCachePlugin from "./vueCardCache";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";
import mitt from "mitt";

const emitter = mitt();

const app = createApp(App);
app.config.globalProperties.emitter = emitter;
app.config.globalProperties.$cardCache = cardCachePlugin;
app.use(FloatingVue, {
	placement: "bottom-start",
	boundariesElement: "window",
	delay: 250,
	distance: 8,
});
app.mount("#main-vue");
