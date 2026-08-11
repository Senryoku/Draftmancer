<template>
	<div v-if="bracket">
		<div v-if="displayControls" class="controls">
			<button @click="copyLink" v-tooltip="'Copy link to a read-only version of this bracket to the clipboard.'">
				<font-awesome-icon icon="fa-solid fa-clipboard" /> Copy Link to Clipboard
			</button>
			<template v-if="fullcontrol">
				<span v-tooltip="'If set, only the owner will be able to enter results.'">
					<input type="checkbox" id="lock" :checked="locked" @change="lock($event)" />
					<label for="lock"> <font-awesome-icon icon="fa-solid fa-lock" /> Lock </label>
				</span>
				<span
					v-tooltip="
						'When enabled, the bracket will be automatically updated based on match results played on MTGO. Make sure all usernames match your MTGO screen names!'
					"
				>
					<input type="checkbox" id="mtgo-sync" :checked="bracket.MTGOSynced" @change="syncMTGO($event)" />
					<label for="mtgo-sync">
						<font-awesome-icon icon="fa-solid fa-sync" /> Sync. with MTGO matches
					</label>
				</span>
				<div style="flex-grow: 1"></div>
				<template v-if="teamDraft">
					<span>Team Draft</span><span>{{ teamRecords[0] }} - {{ teamRecords[1] }}</span>
				</template>
				<template v-else>
					<select v-model="typeToGenerate">
						<option value="Single">Single Elimination</option>
						<option value="Double">Double Elimination</option>
						<option value="Swiss">3-Round Swiss</option>
					</select>
				</template>
				<button @click="regenerate">Re-Generate</button>
			</template>
			<template v-else>
				<span v-if="locked">
					<font-awesome-icon icon="fa-solid fa-lock" /> Bracket is locked. Only the Session Owner can enter
					results.
				</span>
				<span v-if="bracket.MTGOSynced"> <font-awesome-icon icon="fa-solid fa-sync" /> Synced with MTGO </span>
				<div style="flex-grow: 1"></div>
				<span style="font-size: 1.5em">
					<template v-if="isTeamBracket">
						Team Draft <span>{{ teamRecords[0] }} - {{ teamRecords[1] }}</span>
					</template>
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
						:userID="userID"
						:matchID="mID"
						:players="[getPlayer(bracket.matches[mID], 0), getPlayer(bracket.matches[mID], 1)]"
						:teamRecords="teamRecords"
						:teamWinThreshold="bracket.players.length > 6 ? 7 : 5"
						:draftlog="draftlog"
						:final="!isDoubleBracket && colIndex === bracket.bracket.length - 1"
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
						@updated="(mID: number, index: number, value: number) => $emit('updated', mID, index, value)"
						@selectuser="(user: MatchPlayer) => (selectedUser = user)"
						@join-moxgate-match="(matchID: number) => emit('join-moxgate-match', matchID)"
					/>
				</template>
			</div>
			<div class="bracket-column" v-if="isDoubleBracket">
				<BracketMatch
					:key="'final'"
					:matchID="final!.id"
					:userID="userID"
					:players="[getPlayer(final!, 0), getPlayer(final!, 1)]"
					:bracketType="bracket.type"
					:draftlog="draftlog"
					:final="true"
					:editable="editable"
					@updated="(mID: number, index: number, value: number) => $emit('updated', mID, index, value)"
					@selectuser="(user: MatchPlayer) => (selectedUser = user)"
					@join-moxgate-match="(matchID: number) => emit('join-moxgate-match', matchID)"
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
					:userID="userID"
					:players="[getPlayer(bracket.matches[mID], 0), getPlayer(bracket.matches[mID], 1)]"
					:bracketType="bracket.type"
					:draftlog="draftlog"
					:editable="editable"
					@updated="(mID: number, index: number, value: number) => $emit('updated', mID, index, value)"
					@selectuser="(user: MatchPlayer) => (selectedUser = user)"
					@join-moxgate-match="(matchID: number) => emit('join-moxgate-match', matchID)"
				/>
			</div>
		</div>
		<div v-if="draftlog && selectedUser">
			<h1>{{ selectedUser.userName }}'s deck</h1>
			<Decklist
				:list="selectedDeckList"
				:carddata="draftlog.carddata"
				:username="selectedUser.userName"
				:language="language"
			/>
		</div>
	</div>
	<div v-else>No valid bracket.</div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { DraftLog } from "@/DraftLog";
import type { Language } from "@/Types";
import { UserID } from "@/IDTypes";

