<script>
/**
 * Modified to test visibility on creation and avoid flickering when the image is already in cache.
 **/

/*!
 * Vue Clazy Load
 * Component-based lazy (CLazy) load images in Vue.js 2
 * @author Matheus Grieger
 * @version 0.4.2
 */
export default {
	name: "ClazyLoad",
	props: {
		/**
		 * HTML/Component tag name to be used in place of the component
		 * @type {String}
		 * @default div
		 */
		tag: { type: String, default: "div" },

		/**
		 * Image source URL
		 * @type {String}
		 * @required
		 */
		src: { type: String, required: true },

		/**
		 * IntersectionObserver root element
		 * @type {String}
		 */
		element: String,

		/**
		 * IntersectionObserver threshold
		 * @type {Array, Number}
		 */
		threshold: {
			type: [Array, Number],
			default: function _default() {
				return [0, 0.5, 1];
			},
		},

		/**
		 * InserectionObserver visibility ratio
		 * @type {Number}
		 */
		ratio: {
			type: Number,
			default: 0.4,
			validator: function validator(value) {
				// can't be less or equal to 0 and greater than 1
				return value > 0 && value <= 1;
			},
		},

		/**
		 * IntersectionObserver root margin
		 * @type {String}
		 */
		margin: { type: String, default: "0px" },

		/**
		 * Optional CORS mode ("anonymous" | "use-credentials")
		 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image
		 * @see
		 * https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-crossorigin
		 * @type {String}
		 */
		crossorigin: {
			type: String,
			default: null,
			validator: function validator(value) {
				return value === "anonymous" || value === "use-credentials";
			},
		},

		/**
		 * Class added to element when it finishes loading
		 * @type {String}
		 * @default loaded
		 */
		loadedClass: { type: String, default: "loaded" },

		/**
		 * Class added to element while it is loading
		 * @type {String}
		 */
		loadingClass: { type: String, default: "loading" },

		/**
		 * Class added to element if loading failed
		 * @type {String}
		 */
		errorClass: { type: String, default: null },
	},
	data: function data() {
		return { loaded: false, img: new Image(), observer: null, errored: false };
	},
	methods: {
		isVisible: function () {
			var rect = this.$el.getBoundingClientRect();

			return (
				rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
				rect.left <= (window.innerWidth || document.documentElement.clientWidth) &&
				rect.bottom >= 0 &&
				rect.right >= 0
			);
		},
		/**
		 * Start loading image
		 */
		load: function load() {
			var _this = this;

			// emits 'loading' event upwards
			this.$emit("loading"); // disconnect observer
			// so it doesn't load more than once

			if (this.observer) this.observer.disconnect();

			if (!this.loaded) {
				this.img.addEventListener("load", function () {
					_this.loaded = true; // emits 'load' event upwards
					//_this.$forceUpdate();

					_this.$emit("load");

					clear();
				});
				this.img.addEventListener("error", function (event) {
					_this.errored = true; // emits 'error' event upwards
					// adds the original event as argument

					_this.$emit("error", event);

					clear();
				}); // function used to clear variables from memory

				var clear = function clear() {
					// discard fake image
					_this.img = null; // remove observer from memory

					_this.observer = null;
				}; // CORS mode configuration

				if (this.crossorigin !== null) {
					this.img.crossOrigin = this.crossorigin;
				}

				this.img.src = this.src;
			}
		},

		/**
		 * Creates IntersectionObserver instance and observe current element
		 */
		observe: function observe() {
			var _this2 = this;

			var options = {
				threshold: this.threshold,
				root: this.element ? document.querySelector(this.element) : null,
				rootMargin: this.margin, // creates IO instance
			};
			this.observer = new IntersectionObserver(function (entries) {
				// as we instantiated one for each component
				// we can directly access the first index
				if (entries[0].intersectionRatio >= _this2.ratio) {
					_this2.load();
				}
			}, options); // start observing main component

			this.observer.observe(this.$el);
		},
	},
	render: function render(h) {
		// class to be added to element indicating load state
		var elementClass = this.loaded ? this.loadedClass : this.loadingClass;
		return h(
			this.tag,
			{
				// if loading failed adds error class if exists,
				// otherwhise adds elementClass defined above
				class: this.errored && this.errorClass ? this.errorClass : elementClass,
			},
			[
				this.loaded || (this.img && this.img.src && this.img.complete)
					? this.$slots.default || this.$slots.image // allows for "default" slot
					: this.$slots.placeholder,
			]
		);
	},
	mounted: function mounted() {
		// Immediatly load if visible
		if (this.isVisible()) {
			this.img.src = this.src;
			this.loaded = this.img.complete; // The image may already be in cache
			if (!this.loaded) {
				this.load();
			}
			this.$forceUpdate();
		} else {
			// start observing the element visibility
			this.$nextTick(this.observe);
		}
	},
};
</script>