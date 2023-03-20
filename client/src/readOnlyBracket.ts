import { createApp } from "vue";
import FloatingVue from "floating-vue";
import cardCachePlugin from "./vueCardCache";
import ReadOnlyBracket from "./ReadOnlyBracket.vue";
import { installFontAwesome } from "./install-fontawesome";

const app = createApp(ReadOnlyBracket);
app.use(FloatingVue, {
	placement: "bottom-start",
	boundariesElement: "window",
	delay: 250,
	distance: 8,
});
app.use(cardCachePlugin);
installFontAwesome(app);
app.mount("#main-vue");