import { copyToClipboard } from "../helper";
import { fireToast } from "../alerts";
import Decklist from "./Decklist.vue";
import BracketMatch, { type MatchPlayer } from "./BracketMatch.vue";
import {
	BracketType,
	type IBracket,
	isDoubleBracket as _isDoubleBracket,
	type Match,
	PlayerPlaceholder,
	DoubleBracket,
} from "../../../src/Brackets";

const isValid = (m: Match) => m.players[0] >= 0 && m.players[1] >= 0;
const isPlaceholder = (p: number) => p < 0;

const props = withDefaults(
	defineProps<{
		bracket: IBracket;
		language: Language;
		userID?: UserID;
		displayControls?: boolean;
		editable?: boolean;
		locked?: boolean;
		fullcontrol?: boolean;
		teamDraft?: boolean;
		sessionID?: string;
		draftlog?: DraftLog;
	}>(),
	{
		displayControls: true,
		editable: false,
		locked: false,
		fullcontrol: false,
		teamDraft: false,
	}
);

const emit = defineEmits<{
	(e: "lock", locked: boolean): void;
	(e: "syncBracketMTGO", sync: boolean): void;
	(e: "generate", type: BracketType): void;
	(e: "updated", mID: number, index: number, value: number): void;
	(e: "join-moxgate-match", matchID: number): void;
}>();

const selectedUser = ref<MatchPlayer | null>(null);
const typeToGenerate = ref<BracketType>(props.bracket.type);

const lock = (e: Event) => emit("lock", (e.target as HTMLInputElement).checked);
const syncMTGO = (e: Event) => emit("syncBracketMTGO", (e.target as HTMLInputElement).checked);
const regenerate = () => emit("generate", props.teamDraft ? BracketType.Team : typeToGenerate.value);

const copyLink = () => {
	copyToClipboard(
		`${window.location.protocol}//${window.location.hostname}${
			window.location.port ? ":" + window.location.port : ""
		}/bracket?session=${encodeURIComponent(props.sessionID!)}`
	);
	fireToast("success", "Bracket Link copied to clipboard!");
};

const getPlayer = (m: Match, idx: number): MatchPlayer | PlayerPlaceholder => {
	const playerIdx = m.players[idx];
	if (playerIdx < 0) return playerIdx;
	return {
		userID: props.bracket.players[playerIdx]!.userID,
		userName: props.bracket.players[playerIdx]!.userName,
		result: m.results[idx],
		record: records.value[playerIdx],
	};
};

const type = computed(() => props.bracket.type);

const isDoubleBracket = computed(() => _isDoubleBracket(props.bracket));
const lowerBracket = computed(() => {
	if (!isDoubleBracket.value) return null;
	return (props.bracket as DoubleBracket).lowerBracket;
});
const final = computed(() => {
	if (!isDoubleBracket.value) return null;
	return props.bracket.matches[(props.bracket as DoubleBracket).final];
});

const records = computed(() => {
	const r: { wins: number; losses: number }[] = Array(props.bracket.players.length)
		.fill(null)
		.map(() => ({ wins: 0, losses: 0 }));

	for (const m of props.bracket.matches) {
		if (isValid(m) && m.results[0] !== m.results[1]) {
			const winIdx = m.results[0] > m.results[1] ? 0 : 1;
			r[m.players[winIdx]].wins += 1;
			r[m.players[(winIdx + 1) % 2]].losses += 1;
		} else if (m.players[1] === PlayerPlaceholder.Empty && !isPlaceholder(m.players[0])) {
			r[m.players[0]].wins += 1;
		} else if (m.players[0] === PlayerPlaceholder.Empty && !isPlaceholder(m.players[1])) {
			r[m.players[1]].wins += 1;
		}
	}

	return r;
});

const teamRecords = computed(() => {
	const r = [0, 0];
	for (const m of props.bracket.matches) {
		if (isValid(m) && m.results[0] !== m.results[1]) {
			const teamIdx = m.results[0] > m.results[1] ? 0 : 1;
			r[teamIdx] += 1;
		}
	}
	return r;
});

const selectedDeckList = computed(() => {
	if (selectedUser.value?.userID) return props.draftlog?.users?.[selectedUser.value.userID]?.decklist ?? undefined;
	return undefined;
});

const isSingleBracket = computed(() => props.bracket.type === BracketType.Single);
const isSwissBracket = computed(() => props.bracket.type === BracketType.Swiss);
const isTeamBracket = computed(() => props.bracket.type === BracketType.Team);
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
