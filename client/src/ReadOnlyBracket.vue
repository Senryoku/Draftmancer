<template>
	<div v-if="bracket">
		<h1>Bracket for Session '{{sessionID}}'</h1>
		<bracket :bracket="bracket" :displayControls="false"></bracket>
	</div>
	<div class="error" v-else>
		<h1>Error</h1>
		{{error}}
	</div>
</template>

<script>
import Vue from "vue";
import VTooltip from "v-tooltip";
import { getUrlVars } from "./helper.js";
import Bracket from "./components/Bracket.vue";

Vue.use(VTooltip);
VTooltip.options.defaultPlacement = "bottom-start";
VTooltip.options.defaultBoundariesElement = "window";

export default {
	components: { Bracket },
	data: () => {
		return {
			bracket: null,
			sessionID: null,
			error: null,
		};
	},
	mounted: async function() {
		let urlParamSession = getUrlVars()["session"];
		if (urlParamSession) this.sessionID = decodeURI(urlParamSession);

		try {
			const response = await fetch(`/getBracket/${this.sessionID}`);
			if (response.status === 200) {
				this.bracket = await response.json();
			} else {
				this.error = response.statusText;
			}
		} catch (e) {
			this.error = "Client-side error: " + e.message;
		}
	},
};
</script>

<style src="./css/style.css"></style>
<style src="./css/tooltip.css"></style>
<style>
body {
	margin: 0.5em;
}

.error {
	margin: 1em;
}
</style>