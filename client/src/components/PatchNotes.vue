<template>
	<ol class="patch-notes">
		<li v-for="(pn, pnIndex) in notes" :key="pnIndex">
			{{pn.date}}
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
			notes: [],
		};
	},
	mounted: function() {
		fetch("data/PatchNotes.json")
			.then(response => response.json())
			.then(json => (this.notes = json));
	},
};
</script>

<style scoped>
.patch-notes {
	list-style-type: none;
}
</style>