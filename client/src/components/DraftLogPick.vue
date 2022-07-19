<template>
	<div class="card-container" v-if="type === 'Draft' || type === 'Rochester Draft'">
		<card
			v-for="(cid, index) in pick.booster"
			:key="index"
			:card="carddata[cid]"
			:language="language"
			:class="{ 'selected-high': pick.pick.includes(index), burned: pick.burn && pick.burn.includes(index) }"
			:lazyLoad="true"
		></card>
	</div>
	<div class="card-container grid3x3" v-else-if="type === 'Grid Draft'">
		<template v-for="(cid, index) in pick.booster">
			<card
				v-if="cid"
				:key="index + '_' + cid"
				:card="carddata[cid]"
				:language="language"
				:class="{ 'selected-high': pick.pick.includes(index) }"
				:lazyLoad="true"
			></card>
			<i v-else :key="index" class="fas fa-times-circle fa-4x" style="color: rgba(255, 255, 255, 0.1)"></i>
		</template>
	</div>
	<!-- Winston Draft; Fail safe -->
	<div class="card-container" v-else>Not Implemented</div>
</template>

<script>
import Card from "./Card.vue";

export default {
	name: "DraftLogPick",
	components: { Card },
	props: {
		pick: { type: Object, required: true },
		carddata: { type: Object, required: true },
		language: { type: String, required: true },
		type: { type: String, default: "Draft" },
	},
};
</script>

<style scoped>
.card {
	margin: 0.75em;
}

.grid3x3 {
	display: grid;
	align-items: center;
	justify-items: center;
	justify-content: center;
	grid-template-columns: 300px 300px 300px;
	grid-template-rows: 300px 300px 300px;
}
</style>
