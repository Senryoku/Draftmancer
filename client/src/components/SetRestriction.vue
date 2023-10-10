<template>
	<div>
		<div class="state">
			<button @click="addAll()" class="clickable">
				<font-awesome-icon icon="fa-solid fa-plus-square" style="margin-right: 0.5em"></font-awesome-icon>Select
				All
			</button>
			<button @click="clear()" class="clickable">
				<font-awesome-icon icon="fa-solid fa-minus-square" style="margin-right: 0.5em"></font-awesome-icon
				>Deselect All
			</button>
			Current Selection:
			<span v-if="modelValue.length === 0">No set restriction (All cards)</span>
			<span v-else-if="modelValue.length === 1">
				<img
					class="set-icon"
					:src="SetsInfos[modelValue[0]].icon"
					v-tooltip="SetsInfos[modelValue[0]].fullName"
				/>
				{{ SetsInfos[modelValue[0]].fullName }}
			</span>
			<span v-else>
				{{ modelValue.length }} Sets
				<img
					v-for="s in modelValue"
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
						>
							<font-awesome-icon icon="fa-solid fa-plus-square"></font-awesome-icon>
						</span>
						<span
							@click="remove(block.sets.map((s) => s.code))"
							class="clickable"
							v-tooltip="'Remove all sets from this block'"
						>
							<font-awesome-icon icon="fa-solid fa-minus-square"></font-awesome-icon>
						</span>
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
						<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
							><img :src="s.icon" class="set-icon" /> {{ s.fullName }}</span
						>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import { PropType, defineComponent } from "vue";

import constants from "../../../src/Constants";
import { SetInfo, SetsInfos } from "../../../src/SetInfos";
import { SetCode } from "@/Types";

export default defineComponent({
	data() {
		return {
			SetsInfos: SetsInfos,
			blocks: [
				{ name: "MtG: Arena", sets: constants.MTGASets.map((s) => SetsInfos[s]).reverse() },
				{ name: "Alchemy", sets: constants.AlchemySets.map((s) => SetsInfos[s]).reverse() },
				{ name: "Un-sets", sets: ["unf", "und", "ust", "unh", "ugl"].map((s) => SetsInfos[s]) },
				{
					name: "Masters",
					sets: [
						"tsr",
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
		};
	},
	props: {
		modelValue: { type: Array as PropType<SetCode[]>, required: true },
	},
	mounted() {
		const assigned = this.blocks
			.map((b) => b.sets)
			.flat()
			.map((s) => s.code);
		let blocks: { [code: SetCode]: SetInfo[] } = {
			"Shadows over Innistrad Remastered": [], // Manually added to hoist it
		};
		for (let s of constants.PrimarySets.map((s) => SetsInfos[s])) {
			let b = s.block;
			if (!b && assigned.includes(s.code)) continue;
			if (!b) b = "Others";
			if (!(b in blocks)) blocks[b] = [];
			blocks[b].push(s);
		}
		for (let b in blocks) this.blocks.push({ name: b, sets: blocks[b] });
	},
	methods: {
		update(newVal: SetCode[]) {
			this.$emit("update:modelValue", newVal);
		},
		addAll() {
			this.update([...constants.PrimarySets]);
		},
		clear() {
			this.update([]);
		},
		remove(arr: SetCode[]) {
			const newVal = [...this.modelValue];
			for (let s of arr) {
				const index = newVal.indexOf(s);
				if (index !== -1) newVal.splice(index, 1);
			}
			this.update(newVal);
		},
		add(arr: SetCode[]) {
			const newVal = [...this.modelValue];
			for (let s of arr) {
				const index = newVal.indexOf(s);
				if (index === -1) newVal.push(s);
			}
			this.update(newVal);
		},
		toggle(s: SetCode) {
			const newVal = [...this.modelValue];
			const index = newVal.indexOf(s);
			if (index !== -1) {
				newVal.splice(index, 1);
			} else {
				newVal.push(s);
			}
			this.update(newVal);
		},
		selected(s: SetCode) {
			return this.modelValue.includes(s);
		},
	},
});
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
	overflow: hidden;
}

.selected-set {
	background-color: #283828;
	box-shadow: 0 0 5px 2px green;
}
</style>
../../../src/SetInfos
