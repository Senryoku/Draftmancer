<template>
	<ol class="patch-notes">
		<li v-for="(pn, pnIndex) in notes" :key="pnIndex">
			{{ pn.date }}
			<ul>
				<li v-for="(n, index) in pn.notes" :key="index" v-html="n"></li>
			</ul>
		</li>
	</ol>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
	name: "PatchNotes",
	data() {
		return {
			notes: null as { date: string; notes: string[] }[] | null,
		};
	},
	async mounted() {
		this.notes = (await import("../../public/data/PatchNotes.json")).default;
	},
});
</script>

<style scoped>
.patch-notes {
	list-style-type: none;
}
</style>
