<template>
	<div v-if="bracket">
		<div v-if="displayControls" class="controls">
			<button @click="copyLink" v-tooltip="'Copy link to a read-only version of this bracket to the clipboard.'">
				<i class="fas fa-clipboard"></i> Copy Link to Clipboard
			</button>
			<template v-if="fullcontrol">
				<span v-tooltip="'If set, only the owner will be able to enter results.'">
					<input type="checkbox" id="lock" :checked="locked" @change="lock($event)" />
					<label for="lock"> <i class="fas fa-lock"></i> Lock </label>
				</span>
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
				<span style="font-size: 1.5em">
					<template v-if="isTeamBracket">Team Draft</template>
					<template v-else-if="isDoubleBracket">Double Elimination</template>
					<template v-else-if="isSwissBracket">3-Round Swiss</template>
					<template v-else>Single Elimination</template>
				</span>
			</template>
			<span v-if="!fullcontrol && locked">
				<i class="fas fa-lock"></i> Bracket is locked. Only the Session Owner can enter results.
			</span>
		</div>
		<h2 v-if="isDoubleBracket">Upper Bracket</h2>
		<div class="bracket-columns">
			<div class="bracket-column" v-for="(col, colIndex) in matches" :key="colIndex">
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
					:editable="editable"
					@updated="(index, value) => $emit('updated', m.index, index, value)"
					@selectuser="(user) => (selectedUser = user)"
				/>
			</div>
			<div class="bracket-column" v-if="isDoubleBracket">
				<BracketMatch
					:key="final.index"
					:match="final"
					:result="bracket.results[final.index]"
					:bracket="bracket"
					:records="records"
					:teamrecords="teamRecords"
					:draftlog="draftlog"
					:final="true"
					:editable="editable"
					@updated="(index, value) => $emit('updated', final.index, index, value)"
					@selectuser="(user) => (selectedUser = user)"
				/>
			</div>
		</div>
		<h2 v-if="isDoubleBracket">Lower Bracket</h2>
		<div class="bracket-columns" v-if="isDoubleBracket">
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
import { defineComponent, PropType } from "vue";
import { copyToClipboard } from "../helper";
import { fireToast } from "../alerts";
import Decklist from "./Decklist.vue";
import BracketMatch, { Match, MatchPlayerData } from "./BracketMatch.vue";
import { Bracket, isDoubleBracket, isSwissBracket, isTeamBracket } from "../../../src/Brackets";
import { DraftLog } from "../../../src/DraftLog";
import { Language } from "../../../src/Types";
import { UserID } from "../../../src/IDTypes";

function* generate_pairs<T>(arr: T[]): Generator<[T, T][]> {
	if (arr.length < 2) return [];
	// We assume arr length is pair.
	const a = arr[0];
	for (let i = 1; i < arr.length; ++i) {
		const pair: [T, T] = [a, arr[i]];
		const rest = arr.slice(1, i).concat(arr.slice(i + 1, arr.length));
		const gen = generate_pairs(rest);
		let val = gen.next();
		while (val.value) {
			yield [pair].concat(val.value);
			val = gen.next();
		}
	}
}

