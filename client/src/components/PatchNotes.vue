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

<script>
export default {
	name: "PatchNotes",
	data: function() {
		return {
			notes: null,
		};
	},
	mounted: async function() {
		this.notes = (await import("../../public/data/PatchNotes.json")).default;
	},
};
</script>

<style scoped>
.patch-notes {
	list-style-type: none;
}
</style>
