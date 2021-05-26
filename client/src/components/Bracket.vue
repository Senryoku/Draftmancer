
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
					<template v-if="bracket.teamDraft">Team Draft</template>
					<template v-else-if="bracket.double">Double Elimination</template>
					<template v-else-if="bracket.swiss">3-Round Swiss</template>
					<template v-else>Single Elimination</template>
				</span>
			</template>
			<span v-if="!fullcontrol && locked">
				<i class="fas fa-lock"></i> Bracket is locked. Only the Session Owner can enter results.
			</span>
		</div>
		<h2 v-if="bracket.double">Upper Bracket</h2>
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
					:final="!bracket.double && colIndex === 2"
					:editable="editable"
					@updated="(index, value) => $emit('updated', m.index, index, value)"
					@selectuser="(user) => (selectedUser = user)"
				/>
			</div>
			<div class="bracket-column" v-if="bracket.double">
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
		<h2 v-if="bracket.double">Lower Bracket</h2>
		<div class="bracket-columns" v-if="bracket.double">
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

<script>
import { copyToClipboard } from "../helper";
import { fireToast } from "../alerts";
import Decklist from "./Decklist.vue";
import BracketMatch from "./BracketMatch.vue";

class Match {
	constructor(index, players) {
		this.index = index;
		this.players = players;
	}
	isValid() {
		return !this.players[0].empty && !this.players[1].empty && !this.players[0].tbd && !this.players[1].tbd;
	}
}

export default {
	name: "Bracket",
	components: { Decklist, BracketMatch },
	data(inst) {
		const type = !inst.bracket
			? "single"
			: inst.bracket.double
			? "double"
			: inst.bracket.swiss
			? "swiss"
			: "single";
		return {
			selectedUser: null,
			typeToGenerate: type,
		};
	},
	props: {
		bracket: { type: Object, required: true },
		displayControls: { type: Boolean, default: true },
		editable: { type: Boolean, default: false },
		locked: { type: Boolean, default: false },
		fullcontrol: { type: Boolean, default: false },
		teamDraft: { type: Boolean, default: false }, // Used when fullcontrol is true
		sessionID: { type: String },
		draftlog: { type: Object, default: null },
		language: { type: String, required: true },
	},
	methods: {
		lock(e) {
			this.$emit("lock", e.target.checked);
		},
		copyLink() {
			copyToClipboard(
				`${window.location.protocol}//${window.location.hostname}${
					window.location.port ? ":" + window.location.port : ""
				}/bracket?session=${encodeURI(this.sessionID)}`
			);
			fireToast("success", "Bracket Link copied to clipboard!");
		},
		hasDeckList: function (userID) {
			return this.draftlog && this.draftlog.users[userID] && this.draftlog.users[userID].decklist;
		},

		winner(match) {
			if (match.players[0].empty && match.players[1].empty) return { empty: true };
			if (match.players[0].empty) return match.players[1];
			if (match.players[1].empty) return match.players[0];
			if (!this.bracket.results || this.bracket.results[match.index][0] === this.bracket.results[match.index][1])
				return { tbd: "W" + (match.index + 1) };
			if (this.bracket.results[match.index][0] > this.bracket.results[match.index][1]) return match.players[0];
			else return match.players[1];
		},
		loser(match) {
			if (match.players[0].empty || match.players[1].empty) return { empty: true };
			if (!this.bracket.results || this.bracket.results[match.index][0] === this.bracket.results[match.index][1])
				return { tbd: "L" + (match.index + 1) };
			if (this.bracket.results[match.index][0] > this.bracket.results[match.index][1]) return match.players[1];
			else return match.players[0];
		},
		getPlayer(idx) {
			return this.bracket.players[idx] ? this.bracket.players[idx] : { empty: true };
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
	},
	computed: {
		matches() {
			let m = [[], [], []];
			const getPlayer = this.getPlayer;
			const winner = this.winner;
			const loser = this.loser;

			if (this.bracket.teamDraft) {
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
			if (this.bracket.swiss) {
				m[1].push(new Match(6, [loser(m[0][2]), loser(m[0][3])]));
				m[1].push(new Match(7, [loser(m[0][0]), loser(m[0][1])]));
				m[2].push(new Match(8, [winner(m[1][0]), winner(m[1][1])]));
				m[2].push(new Match(9, [loser(m[1][0]), winner(m[1][2])]));
				m[2].push(new Match(10, [loser(m[1][1]), winner(m[1][3])]));
				m[2].push(new Match(11, [loser(m[1][2]), loser(m[1][3])]));
			} else {
				m[2].push(new Match(6, [winner(m[1][0]), winner(m[1][1])]));
			}
			return m;
		},
		lowerBracket() {
			if (!this.bracket.double) return [];
			let m = [[], [], [], []];
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
			if (!this.bracket.double) return null;
			return new Match(13, [this.winner(this.matches[2][0]), this.winner(this.lowerBracket[3][0])]);
		},
		records() {
			let r = {};
			for (let p of this.bracket.players) if (p) r[p.userID] = { wins: 0, losses: 0 };

			const countMatch = (m) => {
				if (m.isValid() && this.bracket.results[m.index][0] !== this.bracket.results[m.index][1]) {
					let winIdx = this.bracket.results[m.index][0] > this.bracket.results[m.index][1] ? 0 : 1;
					r[m.players[winIdx].userID].wins += 1;
					r[m.players[(winIdx + 1) % 2].userID].losses += 1;
				} else if (m.players[1].empty && !m.players[0].empty && !m.players[0].tbd) {
					r[m.players[0].userID].wins += 1;
				} else if (m.players[0].empty && !m.players[1].empty && !m.players[1].tbd) {
					r[m.players[1].userID].wins += 1;
				}
			};

			for (let col of this.matches) for (let m of col) countMatch(m);
			if (this.bracket.double) {
				for (let col of this.lowerBracket) for (let m of col) countMatch(m);
				countMatch(this.final);
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
		selectedDeckList: function () {
			if (this.draftlog && this.selectedUser && this.draftlog.users[this.selectedUser.userID])
				return this.draftlog.users[this.selectedUser.userID].decklist;
			return null;
		},
	},
};
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
