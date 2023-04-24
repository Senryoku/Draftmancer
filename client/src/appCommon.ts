import { App, createApp } from "vue";
import cardCachePlugin from "./vueCardCache";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";
import Emitter from "pico-emitter";
import { installFontAwesome } from "./install-fontawesome";

const emitter = new Emitter();
declare module "vue" {
	interface ComponentCustomProperties {
		emitter: Emitter;
	}
}

function installCommonFeatures(app: App<Element>) {
	app.config.globalProperties.emitter = emitter;
	app.use(cardCachePlugin);
	app.use(FloatingVue, {
		placement: "bottom-start",
		boundariesElement: "window",
		distance: 8,
		themes: {
			tooltip: {
				delay: 250,
			},
			dropdown: {
				delay: 0,
			},
		},
	});
	installFontAwesome(app);
}

// Wrapper around createApp that adds some common features that we'll assume to be always available everywhere:
// - Event Emitter
// - Scryfall card cache
// - FloatingVue
// - Font Awesome
export function createCommonApp(...args: Parameters<typeof createApp>): App<Element> {
	const app = createApp(...args);
	installCommonFeatures(app);
	return app;
}
