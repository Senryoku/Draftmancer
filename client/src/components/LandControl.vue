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
			<span v-else style="display: flex; gap: 0.5em; justify-content: center">
				<span
					v-for="c in displayedColors"
					:key="c"
					@click="add(c)"
					@contextmenu.prevent="rem(c)"
					class="clickable"
				>
					<img :src="`img/mana/${c}.svg`" class="mana-icon" />
					{{ lands[c] }}
				</span>
			</span>
		</template>
		<template v-slot:dropdown>
			<span class="header">
				<checkbox :value="autoland" @toggle="$emit('update:autoland', !autoland)" label="Auto. Land" />
			</span>
			<div class="land-input" v-for="c in CardColor" :key="c">
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
					@input="updateLands($event, c)"
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
					@input="updateTargetDeckSize"
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
					@input="updateSideboardBasics"
					min="0"
					max="99"
				/>
			</div>
			<div>
				<label for="preferred-basics">Basics Set</label>
				<input
					class="small-input"
					type="text"
					id="preferred-basics"
					:value="preferredBasics"
					@input="updatePreferredBasics"
					placeholder="Default"
				/>
			</div>
			<div v-if="preferredBasicsError" class="basics-preview-error">{{ preferredBasicsError }}</div>
			<div v-else class="basics-preview">
				<div class="basics-preview-window">
					<img v-for="url in basicsImages" :src="url" :key="url" @error="onpreferredBasicsError" />
				</div>
			</div>
		</template>
	</dropdown>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRefs, watch } from "vue";
import Constants from "../../../src/Constants";

import Dropdown from "./Dropdown.vue";
import Checkbox from "./Checkbox.vue";
import { CardColor } from "../../../src/CardTypes";

const DefaultpreferredBasicsMessage =
	"Enter the set code of your preferred basic lands, or leave blank to get MTGA's default ones.";

// Data
const dropdown = ref(null as typeof Dropdown | null);
const preferredBasicsError = ref(null as string | null);

// Props
const props = defineProps<{
	autoland: boolean;
	lands: { [c in CardColor]: number };
	targetDeckSize: number;
	sideboardBasics: number;
	preferredBasics: string;
	otherbasics: boolean;
}>();
const { autoland, lands, targetDeckSize, sideboardBasics, preferredBasics, otherbasics } = toRefs(props);

const emit = defineEmits<{
	(e: "update:lands", color: CardColor, value: number): void;
	(e: "update:targetDeckSize", value: number): void;
	(e: "update:sideboardBasics", value: number): void;
	(e: "update:preferredBasics", set: string): void;
}>();

// Methods;
const add = (c: CardColor) => emit("update:lands", c, Math.max(0, lands.value[c] + 1));
const rem = (c: CardColor) => emit("update:lands", c, Math.max(0, lands.value[c] - 1));

const onpreferredBasicsError = () => {
	preferredBasicsError.value =
		preferredBasics.value === ""
			? DefaultpreferredBasicsMessage
			: `Could not find basics for set '${preferredBasics.value}'. Importing in Arena may not work.`;
};

const checkState = () => {
	preferredBasicsError.value = preferredBasics.value === "" ? DefaultpreferredBasicsMessage : null;
	nextTick(() => {
		dropdown.value?.updateHeight();
	});
};

const updateLands = (event: Event, color: CardColor) => {
	const target = event.target as HTMLInputElement;
	emit("update:lands", color, target.value === "" ? 0 : parseInt(target.value));
};
const updateTargetDeckSize = (event: Event) => {
	const target = event.target as HTMLInputElement;
	emit("update:targetDeckSize", target.value === "" ? 0 : parseInt(target.value));
};
const updateSideboardBasics = (event: Event) => {
	const target = event.target as HTMLInputElement;
	emit("update:sideboardBasics", target.value === "" ? 0 : parseInt(target.value));
};
const updatePreferredBasics = (event: Event) => {
	emit("update:preferredBasics", (event.target as HTMLInputElement).value);
};

onMounted(() => {
	checkState();
});

// Computed
const displayedColors = computed(() => {
	return ["W", "U", "B", "R", "G"].filter((c) => lands.value[c as CardColor] > 0) as CardColor[];
});

const basicsImages = computed(() => {
	let r = [];
	for (let c in CardColor) {
		const name = Constants.BasicLandNames["en"][c as CardColor];
		r.push(`https://api.scryfall.com/cards/named?exact=${name}&set=${preferredBasics.value}&format=image`);
	}
	return r;
});

// Watch
watch(preferredBasics, () => {
	checkState();
});
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
