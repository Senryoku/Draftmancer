<template>
	<dropdown
		v-tooltip.top="
			'Control basic lands added on export. \'Auto. Land\' will complete your deck to 40 cards.'
		"
		class="land-control"
	>
		<template v-slot:handle>
			<span v-if="Object.values(lands).every(n => n === 0)"> No lands added </span>
			<span
				v-for="c in ['W', 'U', 'B', 'R', 'G'].filter(c => lands[c] > 0)"
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
			<span class="header">
				<checkbox :value="autoland" @toggle="$emit('update:autoland', !autoland)" label="Autocompletion" />
			</span>
			<button
				v-if="otherbasics"
				@click="$emit('removebasics')"
				style="white-space: normal; height: auto; line-height: 1em; padding: 0.5em"
			>
				Remove other basics from deck
			</button>
		</template>
	</dropdown>
</template>

<script>
import Dropdown from "./Dropdown.vue";
import Checkbox from "./Checkbox.vue";

export default {
	components: { Dropdown, Checkbox },
	props: {
		autoland: { type: Boolean, required: true },
		lands: { type: Object, required: true },
		otherbasics: { type: Boolean },
	},
	methods: {
		add: function(c) {
			this.$emit("update:lands", c, Math.max(0, this.lands[c] + 1));
		},
		rem: function(c) {
			this.$emit("update:lands", c, Math.max(0, this.lands[c] - 1));
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
</style>
