<template>
	<div id="main-container">
		<a href="/"><font-awesome-icon icon="fa-solid fa-chevron-left"></font-awesome-icon> Go back to MTGADraft </a>
		<div class="main">
			<div v-if="bracket">
				<h1>
					Bracket for Session '{{ sessionID }}'
					<span v-if="bracket" style="font-size: 0.8em; font-weight: 1">
						(<template v-if="isTeamBracket">Team Draft</template>
						<template v-else-if="isDoubleBracket">Double Elimination</template>
						<template v-else-if="isSwissBracket">3-Round Swiss</template>
						<template v-else>Single Elimination</template>)
					</span>
				</h1>
				<bracket
					:bracket="bracket"
					:displayControls="false"
					:draftlog="draftlog"
					:language="language"
				></bracket>
			</div>
			<div class="error" v-else>
				<h1>Error</h1>
				<p>{{ error }}</p>
				<span v-if="response" class="small-error">{{ response.statusText }}</span>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import type { SessionID } from "@/IDTypes";
import type { DraftLog } from "@/DraftLog";
import { Bracket } from "@/Brackets";

import { defineComponent } from "vue";
import { getUrlVars } from "./helper";
import BracketComponent from "./components/Bracket.vue";
import "floating-vue/dist/style.css";
import { Language } from "../../src/Types";
import { isDoubleBracket, isSwissBracket, isTeamBracket } from "../../src/Brackets";

export default defineComponent({
	components: { Bracket: BracketComponent },
	data: () => {
		return {
			bracket: null as Bracket | null,
			sessionID: null as SessionID | null,
			response: null as Response | null,
			error: null as string | null,
			draftlog: undefined as DraftLog | undefined,
			language: Language.en,
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
	computed: {
		isSwissBracket() {
			return this.bracket && isSwissBracket(this.bracket);
		},
		isTeamBracket() {
			return this.bracket && isTeamBracket(this.bracket);
		},
		isDoubleBracket() {
			return this.bracket && isDoubleBracket(this.bracket);
		},
	},
});
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
