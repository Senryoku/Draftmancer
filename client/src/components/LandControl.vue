<template>
	<dropdown
		v-tooltip.top="
			`Controls basic lands added on export. \'Auto. Land\' will complete your deck to ${targetDeckSize} cards with basic lands.`
		"
		class="land-control"
		ref="dropdown"
	>
		<template v-slot:handle>
			<span v-if="Object.values(lands).every((n) => n === 0)"> No basic land added. </span>
			<span
				v-for="c in ['W', 'U', 'B', 'R', 'G'].filter((c) => lands[c] > 0)"
				:key="c"
				@click="add(c)"
				@contextmenu.prevent="rem(c)"
				class="clickable"
			>
				<img :src="`img/mana/${c}.svg`" class="mana-icon" />
				{{ lands[c] }}
			</span>
		</template>
		<template v-slot:dropdown>
			<span class="header">
				<checkbox :value="autoland" @toggle="$emit('update:autoland', !autoland)" label="Auto. Land" />
			</span>
			<div class="land-input" v-for="c in ['W', 'U', 'B', 'R', 'G']" :key="c">
				<i class="fas fa-minus fa-lg clickable" @click="rem(c)" :class="{ disabled: lands[c] <= 0 }"></i>
				<img
					:src="`img/mana/${c}.svg`"
					class="mana-icon clickable"
					@click="add(c)"
					@contextmenu.prevent="rem(c)"
					:class="{ 'fade-out': lands[c] <= 0 }"
				/>
				<input
					class="small-number-input"
					type="number"
					:id="`${c}-mana`"
					:value="lands[c]"
					@input="$emit('update:lands', c, $event.target.value === '' ? 0 : parseInt($event.target.value))"
					min="0"
					max="999"
					onclick="this.select();"
				/>
				<i class="fas fa-plus fa-lg clickable" @click="add(c)"></i>
			</div>
			<div class="v-separator" style="height: 0.5em"></div>
			<button
				v-if="otherbasics"
				@click="$emit('removebasics')"
				style="white-space: normal; height: auto; line-height: 1em; padding: 0.5em"
			>
				Remove other basics from deck
			</button>
			<div>
				<label for="deck-size">Deck Size</label>
				<input
					class="small-number-input"
					type="number"
					id="deck-size"
					:value="targetDeckSize"
					@input="
						$emit('update:targetDeckSize', $event.target.value === '' ? 0 : parseInt($event.target.value))
					"
					min="1"
					max="999"
				/>
			</div>
			<div>
				<label for="sideboard-basics">Side. Basics</label>
				<input
					class="small-number-input"
					type="number"
					id="sideboard-basics"
					:value="sideboardBasics"
					@input="
						$emit('update:sideboardBasics', $event.target.value === '' ? 0 : parseInt($event.target.value))
					"
					min="0"
					max="99"
				/>
			</div>
			<div>
				<label for="prefered-basics">Basics Set</label>
				<input
					class="small-input"
					type="text"
					id="prefered-basics"
					:value="preferedBasics"
					@input="$emit('update:preferedBasics', $event.target.value)"
					placeholder="Default"
				/>
			</div>
			<div v-if="preferedBasicsError" class="basics-preview-error">{{ preferedBasicsError }}</div>
			<div v-else class="basics-preview">
				<div class="basics-preview-window">
					<img v-for="url in basicsImages" :src="url" :key="url" @error="onPreferedBasicsError" />
				</div>
			</div>
		</template>
	</dropdown>
</template>

<script lang="ts">
import Constants from "../../../src/Constants";

import Dropdown from "./Dropdown.vue";
import Checkbox from "./Checkbox.vue";
import { CardColor } from "../../../src/CardTypes";

const DefaultPreferedBasicsMessage =
	"Enter the set code of your prefered basic lands, or leave blank to get MTGA's default ones.";

export default {
	components: { Dropdown, Checkbox },
	props: {
		autoland: { type: Boolean, required: true },
		lands: { type: Object, required: true },
		targetDeckSize: { type: Number, required: true },
		sideboardBasics: { type: Number, required: true },
		preferedBasics: { type: String, required: true },
		otherbasics: { type: Boolean },
	},
	data() {
		return { preferedBasicsError: null as string | null };
	},
	mounted() {
		this.checkState();
	},
	methods: {
		add(c: string) {
			this.$emit("update:lands", c, Math.max(0, this.lands[c] + 1));
		},
		rem(c: string) {
			this.$emit("update:lands", c, Math.max(0, this.lands[c] - 1));
		},
		onPreferedBasicsError(/*event*/) {
			if (this.preferedBasics === "") {
				this.preferedBasicsError = DefaultPreferedBasicsMessage;
			} else {
				this.preferedBasicsError = `Could not find basics for set '${this.preferedBasics}'. Importing in Arena may not work.`;
			}
		},
		checkState() {
			if (this.preferedBasics === "") this.preferedBasicsError = DefaultPreferedBasicsMessage;
			else this.preferedBasicsError = null;
			this.$nextTick(() => {
				this.$refs.dropdown.updateHeight();
			});
		},
	},
	computed: {
		basicsImages() {
			let r = [];
			for (let c in CardColor) {
				const name = Constants.BasicLandNames["en"][c as CardColor];
				r.push(`https://api.scryfall.com/cards/named?exact=${name}&set=${this.preferedBasics}&format=image`);
			}
			return r;
		},
	},
	watch: {
		preferedBasics() {
			this.checkState();
		},
	},
};
</script>

<style scoped>
.land-control {
	background-image: url("../assets/img/Land_symbol.svg");
	background-repeat: no-repeat;
	background-size: 1.5em;
	background-position: 0.5em;
}

.fas.disabled {
	background: none;
}

.fade-out {
	opacity: 0.5;
}

.mana-icon {
	vertical-align: text-top;
}

.land-input {
	display: flex;
	justify-content: space-around;
	align-items: center;
}

.land-input .mana-icon {
	height: 1.4em;
}

#main-container .land-input input[type="number"] {
	-moz-appearance: textfield;
	-webkit-appearance: textfield;
	widows: 2em;
	text-align: center;
}

.small-input {
	width: 4em;
}

.basics-preview-error {
	font-size: 0.7em;
	margin-top: 0.2em;
}

.basics-preview {
	position: relative;
	width: 100%;
	height: 150px;
}

.basics-preview-window {
	position: absolute;
	display: flex;
	width: 500%;
	height: 150px;
	overflow-x: hidden;
	animation-name: basics-scrolling;
	animation-duration: 8s;
	animation-iteration-count: infinite;
	animation-direction: alternate;
	animation-timing-function: steps(1, jump-both);
	gap: 2px;
}

.basics-preview img {
	width: 100%;
	border-radius: 5% 5% 0 0;
	object-fit: cover;
	object-position: 0 0;
}

@keyframes basics-scrolling {
	0% {
		left: 0;
		animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
	}
	25% {
		left: calc(-100% - 1px);
		animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
	}
	50% {
		left: calc(-200% - 1px);
		animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
	}
	75% {
		left: calc(-300% - 1px);
		animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
	}
	100% {
		left: calc(-400% - 1px);
		animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1);
	}
}
</style>
