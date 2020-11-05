<template>
	<div>
		<h2>MTG: Arena</h2>
		<div class="set-selection">
			<div
				v-for="s in mtgaSets"
				:key="s.code"
				class="set-button clickable"
				:class="{ 'selected-set': selected(s.code) }"
				@click="toggle(s.code)"
			>
				<img :src="s.icon" class="set-icon" />
				{{ s.fullName }}
			</div>
		</div>
		<h2>Others</h2>
		<div class="set-selection">
			<div
				v-for="s in primarySets"
				:key="s.code"
				class="set-button clickable"
				:class="{ 'selected-set': selected(s.code) }"
				@click="toggle(s.code)"
			>
				<img :src="s.icon" class="set-icon" />
				{{ s.fullName }}
			</div>
		</div>
	</div>
</template>

<script>
import constants from "../data/constants.json";
import SetsInfos from "../../public/data/SetsInfos.json";

export default {
	data: function () {
		return {
			mtgaSets: constants.MTGASets.reverse().map((s) => SetsInfos[s]),
			primarySets: constants.PrimarySets.filter((s) => !constants.MTGASets.includes(s)).map((s) => SetsInfos[s]),
		};
	},
	props: {
		setrestriction: { type: Array, required: true },
	},
	methods: {
		toggle: function (s) {
			const index = this.setrestriction.indexOf(s);
			if (index !== -1) {
				this.setrestriction.splice(index, 1);
			} else {
				this.setrestriction.push(s);
			}
		},
		selected: function (s) {
			return this.setrestriction.includes(s);
		},
	},
};
</script>

<style scoped>
.set-selection {
	display: flex;
	flex-wrap: wrap;
	--invertedness: 100%;
}

.set-selection .set-icon {
	vertical-align: text-bottom;
}

.set-button {
	margin: 0.3em;
	padding: 0.3em;
	border-radius: 0.3em;
	background-color: #282828;
	user-select: none;
}

.selected-set {
	background-color: #283828;
	box-shadow: 0 0 5px 2px green;
}
</style>