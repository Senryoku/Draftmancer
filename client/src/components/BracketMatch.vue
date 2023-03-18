<template>
	<div class="bracket-match">
		<td class="bracket-match-num">{{ match.index + 1 }}</td>
		<td class="bracket-match-players">
			<div v-for="(p, index) in match.players" :key="index">
				<div class="bracket-player bracket-empty" v-if="p.empty">(Empty)</div>
				<div class="bracket-player bracket-tbd" v-else-if="p.tbd">(TBD {{ p.tbd }})</div>
				<div
					class="bracket-player"
					:class="{
						'bracket-winner': result[index] > result[(index + 1) % 2],
						teama: isTeamBracket && index % 2 === 0,
						teamb: isTeamBracket && index % 2 === 1,
					}"
					v-else
				>
					<template v-if="final">
						<i v-if="isGold(p, index)" class="trophy gold fas fa-trophy"></i>
						<i v-else-if="isSilver(p, index)" class="trophy silver fas fa-trophy"></i>
						<div v-else class="trophy"></div>
					</template>
					<div
						class="bracket-player-name"
						v-tooltip="`Current record: ${recordString(p)}`"
						:class="{ clickable: draftlog }"
						@click="if (draftlog) $emit('selectuser', p);"
					>
						{{ p.userName }}
						<i
							class="fas fa-clipboard-check green"
							v-if="hasDeckList(p.userID)"
							v-tooltip.top="`${p.userName} submitted their deck. Click to review it.`"
						></i>
					</div>
					<template v-if="match.isValid()">
						<input
							v-if="editable"
							class="result-input"
							type="number"
							:value="result[index]"
							min="0"
							@change="update($event, index)"
						/>
						<div class="bracket-result" v-else>{{ result[index] }}</div>
					</template>
				</div>
			</div>
		</td>
	</div>
</template>

<script lang="ts">
import { Bracket } from "@/Brackets";
import { DraftLog } from "@/DraftLog";
import { UserID } from "@/IDTypes";

import { defineComponent, PropType } from "vue";
import { isDoubleBracket, isTeamBracket } from "../../../src/Brackets";

export type MatchPlayerData = {
	userID?: UserID;
	userName?: string;
	tbd?: string;
	empty?: boolean;
};

export class Match {
	index: number;
	players: MatchPlayerData[];

	constructor(index: number, players: MatchPlayerData[]) {
		this.index = index;
		this.players = players;
	}
	isValid() {
		return !this.players[0].empty && !this.players[1].empty && !this.players[0].tbd && !this.players[1].tbd;
	}
}

export default defineComponent({
	props: {
		result: { type: Array as PropType<number[]>, required: true },
		editable: { type: Boolean, default: false },
		match: { type: Object as PropType<Match>, required: true },
		bracket: { type: Object as PropType<Bracket>, required: true },
		records: { type: Object, required: true },
		teamrecords: { type: Array as PropType<number[]>, required: true },
		draftlog: { type: Object as PropType<DraftLog>, default: null },
		final: { type: Boolean, default: false },
	},
	methods: {
		hasDeckList(userID: UserID | undefined) {
			return this.draftlog && userID && this.draftlog.users[userID] && this.draftlog.users[userID].decklist;
		},
		isGold(p: MatchPlayerData, index: number) {
			if (isTeamBracket(this.bracket)) {
				return this.teamrecords[index] >= 5;
			} else if (isDoubleBracket(this.bracket)) {
				return this.final && this.result[index] > this.result[(index + 1) % 2];
			} else {
				return this.records[p.userID!].wins === 3;
			}
		},
		isSilver(p: MatchPlayerData, index: number) {
			if (isDoubleBracket(this.bracket)) return this.final && this.result[index] < this.result[(index + 1) % 2];
			return !isTeamBracket(this.bracket) && this.records[p.userID!].wins === 2;
		},
		recordString(p: MatchPlayerData) {
			return `${this.records[p.userID!].wins} - ${this.records[p.userID!].losses}`;
		},
		update(event: Event, index: number) {
			this.$emit("updated", index, (event.target as HTMLInputElement)?.value);
		},
	},
	computed: {
		isTeamBracket() {
			return isTeamBracket(this.bracket);
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
