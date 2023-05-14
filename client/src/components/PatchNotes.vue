<template>
	<ol class="patch-notes">
		<li v-for="(pn, pnIndex) in PatchNotes" :key="pnIndex">
			{{ pn.date }}
			<ul>
				<li v-for="(n, index) in pn.notes" :key="index" v-html="n"></li>
			</ul>
		</li>
	</ol>
</template>

<script setup lang="ts">
import PatchNotes from "../data/PatchNotes.json";
</script>

<style scoped>
.patch-notes {
	list-style-type: none;
}
</style>
