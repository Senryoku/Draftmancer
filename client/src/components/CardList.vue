<template>
	<div>
		<div
			v-for="(column, colIndex) in columns"
			:key="'col' + colIndex"
			class="cmc-column"
			v-show="column.length > 0"
		>
			<card v-for="(card, index) in column" :key="index" :card="card" :language="$root.language"></card>
		</div>
	</div>
</template>

<script>
import Card from "./Card.vue";
export default {
	components: { Card },
	props: {
		cardlist: { type: Array, required: true },
	},
	computed: {
		columns: function() {
			return this.$root.columnColor(this.cardlist.map(cid => this.$root.genCard(cid)));
		},
	},
};
</script>

<style scoped></style>
