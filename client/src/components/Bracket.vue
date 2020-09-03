
<template>
	<div v-if="bracket">
		<div v-if="displayControls" class="controls">
			<button
				@click="copyLink"
				v-tooltip="'Copy link to a read-only version of this bracket to the clipboard.'"
			>
				<i class="fas fa-clipboard"></i> Copy Link to Clipboard
			</button>
			<div v-if="fullcontrol">
				<span v-tooltip="'If set, only the owner will be able to enter results.'">
					<input type="checkbox" id="lock" :checked="locked" @change="lock($event)" />
					<label for="lock">
						<i class="fas fa-lock"></i> Lock
					</label>
				</span>
				<button @click="$emit('generate')">Re-Generate Single Elimination</button>
				<button @click="$emit('generate-swiss')">Re-Generate 3-Round Swiss</button>
			</div>
			<div v-else-if="locked">
				<span>
					<i class="fas fa-lock"></i> Bracket is locked. Only the Session Owner can enter results.
				</span>
			</div>
		</div>
		<div class="bracket-columns">
			<div class="bracket-column" v-for="(col, colIndex) in matches" :key="colIndex">
				<div v-for="(m, matchIndex) in col" :key="matchIndex" class="bracket-match">
					<td class="bracket-match-num">{{m.index+1}}</td>
					<td class="bracket-match-players">
						<div v-for="(p, index) in m.players" :key="index">
							<div class="bracket-player bracket-empty" v-if="p.empty">(Empty)</div>
							<div class="bracket-player bracket-tbd" v-else-if="p.tbd">(TBD {{p.tbd}})</div>
							<div
								class="bracket-player"
								:class="{'bracket-winner': bracket.results[m.index][index] > bracket.results[m.index][(index + 1)%2]}"
								v-else
							>
								<template v-if="colIndex === 2">
									<i v-if="records[p].wins === 3" class="trophy gold fas fa-trophy"></i>
									<i v-else-if="records[p].wins === 2" class="trophy silver fas fa-trophy"></i>
									<div v-else class="trophy"></div>
								</template>
								<div class="bracket-player-name" v-tooltip="'Current record: '+recordString(p)">{{p}}</div>
								<template v-if="m.isValid()">
									<input
										v-if="editable"
										class="result-input"
										type="number"
										v-model.number="bracket.results[m.index][index]"
										min="0"
										@change="emitUpdated"
									/>
									<div class="bracket-result" v-else>{{bracket.results[m.index][index]}}</div>
								</template>
							</div>
						</div>
					</td>
				</div>
			</div>
		</div>
	</div>
	<div v-else>No valid bracket.</div>
</template>

<script>
import { copyToClipboard } from "../helper";
import { fireToast } from "../alerts";
export default {
	name: "Bracket",
	props: {
		bracket: { type: Object, required: true },
		displayControls: { type: Boolean, default: true },
		editable: { type: Boolean, default: false },
		locked: { type: Boolean, default: false },
		fullcontrol: { type: Boolean, default: false },
		sessionID: { type: String },
	},
	methods: {
		emitUpdated: function () {
			this.$emit("updated");
		},
		recordString: function (player) {
			return `${this.records[player].wins} - ${this.records[player].losses}`;
		},
		lock: function (e) {
			this.$emit("lock", e.target.checked);
		},
		copyLink: function () {
			copyToClipboard(
				`${window.location.protocol}//${window.location.hostname}${
					window.location.port ? ":" + window.location.port : ""
				}/bracket?session=${encodeURI(this.sessionID)}`
			);
			fireToast("success", "Bracket Link copied to clipboard!");
		},
	},
	computed: {
		matches: function () {
			let m = [[], [], []];
			const Match = function (index, players) {
				this.index = index;
				this.players = players;
				this.isValid = function () {
					return (
						!this.players[0].empty && !this.players[1].empty && !this.players[0].tbd && !this.players[1].tbd
					);
				};
			};

			const winner = (match) => {
				if (match.players[0].empty && match.players[1].empty) return { empty: true };
				if (match.players[0].empty) return match.players[1];
				if (match.players[1].empty) return match.players[0];
				if (
					!this.bracket.results ||
					this.bracket.results[match.index][0] === this.bracket.results[match.index][1]
				)
					return { tbd: "W" + (match.index + 1) };
				if (this.bracket.results[match.index][0] > this.bracket.results[match.index][1])
					return match.players[0];
				else return match.players[1];
			};

			const loser = (match) => {
				if (match.players[0].empty || match.players[1].empty) return { empty: true };
				if (
					!this.bracket.results ||
					this.bracket.results[match.index][0] === this.bracket.results[match.index][1]
				)
					return { tbd: "L" + (match.index + 1) };
				if (this.bracket.results[match.index][0] > this.bracket.results[match.index][1])
					return match.players[1];
				else return match.players[0];
			};

			for (let i = 0; i < 4; ++i) {
				m[0].push(
					new Match(i, [
						this.bracket.players[2 * i] === "" ? { empty: true } : this.bracket.players[2 * i],
						this.bracket.players[2 * i + 1] === "" ? { empty: true } : this.bracket.players[2 * i + 1],
					])
				);
			}
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
		records: function () {
			let r = {};
			for (let p of this.bracket.players) r[p] = { wins: 0, losses: 0 };
			for (let col of this.matches)
				for (let m of col) {
					if (m.isValid() && this.bracket.results[m.index][0] !== this.bracket.results[m.index][1]) {
						let winIdx = this.bracket.results[m.index][0] > this.bracket.results[m.index][1] ? 0 : 1;
						r[m.players[winIdx]].wins += 1;
						r[m.players[(winIdx + 1) % 2]].losses += 1;
					} else if (m.players[1].empty && !m.players[0].empty && !m.players[0].tbd) {
						r[m.players[0]].wins += 1;
					} else if (m.players[0].empty && !m.players[1].empty && !m.players[1].tbd) {
						r[m.players[1]].wins += 1;
					}
				}
			return r;
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
	justify-content: space-between;
	height: 2em;
	line-height: 2em;
	width: 20rem;
	padding: 0.5em;
	margin: 0.5em;
}

.bracket-winner {
	background-color: #555;
	box-shadow: 0 0 4px 4px #555;
}

.bracket-tbd,
.bracket-empty {
	color: grey;
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