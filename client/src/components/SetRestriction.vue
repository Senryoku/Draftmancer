<template>
	<div>
		<div class="state">
			<button @click="addAll()" class="clickable">
				<i class="fas fa-plus-square" style="margin-right: 0.5em"></i>Select All
			</button>
			<button @click="clear()" class="clickable">
				<i class="fas fa-minus-square" style="margin-right: 0.5em"></i>Deselect All
			</button>
			Current Selection:
			<span v-if="value.length === 0">No set restriction (All cards)</span>
			<span v-else-if="value.length === 1">
				<img class="set-icon" :src="SetsInfos[value[0]].icon" v-tooltip="SetsInfos[value[0]].fullName" />
				{{ SetsInfos[value[0]].fullName }}
			</span>
			<span v-else>
				{{ value.length }} Sets
				<img
					v-for="s in value"
					class="set-icon"
					:src="SetsInfos[s].icon"
					:key="s"
					v-tooltip="SetsInfos[s].fullName"
				/>
			</span>
		</div>
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
						<span
							@click="add(block.sets.map((s) => s.code))"
							class="clickable"
							v-tooltip="'Add all sets from this block'"
							><i class="fas fa-plus-square"></i
						></span>
						<span
							@click="remove(block.sets.map((s) => s.code))"
							class="clickable"
							v-tooltip="'Remove all sets from this block'"
							><i class="fas fa-minus-square"></i
						></span>
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
						<div
							v-if="irregularSets.includes(s.code)"
							class="irregular yellow"
							v-tooltip="'Boosters of this set aren\'t regular 15 cards packs.'"
						>
							<i class="fas fa-exclamation-triangle"></i>
						</div>
					</div>
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
			SetsInfos: SetsInfos,
			blocks: [
				{ name: "MtG: Arena", sets: constants.MTGASets.map((s) => SetsInfos[s]).reverse() },
				{ name: "Un-sets", sets: ["und", "ust", "unh", "ugl"].map((s) => SetsInfos[s]) },
				{
					name: "Masters",
					sets: [
						//"tsr", // Not available yet
						"2xm",
						"uma",
						"a25",
						"ima",
						"mm3",
						"ema",
						"mm2",
						"tpr",
						"vma",
						"mma",
						"me4",
						"me3",
						"me2",
						"me1", // Is 'med' in MTGA and MTGO
					].map((s) => SetsInfos[s]),
				},
			],
			irregularSets: ["cmr", "ugl", "hml", "chr", "fem", "drk", "atq", "arn", "all"],
		};
	},
	props: {
		value: { type: Array, required: true },
	},
	mounted: function () {
		const assigned = this.blocks.map((b) => b.sets).flat();
		let blocks = {};
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
		update(newVal) {
			this.$emit("input", newVal);
		},
		addAll: function () {
			this.update([...constants.PrimarySets]);
		},
		clear: function () {
			this.update([]);
		},
		remove: function (arr) {
			const newVal = [...this.value];
			for (let s of arr) {
				const index = newVal.indexOf(s);
				if (index !== -1) newVal.splice(index, 1);
			}
			this.update(newVal);
		},
		add: function (arr) {
			const newVal = [...this.value];
			for (let s of arr) {
				const index = newVal.indexOf(s);
				if (index === -1) newVal.push(s);
			}
			this.update(newVal);
		},
		toggle: function (s) {
			const newVal = [...this.value];
			const index = newVal.indexOf(s);
			if (index !== -1) {
				newVal.splice(index, 1);
			} else {
				newVal.push(s);
			}
			this.update(newVal);
		},
		selected: function (s) {
			return this.value.includes(s);
		},
	},
};
</script>

<style scoped>
.state {
	padding: 0.5em;
}

.state .set-icon {
	--invertedness: 100%;
	vertical-align: text-bottom;
	margin: 0 0.25em;
}

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
	flex-basis: 16em;
	display: flex;
	align-items: center;
}

.set-selection .set-icon {
	--invertedness: 100%;
	vertical-align: text-bottom;
	margin-right: 0.25em;
}

.set-button {
	position: relative;
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

.irregular {
	position: absolute;
	top: 0;
	right: 0;
	opacity: 0.5;
}
</style>