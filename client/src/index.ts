import { createApp } from "vue";
import App from "./App.vue";
import cardCachePlugin from "./vueCardCache";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";
import Emitter from "pico-emitter";

const emitter = new Emitter();

const app = createApp(App);
app.config.globalProperties.emitter = emitter;
app.use(cardCachePlugin);
app.use(FloatingVue, {
	placement: "bottom-start",
	boundariesElement: "window",
	delay: 250,
	distance: 8,
});
app.mount("#main-vue");
