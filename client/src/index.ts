import Vue, { createApp } from "vue";
import App from "./App.vue";
import cardCachePlugin from "./vueCardCache";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";
import mitt from "mitt";

Vue.config.productionTip = false;

Vue.use(cardCachePlugin);
Vue.use(FloatingVue, {
	placement: "bottom-start",
	boundariesElement: "window",
	delay: 250,
	distance: 8,
});

const emitter = mitt();

const app = createApp(App);
app.config.globalProperties.emitter = emitter;
app.mount("#main-vue");
