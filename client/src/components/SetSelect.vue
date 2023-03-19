<template>
	<div class="set-select" :class="{ expanded: expanded }" @pointerdown.stop>
		<div class="select" @click.stop="toggle">
			<slot name="selection" :values="modelValue">
				<span class="selected-sets" v-if="modelValue.length == 1" :key="modelValue[0]">
					<img
						class="set-icon"
						style="padding-left: 4px; padding-right: 4px"
						:src="SetsInfos[modelValue[0]].icon"
					/>
					<span class="selected-set-name">{{ SetsInfos[modelValue[0]].fullName }}</span>
				</span>
				<span class="selected-sets multiple" v-else-if="modelValue.length > 1" key="multiple">
					<span>({{ modelValue.length }})</span>
					<TransitionGroup name="fade">
						<img v-for="v in modelValue" class="set-icon" :src="SetsInfos[v].icon" :key="v" />
					</TransitionGroup>
				</span>
				<span class="selected-sets placeholder" v-else key="placeholder">All Cards</span>
			</slot>
		</div>
		<div class="options">
			<slot name="beforeList"></slot>
			<div
				v-for="option in options"
				@pointerup.exact.stop="pointerup(option)"
				@pointerup.ctrl.exact.stop="ctrlpointerup(option)"
				@pointerdown="pointerdown($event, option)"
				@pointerout="pointerout(option)"
				class="option"
				:class="{
					'multiselect-selected': modelValue.includes(option),
					ctrl: ctrlPressed,
					'long-press': longPressingSet === option,
				}"
			>
				<slot name="option" :option="option">
					<span class="set-option">
						<img class="set-icon padded-icon" :src="SetsInfos[option].icon" />
						<span class="set-option-name">
							{{ SetsInfos[option].fullName }}
						</span>
					</span>
				</slot>
			</div>
			<slot name="afterList"></slot>
		</div>
	</div>
</template>

<script setup lang="ts">
import { SetCode } from "@/Types";
import SetsInfos from "../SetInfos";
import { ref, onMounted, onUnmounted } from "vue";

const props = defineProps<{
	modelValue: SetCode[];
	options: SetCode[];
}>();

const expanded = ref(false);
const ctrlPressed = ref(false);
const longPressTimeout = ref(null as ReturnType<typeof setTimeout> | null);
const longPressingSet = ref(null as SetCode | null);

const clearLongPress = () => {
	if (longPressTimeout.value) clearTimeout(longPressTimeout.value);
	longPressingSet.value = null;
};

const emit = defineEmits<{
	(e: "update:modelValue", value: SetCode[]): void;
}>();

const add = (c: SetCode) => {
	if (!props.modelValue.includes(c)) emit("update:modelValue", [...props.modelValue, c]);
	else
		emit(
			"update:modelValue",
			props.modelValue.filter((v) => v !== c)
		);
};
const set = (c: SetCode) => emit("update:modelValue", [c]);
const toggle = () => (expanded.value = !expanded.value);
const close = () => (expanded.value = false);
const checkctrl = (e: KeyboardEvent) => (ctrlPressed.value = e.ctrlKey);

const pointerdown = (e: PointerEvent, c: SetCode) => {
	clearLongPress();
	longPressTimeout.value = setTimeout(() => {
		add(c);
		clearLongPress();
	}, 500);
	longPressingSet.value = c;
	e.preventDefault();
	e.stopPropagation();
};
const pointerup = (c: SetCode) => {
	if (c === longPressingSet.value) set(c);
	clearLongPress();
};
const ctrlpointerup = (c: SetCode) => {
	if (c === longPressingSet.value) add(c);
	clearLongPress();
};
const pointerout = (c: SetCode) => {
	if (c === longPressingSet.value) clearLongPress();
};

onMounted(() => {
	document.addEventListener("keydown", checkctrl);
	document.addEventListener("keyup", checkctrl);
	document.addEventListener("pointerdown", close);
});

