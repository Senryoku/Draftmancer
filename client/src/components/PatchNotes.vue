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

import PatchNotes from "../data/PatchNotes.json";

export default defineComponent({
	name: "PatchNotes",
	data() {
		return {
			notes: PatchNotes,
		};
	},
});
</script>

<style scoped>
.patch-notes {
	list-style-type: none;
}
</style>
