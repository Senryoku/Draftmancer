<template>
	<div v-if="bracket">
		<div v-if="displayControls" class="controls">
			<button @click="copyLink" v-tooltip="'Copy link to a read-only version of this bracket to the clipboard.'">
				<font-awesome-icon icon="fa-solid fa-clipboard"></font-awesome-icon> Copy Link to Clipboard
			</button>
			<template v-if="fullcontrol">
				<span v-tooltip="'If set, only the owner will be able to enter results.'">
					<input type="checkbox" id="lock" :checked="locked" @change="lock($event)" />
					<label for="lock"> <font-awesome-icon icon="fa-solid fa-lock"></font-awesome-icon> Lock </label>
				</span>
				<span
					v-tooltip="
						'When enabled, the bracket will be automatically updated based on match results played on MTGO. Make sure all usernames match your MTGO screen names!'
					"
				>
					<input type="checkbox" id="lock" :checked="syncMTGO" @change="syncMTGO($event)" />
					<font-awesome-icon icon="fa-solid fa-sync"></font-awesome-icon> Sync. with MTGO matches
				</span>
				<div style="flex-grow: 1"></div>
				<span>
					Type:
					<template v-if="teamDraft"> Team Draft</template>
					<template v-else>
						<select v-model="typeToGenerate">
							<option value="single">Single Elimination</option>
							<option value="double">Double Elimination</option>
							<option value="swiss">3-Round Swiss</option>
						</select>
					</template>
					<button @click="regenerate">Re-Generate</button>
				</span>
			</template>
			<template v-else>
				<span v-if="locked">
					<font-awesome-icon icon="fa-solid fa-lock"></font-awesome-icon> Bracket is locked. Only the Session
					Owner can enter results.
				</span>
				<span style="font-size: 1.5em">
					<template v-if="isTeamBracket">Team Draft</template>
					<template v-else-if="isDoubleBracket">Double Elimination</template>
					<template v-else-if="isSwissBracket">3-Round Swiss</template>
					<template v-else>Single Elimination</template>
				</span>
			</template>
		</div>
		<h2 v-if="isDoubleBracket">Upper Bracket</h2>
		<div
			class="bracket-columns"
			:style="`--column-count: ${isDoubleBracket ? matches.length + 1 : matches.length}`"
		>
			<div class="bracket-column" v-for="(col, colIndex) in matches" :key="colIndex">
				<!-- Previous round of Swiss isn't done yet -->
				<template v-if="matches[colIndex].length === 0">
					<div style="text-align: center; padding: 1em; max-width: 200px; margin: auto">
						<strong>Round {{ colIndex + 1 }}: TBD</strong><br />
						<small>(Will unlock when all the results of the previous round are entered.)</small>
					</div>
				</template>
				<template v-else>
					<BracketMatch
						v-for="m in col"
						:key="m.index"
						:match="m"
						:result="bracket.results[m.index]"
						:bracket="bracket"
						:records="records"
						:teamrecords="teamRecords"
						:draftlog="draftlog"
						:final="!isDoubleBracket && colIndex === 2"
						:editable="
							editable &&
							!(
								type === 'swiss' &&
								colIndex < matches.length - 1 &&
								matches[colIndex + 1].some(
									(m) => bracket.results[m.index][0] !== 0 || bracket.results[m.index][1] !== 0
								)
							)
						"
						@updated="(index, value) => $emit('updated', m.index, index, value)"
						@selectuser="(user) => (selectedUser = user)"
					/>
				</template>
			</div>
			<div class="bracket-column" v-if="isDoubleBracket">
				<BracketMatch
					:key="final!.index"
					:match="final!"
					:result="bracket.results[final!.index]"
					:bracket="bracket"
					:records="records"
					:teamrecords="teamRecords"
					:draftlog="draftlog"
					:final="true"
					:editable="editable"
					@updated="(index, value) => $emit('updated', final!.index, index, value)"
					@selectuser="(user) => (selectedUser = user)"
				/>
			</div>
		</div>
		<h2 v-if="isDoubleBracket">Lower Bracket</h2>
		<div class="bracket-columns" v-if="isDoubleBracket" :style="`--column-count: ${lowerBracket.length}`">
			<div class="bracket-column" v-for="(col, colIndex) in lowerBracket" :key="colIndex">
				<BracketMatch
					v-for="m in col"
					:key="m.index"
					:match="m"
					:result="bracket.results[m.index]"
					:bracket="bracket"
					:records="records"
					:teamrecords="teamRecords"
					:draftlog="draftlog"
					:editable="editable"
					@updated="(index, value) => $emit('updated', m.index, index, value)"
					@selectuser="(user) => (selectedUser = user)"
				/>
			</div>
		</div>
		<div v-if="draftlog && selectedUser">
			<h1>{{ selectedUser.userName }}'s deck</h1>
			<decklist
				:list="selectedDeckList"
				:carddata="draftlog.carddata"
				:username="selectedUser.userName"
				:language="language"
			/>
		</div>
	</div>
	<div v-else>No valid bracket.</div>
</template>

<script lang="ts">
import { IBracket, Match, PlayerPlaceholder } from "@/Brackets";
import { DraftLog } from "@/DraftLog";
import { Language } from "@/Types";
import { UserID } from "@/IDTypes";

