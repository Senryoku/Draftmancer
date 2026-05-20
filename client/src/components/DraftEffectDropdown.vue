<template>
	<span v-if="availableEffects.length === 1">
		{{ singularLabel }}:
		<input type="checkbox" v-model="model" :value="availableEffects[0]" :id="elementID(availableEffects[0])" />
		<label :for="elementID(availableEffects[0])">
			{{ availableEffects[0].name }} ({{ availableEffects[0].effect }})
		</label>
	</span>
	<Dropdown v-if="availableEffects.length > 1" class="large-dropdown">
		<template v-slot:handle>{{ pluralLabel }}</template>
		<template v-slot:dropdown>
			<div v-for="v in availableEffects" :key="v.cardID + v.name + v.effect" style="white-space: nowrap">
				<input type="checkbox" v-model="model" :value="v" :id="v.cardID + v.name + v.effect" />
				<label :for="elementID(v)"> {{ v.name }} ({{ v.effect }}) </label>
			</div>
		</template>
	</Dropdown>
</template>

<script lang="ts" setup>
import { OptionalOnPickDraftEffect, UniqueCardID, UsableDraftEffect } from "@/CardTypes";
import Dropdown from "./Dropdown.vue";

export interface DraftEffect {
	name: string;
	cardID: UniqueCardID;
	effect: UsableDraftEffect | OptionalOnPickDraftEffect;
}

defineProps<{
	availableEffects: DraftEffect[];
	singularLabel: string;
	pluralLabel: string;
}>();

const model = defineModel<DraftEffect[]>({ required: true });

function elementID(v: DraftEffect) {
	return v.cardID + v.name + v.effect;
}
</script>
