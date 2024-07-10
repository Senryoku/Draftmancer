<template>
	<div>
		<div class="state">
			<button @click="addAll()" class="clickable">
				<font-awesome-icon icon="fa-solid fa-plus-square" style="margin-right: 0.5em"></font-awesome-icon>
				Select All
			</button>
			<button @click="clear()" class="clickable">
				<font-awesome-icon icon="fa-solid fa-minus-square" style="margin-right: 0.5em"></font-awesome-icon>
				Deselect All
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
						<span><img :src="s.icon" class="set-icon" /> {{ s.fullName }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import constants from "../../../src/Constants";
import { SetInfo, SetsInfos } from "../../../src/SetInfos";
import { SetCode } from "@/Types";

const props = defineProps<{ modelValue: SetCode[] }>();

const emit = defineEmits<{
	"update:modelValue": [sets: SetCode[]];
}>();

const FilteredBlocks = ["Innistrad: Double Feature", "Shadows over Innistrad Remastered"];
const PreCycleSets = ["arn", "atq", "leg", "drk", "fem", "ice", "hml", "all"];

const blocks = [
	{ name: "MtG: Arena", sets: constants.MTGASets.map((s) => SetsInfos[s]).reverse() },
	{ name: "Alchemy", sets: constants.AlchemySets.map((s) => SetsInfos[s]).reverse() },
	{ name: "Un-sets", sets: ["unf", "und", "ust", "unh", "ugl"].map((s) => SetsInfos[s]) },
	{
		name: "Shadows over Innistrad Remastered",
		sets: ["sir0", "sir1", "sir2", "sir3"].map((s) => SetsInfos[s]),
	}, // Manually added to hoist it
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
];

const assigned = blocks
	.map((b) => b.sets)
	.flat()
	.map((s) => s.code)
	.concat(PreCycleSets);

let unsortedBlocks: { [code: SetCode]: SetInfo[] } = {};
for (let s of constants.PrimarySets.map((s) => SetsInfos[s])) {
	let b = s.block;
	if (b && FilteredBlocks.includes(b)) continue;
	if (!b && assigned.includes(s.code)) continue;
	if (!b) b = "Others";
	if (!(b in unsortedBlocks)) unsortedBlocks[b] = [];
	unsortedBlocks[b].push(s);
}
for (let b in unsortedBlocks) {
	if (unsortedBlocks[b].length === 1) {
		unsortedBlocks["Others"].push(unsortedBlocks[b][0]);
		delete unsortedBlocks[b];
	}
}
for (let b in unsortedBlocks) blocks.push({ name: b, sets: unsortedBlocks[b] });

blocks.push({ name: "Pre-Cycle", sets: PreCycleSets.map((s) => SetsInfos[s]) });

function update(newVal: SetCode[]) {
	emit("update:modelValue", newVal);
}

function addAll() {
	update([...constants.PrimarySets]);
}

function clear() {
	update([]);
}

function remove(arr: SetCode[]) {
	const newVal = [...props.modelValue];
	for (let s of arr) {
		const index = newVal.indexOf(s);
		if (index !== -1) newVal.splice(index, 1);
	}
	update(newVal);
}

function add(arr: SetCode[]) {
	const newVal = [...props.modelValue];
	for (let s of arr) {
		const index = newVal.indexOf(s);
		if (index === -1) newVal.push(s);
	}
	update(newVal);
}

function toggle(s: SetCode) {
	const newVal = [...props.modelValue];
	const index = newVal.indexOf(s);
	if (index !== -1) {
		newVal.splice(index, 1);
	} else {
		newVal.push(s);
	}
	update(newVal);
}

function selected(s: SetCode) {
	return props.modelValue.includes(s);
}
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
	gap: 1em 2em;
	padding-left: 1em;
	padding-right: 1em;
	padding-bottom: 5em;
}

.set-block {
}

.section-title {
	white-space: nowrap;
}

.set-selection {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5em;
}

.set-selection > div {
	flex-basis: max(16em, 13%);
	display: flex;
	align-items: center;
}

.small-block {
	flex-grow: 0;
	flex-basis: 22em;
}

.small-block .set-selection {
	flex-direction: column;
	flex-wrap: nowrap;
}

.small-block .set-selection > div {
	flex-basis: auto;
}

.set-selection .set-icon {
	--invertedness: 100%;
	vertical-align: text-bottom;
	margin-right: 0.25em;
}

.set-selection span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.set-button {
	position: relative;
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