import { defineComponent, PropType } from "vue";
import { copyToClipboard } from "../helper";
import { fireToast } from "../alerts";
import Decklist from "./Decklist.vue";
import BracketMatch, { MatchPlayerData } from "./BracketMatch.vue";
import { BracketType, isSingleBracket, isDoubleBracket, isSwissBracket, isTeamBracket } from "../../../src/Brackets";

function isValid(m: Match) {
	return m.players[0] >= 0 && m.players[1] >= 0;
}

export default defineComponent({
	name: "Bracket",
	components: { Decklist, BracketMatch },
	data(inst) {
		const type = !inst.bracket ? BracketType.Single : inst.bracket.type;
		return {
			selectedUser: null,
			typeToGenerate: type,
		} as { selectedUser: MatchPlayerData | null; typeToGenerate: string };
	},
	props: {
		bracket: { type: Object as PropType<IBracket>, required: true },
		displayControls: { type: Boolean, default: true },
		editable: { type: Boolean, default: false },
		locked: { type: Boolean, default: false },
		fullcontrol: { type: Boolean, default: false },
		teamDraft: { type: Boolean, default: false }, // Used when fullcontrol is true
		sessionID: { type: String },
		draftlog: { type: Object as PropType<DraftLog>, default: null },
		language: { type: String as PropType<Language>, required: true },
	},
	methods: {
		lock(e: Event) {
			this.$emit("lock", (e.target as HTMLInputElement).checked);
		},
		syncMTGO(e: Event) {
			this.$emit("syncBracketMTGO", (e.target as HTMLInputElement).checked);
		},
		copyLink() {
			copyToClipboard(
				`${window.location.protocol}//${window.location.hostname}${
					window.location.port ? ":" + window.location.port : ""
				}/bracket?session=${encodeURI(this.sessionID!)}`
			);
			fireToast("success", "Bracket Link copied to clipboard!");
		},
		hasDeckList(userID: UserID) {
			return this.draftlog && this.draftlog.users[userID] && this.draftlog.users[userID].decklist;
		},

		getPlayer(idx: number): MatchPlayerData {
			return this.bracket.players[idx]
				? { userID: this.bracket.players[idx]!.userID, userName: this.bracket.players[idx]!.userName }
				: { empty: true };
		},
		regenerate() {
			if (this.teamDraft || this.typeToGenerate === "single") {
				this.$emit("generate");
			} else if (this.typeToGenerate === "double") {
				this.$emit("generate-double");
			} else if (this.typeToGenerate === "swiss") {
				this.$emit("generate-swiss");
			}
		},

		realPlayerCount() {
			return this.bracket.players.filter((u) => u && u.userID !== undefined).length;
		},
	},
	computed: {
		type() {
			return this.bracket.type;
		},
		lowerBracket() {
			if (!isDoubleBracket(this.bracket)) return [];
			return this.bracket.lowerBracket;
		},
		final() {
			if (!isDoubleBracket(this.bracket)) return null;
			return this.bracket.matches[3][0];
		},
		records() {
			let r: { [userID: UserID]: { wins: number; losses: number } } = {};
			for (let p of this.bracket.players) if (p) r[p.userID] = { wins: 0, losses: 0 };

			const countMatch = (m: Match) => {
				if (isValid(m) && m.results[0] !== m.results[1]) {
					let winIdx = m.results[0] > m.results[1] ? 0 : 1;
					r[m.players[winIdx]].wins += 1;
					r[m.players[(winIdx + 1) % 2]].losses += 1;
				} else if (
					m.players[1] === PlayerPlaceholder.Empty &&
					m.players[0] !== PlayerPlaceholder.Empty &&
					m.players[0] !== PlayerPlaceholder.TBD
				) {
					r[m.players[0]].wins += 1;
				} else if (
					m.players[0] === PlayerPlaceholder.Empty &&
					m.players[1] !== PlayerPlaceholder.Empty &&
					m.players[1] !== PlayerPlaceholder.TBD
				) {
					r[m.players[1]].wins += 1;
				}
			};

			for (let col of this.bracket.matches) for (let m of col) countMatch(m);
			if (isDoubleBracket(this.bracket)) {
				for (let col of this.lowerBracket) for (let m of col) countMatch(m);
				countMatch(this.final!);
			}

			return r;
		},
		teamRecords() {
			let r = [0, 0];
			for (let col of this.bracket.matches) {
				for (let m of col) {
					if (m.isValid() && this.bracket.results[m.index][0] !== this.bracket.results[m.index][1]) {
						const teamIdx = this.bracket.results[m.index][0] > this.bracket.results[m.index][1] ? 0 : 1;
						r[teamIdx] += 1;
					}
				}
			}
			return r;
		},
		selectedDeckList() {
			if (this.selectedUser?.userID)
				return this.draftlog?.users?.[this.selectedUser?.userID].decklist ?? undefined;
			return undefined;
		},
		isSingleBracket() {
			return isSingleBracket(this.bracket);
		},
		isSwissBracket() {
			return isSwissBracket(this.bracket);
		},
		isTeamBracket() {
			return isTeamBracket(this.bracket);
		},
		isDoubleBracket() {
			return isDoubleBracket(this.bracket);
		},
	},
});
</script>

<style scoped>
.controls {
	padding: 0.5em;
}

.bracket-columns {
	display: grid;
	grid-template-columns: repeat(var(--column-count), 1fr);
}

.bracket-column {
	display: flex;
	flex-direction: column;
	justify-content: space-around;
}
</style>
