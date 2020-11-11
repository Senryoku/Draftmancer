<template>
	<span
		class="basic-land-control"
		v-tooltip.top="
			'Control basic lands added on export. Auto. Land will complete your deck to 40 cards with basic lands.'
		"
	>
		<div class="always-visible">
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
		</div>
		<div class="dropdown">
			<span>
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
				/>
				<input
					class="small-number-input"
					type="number"
					:id="`${c}-mana`"
					:value="lands[c]"
					@input="$emit('update:lands', c, parseInt($event.target.value))"
					min="0"
					max="999"
				/>
				<i class="fas fa-plus fa-lg clickable" @click="add(c)"></i>
			</div>
		</div>
	</span>
</template>

<script>
export default {
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
.basic-land-control {
	position: relative;
	display: inline-block;
	background-color: #444;
	border-radius: 8px 8px 0 0;
	box-shadow: 0 2px 4px 0 #444;
	min-width: 12em;
}

.always-visible {
	margin: 0.25em 0.5em;
	text-align: center;
}

.always-visible .mana-icon {
	vertical-align: text-top;
}

.always-visible span {
	margin: 0 0.25em;
}

.dropdown {
	position: absolute;
	display: flex;
	flex-direction: column;
	top: 100%;
	z-index: 1;
	background-color: #444;
	width: 100%;
	box-sizing: border-box;
	box-shadow: 0 8px 8px 1px rgba(0, 0, 0, 0.5);
	border-radius: 0 0 8px 8px;
	max-height: 0;
	overflow: hidden;
	transition: all 0.2s ease-in-out;
	padding: 0 0.5em;
	text-align: center;
}

.basic-land-control:active .dropdown,
.basic-land-control:hover .dropdown {
	max-height: 500px;
	z-index: 1;
	padding: 0.5em;
}

.land-input {
	display: flex;
	justify-content: space-around;
	align-items: center;
}

.land-input .mana-icon {
	height: 1.4em;
}

.land-input input[type="number"] {
	-moz-appearance: textfield;
	-webkit-appearance: none;
	margin: 0;
}
</style>