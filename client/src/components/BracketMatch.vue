<template>
	<div class="bracket-match">
		<td class="bracket-match-num">{{ matchID + 1 }}</td>
		<td class="bracket-match-players">
			<div v-for="(p, index) in players" :key="index">
				<div class="bracket-player bracket-empty" v-if="isEmpty(p)">(Empty)</div>
				<div class="bracket-player bracket-tbd" v-else-if="isTBD(p)">(TBD)</div>
				<div
					class="bracket-player"
					:class="{
						'bracket-winner':
							!isPlayerPlaceholder(players[(index + 1) % 2]) &&
							p.result > (players[(index + 1) % 2] as MatchPlayer).result,
						teama: isTeamBracket && index % 2 === 0,
						teamb: isTeamBracket && index % 2 === 1,
					}"
					v-else-if="!isPlayerPlaceholder(p)"
				>
					<template v-if="final">
						<font-awesome-icon
							icon="fa-solid fa-trophy"
							v-if="isGold(index)"
							class="trophy gold"
						></font-awesome-icon>
						<font-awesome-icon
							icon="fa-solid fa-trophy"
							v-else-if="isSilver(index)"
							class="trophy silver"
						></font-awesome-icon>
						<div v-else class="trophy"></div>
					</template>
					<div
						class="bracket-player-name"
						v-tooltip="`Current record: ${p.record.wins} - ${p.record.losses}`"
						:class="{ clickable: draftlog }"
						@click="if (draftlog) $emit('selectuser', p);"
					>
						{{ p.userName }}
						<font-awesome-icon
							icon="fa-solid fa-clipboard-check"
							class="green"
							v-if="hasDeckList(p.userID)"
							v-tooltip.top="`${p.userName} submitted their deck. Click to review it.`"
						></font-awesome-icon>
					</div>
					<template v-if="isValid">
						<input
							v-if="editable"
							:id="`result-input-${matchID}-${index}`"
							class="result-input"
							type="number"
							:value="p.result"
							min="0"
							@change="update($event, index)"
						/>
						<div class="bracket-result" v-else>{{ p.result }}</div>
					</template>
				</div>
			</div>
		</td>
	</div>
</template>

<script setup lang="ts">
import { DraftLog } from "@/DraftLog";
import { UserID } from "@/IDTypes";

import { computed } from "vue";
import { BracketType, PlayerPlaceholder } from "../../../src/Brackets";

export type MatchPlayer = {
	userID: string;
	userName: string;
	result: number;
	record: { wins: number; losses: number };
};

const props = withDefaults(
	defineProps<{
		editable: boolean;
		bracketType: BracketType;

		matchID: number;
		players: (PlayerPlaceholder | MatchPlayer)[];
		teamRecords?: number[];

		draftlog?: DraftLog;
		final: boolean;
	}>(),
	{
		editable: false,
		teamRecords: undefined,
		draftlog: undefined,
		final: false,
	}
);

const emit = defineEmits<{
	(e: "updated", matchID: number, index: number, value: number): void;
	(e: "selectuser", p: MatchPlayer): void;
}>();

function hasDeckList(userID: UserID): boolean {
	return !!props.draftlog?.users[userID]?.decklist;
}

function isGold(player: number) {
	const p = props.players[player];
	if (isPlayerPlaceholder(p)) return false;

	if (isTeamBracket.value) {
		return (
			props.teamRecords![player] >= 5 &&
			props.teamRecords![player] > props.teamRecords![(player + 1) % props.players.length]
		);
	}
	if (isDoubleBracket.value) {
		const p2 = props.players[(player + 1) % props.players.length];
		if (isPlayerPlaceholder(p2)) return false;
		return props.final && p.record > p2.record;
	}
	return p.record.wins === 3;
}

function isSilver(player: number) {
	const p = props.players[player];
	if (isPlayerPlaceholder(p)) return false;

	if (isDoubleBracket.value) {
		const p2 = props.players[(player + 1) % props.players.length];
		if (isPlayerPlaceholder(p2)) return false;
		return props.final && p.record < p2.record;
	}
	return !isTeamBracket.value && p.record.wins === 2;
}

function update(event: Event, index: number) {
	emit("updated", props.matchID, index, parseInt((event.target as HTMLInputElement)?.value));
}

function isEmpty(p: PlayerPlaceholder | MatchPlayer): p is PlayerPlaceholder {
	return p === PlayerPlaceholder.Empty;
}

function isTBD(p: PlayerPlaceholder | MatchPlayer): p is PlayerPlaceholder {
	return p === PlayerPlaceholder.TBD;
}

function isPlayerPlaceholder(p: unknown): p is PlayerPlaceholder {
	return Number.isInteger(p);
}

const isValid = computed(() => !isPlayerPlaceholder(props.players[0]) && !isPlayerPlaceholder(props.players[1]));

const isTeamBracket = computed(() => props.bracketType === BracketType.Team);
const isDoubleBracket = computed(() => props.bracketType === BracketType.Double);
</script>

<style scoped>
.bracket-match {
	margin: 0.5em;
}

.bracket-match-num {
	vertical-align: middle;
	min-width: 1.5em;
}

.bracket-match-players {
	background: #333;
	border-radius: 1em;
	padding: 0.5em;
}

.bracket-player {
	display: flex;
	background: #2c2c2c;
	justify-content: space-between;
	height: 2em;
	line-height: 2em;
	width: 20rem;
	padding: 0.5em;
	margin: 0.5em;
	border-radius: 8px;
}

.bracket-winner {
	font-weight: bold;
	box-shadow: 0 0 4px 4px #bbb;
}

.bracket-tbd,
.bracket-empty {
	color: grey;
	pointer-events: none;
	user-select: none;
}

.bracket-result {
	font-size: 2em;
	min-width: 32px;
	text-align: right;
}

.bracket-player-name {
	font-size: 1.5em;
	max-width: 15rem;
	overflow: hidden;
}

.trophy {
	height: 32px;
	width: 32px;
	font-size: 32px;
}

.gold {
	color: gold;
}

.silver {
	color: silver;
}

.result-input {
	width: 2.2em;
}
</style>
