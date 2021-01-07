<template>
	<dropdown
		v-tooltip.top="
			'Controls basic lands added on export. \'Auto. Land\' will complete your deck to 40 cards with basic lands.'
		"
		class="land-control"
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
				<input
					type="checkbox"
					id="autoLand"
					:checked="autoland"
					@change="$emit('update:autoland', $event.target.checked)"
				/>
				<label for="autoLand">Auto. Land</label>
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
		</template>
	</dropdown>
</template>

<script>
import Dropdown from "./Dropdown.vue";

export default {
	components: { Dropdown },
	props: {
		autoland: { type: Boolean, required: true },
		lands: { type: Object, required: true },
	},
	methods: {
		add: function (c) {
			this.$emit("update:lands", c, Math.max(0, this.lands[c] + 1));
		},
		rem: function (c) {
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