export default defineComponent({
	name: "Bracket",
	components: { Decklist, BracketMatch },
	data(inst) {
		const type = !inst.bracket
			? "single"
			: isDoubleBracket(inst.bracket)
			? "double"
			: isSwissBracket(inst.bracket)
			? "swiss"
			: "single";
		return {
			selectedUser: null,
			typeToGenerate: type,
		} as { selectedUser: MatchPlayerData | null; typeToGenerate: string };
	},
	props: {
		bracket: { type: Object as PropType<Bracket>, required: true },
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

		winner(match: Match) {
			if (match.players[0].empty && match.players[1].empty) return { empty: true };
			if (match.players[0].empty) return match.players[1];
			if (match.players[1].empty) return match.players[0];
			if (!this.bracket.results || this.bracket.results[match.index][0] === this.bracket.results[match.index][1])
				return { tbd: "W" + (match.index + 1) };
			if (this.bracket.results[match.index][0] > this.bracket.results[match.index][1]) return match.players[0];
			else return match.players[1];
		},
		loser(match: Match) {
			if (match.players[0].empty || match.players[1].empty) return { empty: true };
			if (!this.bracket.results || this.bracket.results[match.index][0] === this.bracket.results[match.index][1])
				return { tbd: "L" + (match.index + 1) };
			if (this.bracket.results[match.index][0] > this.bracket.results[match.index][1]) return match.players[1];
			else return match.players[0];
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
		matches() {
			let m: Match[][] = [[], [], []];
			const getPlayer = this.getPlayer;
			const winner = this.winner;

			if (isSwissBracket(this.bracket)) {
				if (this.realPlayerCount() !== 6 && this.realPlayerCount() !== 8) return m;
				const alreadyPaired = [];
				for (let i = 0; i < this.bracket.players.length / 2; ++i) {
					const match = new Match(i, [getPlayer(2 * i), getPlayer(2 * i + 1)]);
					m[0].push(match);
					alreadyPaired.push([match.players[0].userID, match.players[1].userID]);
					alreadyPaired.push([match.players[1].userID, match.players[0].userID]);
				}
				const scores: { [userID: UserID]: number } = {};
				for (let player of this.bracket.players) if (player) scores[player.userID] = 0;
				let alreadyPairedBackup; // In case the fast algorithm fails and we have to start over.
				// Determine matches for the second and third round.
				for (let round = 0; round < 2; ++round) {
					alreadyPairedBackup = [...alreadyPaired];
					// Compute scores after the first and second round
					for (let i = 0; i < m[round].length; ++i) {
						const match = m[round][i];
						const diff = this.bracket.results[match.index][0] - this.bracket.results[match.index][1];
						scores[match.players[0].userID!] += diff;
						scores[match.players[1].userID!] -= diff;
					}
					let sortedPlayers = Object.keys(scores).sort((lhs, rhs) => scores[rhs] - scores[lhs]);
					while (sortedPlayers.length > 0) {
						const firstPlayer = sortedPlayers.shift();
						let index = 0;
						// Find the player with the closest score which firstPlayer did not encountered yet
						while (
							index < sortedPlayers.length &&
							alreadyPaired.find((el) => el[0] === firstPlayer && el[1] === sortedPlayers[index])
						)
							++index;
						// We may be out of undisputed matches depending of the order of assignments, revert to a failsafe but less optimal algorithm in this case.
						if (index >= sortedPlayers.length) {
							m[round + 1] = [];
							const matchesMatrix = [];
							const players = Object.keys(scores);
							for (let i = 0; i < this.bracket.players.length; ++i) {
								const row = [];
								for (let j = 0; j < this.bracket.players.length; ++j) {
									let val = alreadyPairedBackup.find(
										(el) => el[0] === players[i] && el[1] === players[j]
									)
										? 99999
										: 0;
									val += Math.abs(scores[players[i]] - scores[players[j]]);
									row.push(val);
								}
								matchesMatrix.push(row);
							}
							const indices = [];
							for (let i = 0; i < this.bracket.players.length; ++i) indices.push(i);
							let minValue = 10000000;
							let bestPermutation = undefined;
							// Enumerate all possible permutations and keep the "best" one.
							const permutations = generate_pairs(indices);
							let perm = permutations.next();
							while (perm.value) {
								let val = 0;
								for (let pair of perm.value) val += matchesMatrix[pair[0]][pair[1]];
								if (val < minValue) {
									minValue = val;
									bestPermutation = perm.value;
								}
								perm = permutations.next();
							}
							// Finally generate the matches
							for (let pair of bestPermutation) {
								m[round + 1].push(
									new Match(m[0].length + m[1].length + m[2].length, [
										this.bracket.players.find((p) => p?.userID === players[pair[0]])!,
										this.bracket.players.find((p) => p?.userID === players[pair[1]])!,
									])
								);
							}
						} else {
							const secondPlayer = sortedPlayers[index];
							sortedPlayers.splice(index, 1);
							m[round + 1].push(
								new Match(m[0].length + m[1].length + m[2].length, [
									this.bracket.players.find((p) => p?.userID === firstPlayer)!,
									this.bracket.players.find((p) => p?.userID === secondPlayer)!,
								])
							);
							alreadyPaired.push([firstPlayer, secondPlayer]);
							alreadyPaired.push([secondPlayer, firstPlayer]);
						}
					}
				}
				return m;
			}

			if (isTeamBracket(this.bracket)) {
				m[0].push(new Match(0, [getPlayer(0), getPlayer(3)]));
				m[0].push(new Match(1, [getPlayer(2), getPlayer(5)]));
				m[0].push(new Match(2, [getPlayer(4), getPlayer(1)]));
				m[1].push(new Match(3, [getPlayer(0), getPlayer(5)]));
				m[1].push(new Match(4, [getPlayer(2), getPlayer(1)]));
				m[1].push(new Match(5, [getPlayer(4), getPlayer(3)]));
				m[2].push(new Match(6, [getPlayer(0), getPlayer(1)]));
				m[2].push(new Match(7, [getPlayer(2), getPlayer(3)]));
				m[2].push(new Match(8, [getPlayer(4), getPlayer(5)]));
				return m;
			}

			for (let i = 0; i < 4; ++i) m[0].push(new Match(i, [getPlayer(2 * i), getPlayer(2 * i + 1)]));

			m[1].push(new Match(4, [winner(m[0][0]), winner(m[0][1])]));
			m[1].push(new Match(5, [winner(m[0][2]), winner(m[0][3])]));
			m[2].push(new Match(6, [winner(m[1][0]), winner(m[1][1])]));
			return m;
		},
		lowerBracket() {
			if (!isDoubleBracket(this.bracket)) return [];
			let m: Match[][] = [[], [], [], []];
			for (let i = 0; i < 2; ++i) {
				m[0].push(
					new Match(7 + i, [this.loser(this.matches[0][2 * i]), this.loser(this.matches[0][2 * i + 1])])
				);
				m[1].push(new Match(9 + i, [this.winner(m[0][i]), this.loser(this.matches[1][i])]));
			}
			m[2].push(new Match(11, [this.winner(m[1][0]), this.winner(m[1][1])]));
			m[3].push(new Match(12, [this.winner(m[2][0]), this.loser(this.matches[2][0])]));
			return m;
		},
		final() {
			return new Match(13, [this.winner(this.matches[2][0]), this.winner(this.lowerBracket[3][0])]);
		},
		records() {
			let r: { [userID: UserID]: { wins: number; losses: number } } = {};
			for (let p of this.bracket.players) if (p) r[p.userID] = { wins: 0, losses: 0 };

			const countMatch = (m: Match) => {
				if (m.isValid() && this.bracket.results[m.index][0] !== this.bracket.results[m.index][1]) {
					let winIdx = this.bracket.results[m.index][0] > this.bracket.results[m.index][1] ? 0 : 1;
					r[m.players[winIdx].userID!].wins += 1;
					r[m.players[(winIdx + 1) % 2].userID!].losses += 1;
				} else if (m.players[1].empty && !m.players[0].empty && !m.players[0].tbd) {
					r[m.players[0].userID!].wins += 1;
				} else if (m.players[0].empty && !m.players[1].empty && !m.players[1].tbd) {
					r[m.players[1].userID!].wins += 1;
				}
			};

			for (let col of this.matches) for (let m of col) countMatch(m);
			if (isDoubleBracket(this.bracket)) {
				for (let col of this.lowerBracket) for (let m of col) countMatch(m);
				countMatch(this.final!);
			}

			return r;
		},
		teamRecords() {
			let r = [0, 0];
			for (let col of this.matches) {
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
	display: flex;
}

.bracket-column {
	display: flex;
	flex-direction: column;
	justify-content: space-around;
}
</style>
