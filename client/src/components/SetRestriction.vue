<template>
	<div class="set-selection">
		<div
			v-for="s in primarySets"
			:key="s.code"
			class="set-button"
			:class="{ 'selected-set': selected(s.code) }"
			@click="toggle(s.code)"
		>
			<img :src="s.icon" class="set-icon" />
			{{ s.fullName }}
		</div>
	</div>
</template>

<script>
import constants from "../data/constants.json";
import SetsInfos from "../../public/data/SetsInfos.json";

export default {
	data: function () {
		return {
			primarySets: constants.PrimarySets.map((s) => SetsInfos[s]),
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

.set-button {
	margin: 0.25em;
	padding: 0.25em;
}

.selected-set {
	box-shadow: 0 0 5px 2px green;
}
</style>