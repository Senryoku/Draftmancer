<template>
	<div class="block-container">
		<div
			v-for="block in blocks"
			:key="block.name"
			class="set-block"
			:class="{ 'small-block': block.sets.length <= 3 }"
		>
			<div class="section-title">
				<h2>{{ block.name }}</h2>
				<div class="controls">
					<span @click="add(block.sets.map((s) => s.code))">All</span>
					<span @click="remove(block.sets.map((s) => s.code))">None</span>
				</div>
			</div>
			<div class="set-selection">
				<div
					v-for="s in block.sets"
					:key="s.code"
					class="set-button clickable"
					:class="{ 'selected-set': selected(s.code) }"
					@click="toggle(s.code)"
				>
					<span><img :src="s.icon" class="set-icon" /> {{ s.fullName }}</span>
				</div>
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
			blocks: [
				{ name: "MtG: Arena", sets: constants.MTGASets.map((s) => SetsInfos[s]).reverse() },
				{ name: "Un-sets", sets: ["ugl", "unh", "ust", "und"].map((s) => SetsInfos[s]) },
				{
					name: "Masters",
					sets: [
						"med",
						"me2",
						"me3",
						"me4",
						"vma",
						"tpr",
						"mma",
						"mm2",
						"mm3",
						"ema",
						"ima",
						"a25",
						"uma",
						"2xm",
						"tsr",
					].map((s) => SetsInfos[s]),
				},
			],
		};
	},
	props: {
		setrestriction: { type: Array, required: true },
	},
	mounted: function () {
		const assigned = this.blocks.map((b) => b.sets).flat();
		let blocks = {};
		console.log(assigned);
		for (let s of constants.PrimarySets.map((s) => SetsInfos[s])) {
			let b = s.block;
			if (!b && assigned.includes(s)) continue;
			if (!b) b = "Others";
			if (!(b in blocks)) blocks[b] = [];
			blocks[b].push(s);
		}
		for (let b in blocks) this.blocks.push({ name: b, sets: blocks[b] });
	},
	methods: {
		remove: function (arr) {
			for (let s of arr) {
				const index = this.setrestriction.indexOf(s);
				if (index !== -1) this.setrestriction.splice(index, 1);
			}
		},
		add: function (arr) {
			for (let s of arr) {
				const index = this.setrestriction.indexOf(s);
				if (index === -1) this.setrestriction.push(s);
			}
		},
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
.block-container {
	display: flex;
	flex-wrap: wrap;
}

.set-block {
	margin: 0.5em;
	flex-grow: 1;
}

.small-block {
	flex-basis: 30%;
}

.set-selection {
	display: flex;
	flex-wrap: wrap;
	width: 100%;
}

.set-selection > div {
	flex-basis: 14em;
	display: flex;
	align-items: center;
}

.set-selection .set-icon {
	--invertedness: 100%;
	vertical-align: text-bottom;
}

.set-button {
	margin: 0.25em;
	padding: 0.5em;
	border-radius: 0.3em;
	background-color: #282828;
	user-select: none;
}

.selected-set {
	background-color: #283828;
	box-shadow: 0 0 5px 2px green;
}
</style>