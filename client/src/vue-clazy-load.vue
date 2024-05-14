<template>
	<component :is="tag" :class="classes" ref="rootElement">
		<slot v-if="loaded || (img && img.src && img.complete)"><img :src="src" /></slot>
		<slot name="placeholder" v-else></slot>
	</component>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, PropType, getCurrentInstance, nextTick } from "vue";
/*!
 * Vue Clazy Load
 * Component-based lazy (CLazy) load images in Vue.js 2
 * @author Matheus Grieger
 */

/**
 * Modified to test visibility on creation and avoid flickering when the image is already in cache.
 * 15/03/2023: Translated to Typescript
 * 18/03/2024: Moved to script setup syntax
 **/

const props = defineProps({
	tag: { type: String, default: "div" }, // HTML/Component tag name to be used in place of the component
	forceLoad: { type: Boolean, default: false }, // Forces immediate loading
	src: { type: String, required: true }, // Image source URL
	element: String, // IntersectionObserver root element
	// IntersectionObserver threshold
	threshold: {
		type: [Array, Number] as PropType<number | number[]>,
		default: () => [0, 0.5, 1],
	},
	// InserectionObserver visibility ratio
	ratio: {
		type: Number,
		default: 0.4,
		// can't be less than 0 and greater than 1
		validator: (value: number) => value >= 0 && value <= 1,
	},
	margin: { type: String, default: "0px" }, // IntersectionObserver root margin
	// Optional CORS mode ("anonymous" | "use-credentials")
	// @see https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image
	// @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-crossorigin
	crossorigin: {
		type: String as PropType<"anonymous" | "use-credentials">,
		default: null,
		validator: (value: string) => value === "anonymous" || value === "use-credentials",
	},
	loadedClass: { type: String, default: "loaded" }, // Class added to element when it finishes loading
	loadingClass: { type: String, default: "loading" }, // Class added to element while it is loading
	errorClass: { type: String, default: null }, // Class added to element if loading failed
});

const emit = defineEmits<{
	loading: [];
	load: [];
	error: [event: Event];
}>();

const rootElement = ref<HTMLElement | null>(null);

const loaded = ref(false);
const img = ref<HTMLImageElement | null>(new Image());
const observer = ref<IntersectionObserver | null>(null);
const errored = ref(false);

function isVisible() {
	if (!rootElement.value) return false;
	const rect = rootElement.value.getBoundingClientRect();

	return (
		rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
		rect.left <= (window.innerWidth || document.documentElement.clientWidth) &&
		rect.bottom >= 0 &&
		rect.right >= 0
	);
}
// Start loading image
function load() {
	emit("loading");

	// disconnect observer so it doesn't load more than once
	if (observer.value) observer.value.disconnect();

	if (!loaded.value) {
		// function used to clear variables from memory
		const clear = () => {
			img.value = null; // discard fake image
			observer.value = null; // remove observer from memory
		};

		img.value!.addEventListener("load", () => {
			loaded.value = true;
			emit("load"); // emits 'load' event upwards
			clear();
		});
		img.value!.addEventListener("error", (event) => {
			errored.value = true;
			// emits 'error' event upwards adds the original event as argument
			emit("error", event);
			clear();
		});

		// CORS mode configuration
		if (props.crossorigin !== null) img.value!.crossOrigin = props.crossorigin;

		img.value!.src = props.src;
	}
}

// Creates IntersectionObserver instance and observe current element
function observe() {
	const options = {
		threshold: props.threshold,
		root: props.element ? document.querySelector(props.element) : null,
		rootMargin: props.margin, // creates IO instance
	};
	observer.value = new IntersectionObserver((entries) => {
		// as we instantiated one for each component we can directly access the first index
		if (
			(props.ratio === 0 && entries[0].isIntersecting) ||
			(props.ratio > 0 && entries[0].intersectionRatio >= props.ratio)
		)
			load();
	}, options); // start observing main component

	observer.value.observe(rootElement.value!);
}

onMounted(() => {
	if (props.src !== "") {
		// Immediatly load if visible
		if (isVisible() || props.forceLoad) {
			img.value!.src = props.src;
			loaded.value = img.value!.complete; // The image may already be in cache
			if (!loaded.value) load();
			getCurrentInstance()?.proxy?.$forceUpdate();
		} else {
			// Start observing the element visibility
			nextTick(observe);
		}
	}
});

const classes = computed(() => {
	const elementClass = loaded.value ? props.loadedClass : props.loadingClass;
	return errored.value && props.errorClass ? props.errorClass : elementClass;
});
</script>
