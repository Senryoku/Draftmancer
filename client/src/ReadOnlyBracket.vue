<template>
	<div id="main-container">
		<a href="/"><i class="fas fa-chevron-left"></i> Go back to MTGADraft </a>
		<div class="main">
			<div v-if="bracket">
				<h1>
					Bracket for Session '{{ sessionID }}'
					<span v-if="bracket" style="font-size: 0.8em; font-weight: 1">
						(<template v-if="bracket.teamDraft">Team Draft</template>
						<template v-else-if="bracket.double">Double Elimination</template>
						<template v-else-if="bracket.swiss">3-Round Swiss</template>
						<template v-else>Single Elimination</template>)
					</span>
				</h1>
				<bracket :bracket="bracket" :displayControls="false" :draftlog="draftlog" language="en"></bracket>
			</div>
			<div class="error" v-else>
				<h1>Error</h1>
				<p>{{ error }}</p>
				<span v-if="response" class="small-error">{{ response.statusText }}</span>
			</div>
		</div>
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
			response: null,
			error: null,
			draftlog: null,
		};
	},
	mounted: async function () {
		let urlParamSession = getUrlVars()["session"];
		if (urlParamSession) this.sessionID = decodeURI(urlParamSession);

		try {
			this.response = await fetch(`/getBracket/${this.sessionID}`);
			if (this.response.status === 200) {
				this.bracket = await this.response.json();
				const logResponse = await fetch(`/getDraftLog/${this.sessionID}`);
				if (logResponse.status === 200) this.draftlog = await logResponse.json();
			} else {
				if (this.response.status === 404) {
					this.error = `Bracket not found. Please note that sessions are automatically deleted when there's no player left.`;
				} else {
					this.error = `Status: ${this.response.status}`;
				}
			}
		} catch (e) {
			this.error = "Client-side error.";
		}
	},
};
</script>

<style src="./css/style.css"></style>
<style src="./css/app.css"></style>
<style src="./css/tooltip.css"></style>
<style>
body {
	margin: 0.5em;
}

.main {
	margin: auto;
	width: 90%;
}

.error {
	margin: auto;
	text-align: center;
	width: 50%;
}

.small-error {
	font-style: italic;
	font-size: 0.8em;
}
</style>
