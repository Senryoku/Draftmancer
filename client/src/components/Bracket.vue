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
					<input type="checkbox" id="mtgo-sync" :checked="bracket.MTGOSynced" @change="syncMTGO($event)" />
					<font-awesome-icon icon="fa-solid fa-sync"></font-awesome-icon> Sync. with MTGO matches
				</span>
				<div style="flex-grow: 1"></div>
				<span>
					Type:
					<template v-if="teamDraft"><div>Team Draft</div></template>
					<template v-else>
						<select v-model="typeToGenerate">
							<option value="Single">Single Elimination</option>
							<option value="Double">Double Elimination</option>
							<option value="Swiss">3-Round Swiss</option>
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
			:style="`--column-count: ${isDoubleBracket ? bracket.bracket.length + 1 : bracket.bracket.length}`"
		>
			<div class="bracket-column" v-for="(col, colIndex) in bracket.bracket" :key="colIndex">
				<!-- Previous round of Swiss isn't done yet -->
				<template v-if="bracket.bracket[colIndex].length === 0">
					<div style="text-align: center; padding: 1em; max-width: 200px; margin: auto">
						<strong>Round {{ colIndex + 1 }}: TBD</strong><br />
						<small>(Will unlock when all the results of the previous round are entered.)</small>
					</div>
				</template>
				<template v-else>
					<BracketMatch
						v-for="(mID, mIdx) in col"
						:key="`${colIndex}_${mIdx}`"
						:matchID="mID"
						:players="[getPlayer(bracket.matches[mID], 0), getPlayer(bracket.matches[mID], 1)]"
						:teamRecords="teamRecords"
						:draftlog="draftlog"
						:final="!isDoubleBracket && colIndex === 2"
						:editable="
							editable &&
							!(
								type === 'Swiss' &&
								colIndex < bracket.bracket.length - 1 &&
								bracket.bracket[colIndex + 1]
									.map((mID) => bracket.matches[mID])
									.some((m) => m.results[0] !== 0 || m.results[1] !== 0)
							)
						"
						:bracketType="bracket.type"
						@updated="(mID, index, value) => $emit('updated', mID, index, value)"
						@selectuser="(user) => (selectedUser = user)"
					/>
				</template>
			</div>
			<div class="bracket-column" v-if="isDoubleBracket">
				<BracketMatch
					:key="'final'"
					:matchID="final!.id"
					:players="[getPlayer(final!, 0), getPlayer(final!, 1)]"
					:bracketType="bracket.type"
					:draftlog="draftlog"
					:final="true"
					:editable="editable"
					@updated="(mID, index, value) => $emit('updated', mID, index, value)"
					@selectuser="(user) => (selectedUser = user)"
				/>
			</div>
		</div>
		<h2 v-if="isDoubleBracket">Lower Bracket</h2>
		<div class="bracket-columns" v-if="isDoubleBracket" :style="`--column-count: ${lowerBracket!.length}`">
			<div class="bracket-column" v-for="(col, colIndex) in lowerBracket" :key="colIndex">
				<BracketMatch
					v-for="(mID, mIdx) in col"
					:key="`${colIndex}_${mIdx}`"
					:matchID="mID"
					:players="[getPlayer(bracket.matches[mID], 0), getPlayer(bracket.matches[mID], 1)]"
					:bracketType="bracket.type"
					:draftlog="draftlog"
					:editable="editable"
					@updated="(mID, index, value) => $emit('updated', mID, index, value)"
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
import { DraftLog } from "@/DraftLog";
import { Language } from "@/Types";
import { UserID } from "@/IDTypes";

import { defineComponent, PropType } from "vue";
import { copyToClipboard } from "../helper";
import { fireToast } from "../alerts";
import Decklist from "./Decklist.vue";
import BracketMatch, { MatchPlayer } from "./BracketMatch.vue";
import { BracketType, IBracket, isDoubleBracket, Match, PlayerPlaceholder } from "../../../src/Brackets";

function isValid(m: Match) {
	return m.players[0] >= 0 && m.players[1] >= 0;
}
function isPlaceholder(p: number) {
	return p < 0;
}

export default defineComponent({
	name: "Bracket",
	components: { Decklist, BracketMatch },
	data(inst) {
		const type: BracketType = !inst.bracket ? BracketType.Single : inst.bracket.type;
		return {
			selectedUser: null,
			typeToGenerate: type,
		} as { selectedUser: MatchPlayer | null; typeToGenerate: BracketType };
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

		getPlayer(m: Match, idx: number): MatchPlayer | PlayerPlaceholder {
			const playerIdx = m.players[idx];
			if (playerIdx < 0) return playerIdx;
			return {
				userID: this.bracket.players[playerIdx]!.userID,
				userName: this.bracket.players[playerIdx]!.userName,
				result: m.results[idx],
				record: this.records[playerIdx],
			};
		},
		regenerate() {
			this.$emit("generate", this.teamDraft ? BracketType.Team : this.typeToGenerate);
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
			if (!isDoubleBracket(this.bracket)) return null;
			return this.bracket.lowerBracket;
		},
		final() {
			if (!isDoubleBracket(this.bracket)) return null;
			return this.bracket.matches[this.bracket.final];
		},
		records() {
			const r: { wins: number; losses: number }[] = Array(this.bracket.players.length)
				.fill(null)
				.map(() => {
					return { wins: 0, losses: 0 };
				});

			for (let m of this.bracket.matches) {
				if (isValid(m) && m.results[0] !== m.results[1]) {
					let winIdx = m.results[0] > m.results[1] ? 0 : 1;
					r[m.players[winIdx]].wins += 1;
					r[m.players[(winIdx + 1) % 2]].losses += 1;
				} else if (m.players[1] === PlayerPlaceholder.Empty && !isPlaceholder(m.players[0])) {
					r[m.players[0]].wins += 1;
				} else if (m.players[0] === PlayerPlaceholder.Empty && !isPlaceholder(m.players[1])) {
					r[m.players[1]].wins += 1;
				}
			}

			return r;
		},
		teamRecords() {
			let r = [0, 0];
			for (let m of this.bracket.matches) {
				if (isValid(m) && m.results[0] !== m.results[1]) {
					const teamIdx = m.results[0] > m.results[1] ? 0 : 1;
					r[teamIdx] += 1;
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
			return this.bracket.type === BracketType.Single;
		},
		isSwissBracket() {
			return this.bracket.type === BracketType.Swiss;
		},
		isTeamBracket() {
			return this.bracket.type === BracketType.Team;
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