onUnmounted(() => {
	document.removeEventListener("keydown", checkctrl);
	document.removeEventListener("keyup", checkctrl);
	document.removeEventListener("pointerdown", close);
});
</script>

<style scoped>
* {
	box-sizing: border-box;
}

.set-select {
	display: inline-block;
	position: relative;
	--invertedness: 100%;
	vertical-align: middle;
	width: 16em;
	user-select: none;
}

.select {
	position: relative;
	border-radius: 4px;
	border: 1px solid #888;
	height: 28px;
	width: 16em;
	min-height: auto;
	padding: 0;
	padding-right: 20px;
	background-color: #555;
	cursor: pointer;
}

.expanded .select {
	border-radius: 4px 4px 0 0;
}

.select::after {
	position: absolute;
	right: 5px;
	top: 50%;
	transform: translateY(-50%);
	color: #999;
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
	content: "";
	transition: transform 0.12s ease-in-out;
}

.expanded .select::after {
	transform: translateY(-50%) rotate(180deg);
}

.selected-sets {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	border-radius: 4px;
	height: 28px;
	min-height: auto;
	padding: 4px 5px;
	max-width: 100%;
	font-size: 14px;
	overflow-x: hidden;
	white-space: nowrap;
}

.selected-set-name {
	text-overflow: ellipsis;
	overflow-x: hidden;
	white-space: nowrap;
}

.options {
	position: absolute;
	top: 100%;
	left: 0;
	right: 0;
	z-index: 10;

	display: flex;
	flex-direction: column;
	max-height: 0;
	overflow-y: auto;

	background-color: #555;
	border-radius: 0 0 10px 10px;
	border: 1px solid #888;
	border-top: 0;
	border-bottom: 0;

	filter: drop-shadow(2px 4px 2px rgba(0, 0, 0, 0.5));

	padding: 0;
	transition: max-height 0.14s ease-in-out;
}

.expanded .options {
	max-height: min(400px, 60vh);
}

.option {
	position: relative;
	padding: 5px;
	padding-left: 0;

	cursor: pointer;

	transition: all 100ms ease-in-out;
}

.option:hover {
	background-color: #41b883;
}

.multiselect-selected.option {
	background: #eee;
	color: #222;
	--invertedness: 0%;
}

.option::before {
	position: absolute;
	bottom: 0;
	left: 0;
	width: 100%;
	max-width: 0;
	height: 2px;
	background-color: #41b883;
	transition: max-width 250ms ease-in-out;
	z-index: 1;
	content: "";
}

.multiselect-selected.option:hover::before {
	max-width: 100%;
}

.option.long-press::before {
	transition: max-width 500ms linear;
	max-width: 100%;
	background-color: white;
}

.multiselect-selected.option.long-press::before {
	background-color: #ff6a6a;
	max-width: 0;
}

.multiselect-selected.option.ctrl:hover {
	background: #ff6a6a;
}
.option.ctrl:not(.multiselect-selected):hover::after,
.multiselect-selected.option::after {
	position: absolute;
	top: 50%;
	right: 16px;
	transform: translateY(-50%) translateX(50%);
	line-height: 20px;
	font-size: 10px;
	padding-left: inherit;
	font-family: "Font Awesome 5 Free";
	font-weight: 900;
}

.multiselect-selected.option::after {
	content: "";
}

.option.ctrl:not(.multiselect-selected):hover::after {
	content: "+";
	font-size: 1.35em;
}

.multiselect-selected.option.ctrl:hover::after {
	content: "";
}

.multiselect-selected.option.long-press:hover::after {
	content: "";
}

.placeholder {
	color: #adadad;
}

.set-option {
	display: flex;
	align-items: center;
}

.set-option-name {
	display: inline-block;
	max-width: 14em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
	padding: 5px;
	padding-left: 0;
}
</style>
