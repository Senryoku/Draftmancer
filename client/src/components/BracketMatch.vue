<template>
	<div class="bracket-match">
		<!-- <td class="bracket-match-num">{{ match.index + 1 }}</td> -->
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
						v-tooltip="`Current record: ${recordString(p)}`"
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

<script lang="ts">
import { DraftLog } from "@/DraftLog";
import { UserID } from "@/IDTypes";

import { defineComponent, PropType } from "vue";
import { BracketType, PlayerPlaceholder } from "../../../src/Brackets";

export type MatchPlayer = {
	userID: string;
	userName: string;
	result: number;
	record: { wins: number; losses: number };
};

export default defineComponent({
	props: {
		editable: { type: Boolean, default: false },
		bracketType: { type: String as PropType<BracketType>, required: true },

		matchID: { type: Number, required: true },
		players: {
			type: Array as PropType<(PlayerPlaceholder | MatchPlayer)[]>,
			required: true,
		},

		draftlog: { type: Object as PropType<DraftLog>, default: null },
		final: { type: Boolean, default: false },
	},
	methods: {
		hasDeckList(userID: UserID | undefined) {
			return this.draftlog && userID && this.draftlog.users[userID] && this.draftlog.users[userID].decklist;
		},
		isGold(player: number) {
			const p = this.players[player];
			if (this.isPlayerPlaceholder(p)) return false;

			if (this.isTeamBracket) {
				return p.record.wins >= 5;
			} else if (this.isDoubleBracket) {
				const p2 = this.players[(player + 1) % 2];
				if (this.isPlayerPlaceholder(p2)) return false;
				return this.final && p.record > p2.record;
			} else {
				return p.record.wins === 3;
			}
		},
		isSilver(player: number) {
			const p = this.players[player];
			if (this.isPlayerPlaceholder(p)) return false;

			if (this.isDoubleBracket) {
				const p2 = this.players[(player + 1) % 2];
				if (this.isPlayerPlaceholder(p2)) return false;
				return this.final && p.record < p2.record;
			}
			return !this.isTeamBracket && p.record.wins === 2;
		},
		recordString() {
			const p0 = this.players[0];
			const p1 = this.players[1];
			if (this.isPlayerPlaceholder(p0) || this.isPlayerPlaceholder(p1)) return "";
			return `${p0.record} - ${p1.record}`;
		},
		update(event: Event, index: number) {
			this.$emit("updated", this.matchID, index, parseInt((event.target as HTMLInputElement)?.value));
		},
		isEmpty(p: PlayerPlaceholder | { userName: string; result: number; record: { wins: number; losses: number } }) {
			return p === PlayerPlaceholder.Empty;
		},
		isTBD(p: PlayerPlaceholder | { userName: string; result: number; record: { wins: number; losses: number } }) {
			return p === PlayerPlaceholder.TBD;
		},
		isPlayerPlaceholder(p: unknown): p is PlayerPlaceholder {
			return Number.isInteger(p);
		},
	},
	computed: {
		isValid() {
			const p0 = this.players[0];
			const p1 = this.players[1];
			return !this.isPlayerPlaceholder(p0) && !this.isPlayerPlaceholder(p1);
		},
		isSingleBracket() {
			return this.bracketType === BracketType.Single;
		},
		isSwissBracket() {
			return this.bracketType === BracketType.Swiss;
		},
		isTeamBracket() {
			return this.bracketType === BracketType.Team;
		},
		isDoubleBracket() {
			return this.bracketType === BracketType.Double;
		},
	},
});
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
