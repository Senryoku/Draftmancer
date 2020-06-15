
<template>
	<div class="bracket" v-if="bracket">
		<div class="bracket-column" v-for="(col, colIndex) in matches" :key="colIndex">
			<div v-for="(m, matchIndex) in col" :key="matchIndex" class="bracket-match">
				<div v-for="(p, index) in m.players" :key="index">
					<div class="bracket-player bracket-empty" v-if="p.empty">(Empty)</div>
					<div class="bracket-player bracket-tbd" v-else-if="p.tbd">(TBD)</div>
					<div class="bracket-player" :class="{'bracket-winner': bracket.results[m.index][index] > bracket.results[m.index][(index + 1)%2]}" v-else>
						<div class="bracket-player-name">{{p}}</div> 
						<template v-if="m.isValid()">
							<input v-if="editable" class="small-number-input" type="number" v-model.number="bracket.results[m.index][index]" min="0" @change="emitUpdated"></input>
							<div class="bracket-result" v-else>{{bracket.results[m.index][index]}}</div>
						</template></div>
				</div>
			</div>
		</div>
	</div>
	<div v-else>
		No valid bracket.
	</div>
</template>

<script>
export default {
	name: "Bracket",
	props: {
		bracket: { type: Object, required: true },
		editable: { type: Boolean, default: false },
	},
	methods: {
		emitUpdated: function () {
			this.$emit("updated");
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
					return { tbd: true };
				if (this.bracket.results[match.index][0] > this.bracket.results[match.index][1])
					return match.players[0];
				else return match.players[1];
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
			m[2].push(new Match(6, [winner(m[1][0]), winner(m[1][1])]));
			return m;
		},
	},
};
</script>

<style>
.bracket {
	display: flex;
}

.bracket-column {
	display: flex;
	flex-direction: column;
	justify-content: space-around;
}

.bracket-match {
	padding: 0.5em;
	margin: 1em;

	background: #333;
	border-radius: 1em;
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
	box-shadow: 0 0 5px 5px #555;
}

.bracket-tbd,
.bracket-empty {
	color: grey;
}

.bracket-result {
	font-size: 2em;
}

.bracket-player-name {
	font-size: 1.5em;
	max-width: 15rem;
	overflow: hidden;
}
</style>