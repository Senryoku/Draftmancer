<template>
	<div class="charts">
		<div>
			<h2>Mana Curve</h2>
			<cmcchart :curve="manacurve"></cmcchart>
			<div class="info">Average Mana Cost: {{ manaAverage }}</div>
			<table class="type-table">
				<tr>
					<th>CMC</th>
					<th>Creature</th>
					<th>Non-Creature</th>
					<th>Total</th>
				</tr>
				<tr v-for="(data, cmc) in manacurve" :key="cmc">
					<td class="table-number">
						<img :src="`img/mana/${cmc}.svg`" class="mana-icon" />
					</td>
					<td class="table-number">{{ data.creatures }}</td>
					<td class="table-number">{{ data.nonCreatures }}</td>
					<td class="table-number">{{ data.creatures + data.nonCreatures }}</td>
				</tr>
			</table>
		</div>
		<div>
			<h2>Colors in Mana Cost</h2>
			<colorchart :colors="colors"></colorchart>
			<table class="type-table">
				<tr>
					<th>Mana Color</th>
					<th>Count in Cost</th>
				</tr>
				<tr v-for="(count, color) in colors" :key="color">
					<td>{{ color }}</td>
					<td class="table-number">{{ count }}</td>
				</tr>
			</table>
		</div>
		<div>
			<h2>Types</h2>
			<cardtypechart :types="types"></cardtypechart>
			<table class="type-table">
				<tr>
					<th>Type</th>
					<th>Count</th>
					<th>%</th>
				</tr>
				<tr v-for="(val, key) in types" :key="key">
					<td>{{ key }}</td>
					<td class="table-number">{{ val }}</td>
					<td class="table-number">{{ (100 * (val / (cards.length + addedbasics))).toPrecision(3) }}%</td>
				</tr>
				<tr>
					<td>Total</td>
					<td class="table-number">{{ cards.length + addedbasics }}</td>
					<td class="table-number">-</td>
				</tr>
			</table>
		</div>
	</div>
</template>

<script>
import Chart from "chart.js";
import { Bar, Pie } from "vue-chartjs";

const Colors = {
	codes: ["#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0", "#f0027f", "#bf5b17", "#666666"],
	current: 0,
	next: function () {
		const r = this.current;
		this.current = (this.current + 1) % this.codes.length;
		return this.codes[r];
	},
	reset: function () {
		this.current = 0;
	},
};

Chart.defaults.global.defaultFontColor = "#ddd";

const CMCChart = {
	extends: Bar,
	props: { curve: { type: Object, required: true } },
	mounted() {
		Colors.reset();
		this.renderChart(this.chartdata, {
			scales: {
				xAxes: [{ stacked: true }],
				yAxes: [{ ticks: { beginAtZero: true }, stacked: true }],
			},
		});
	},
	computed: {
		chartdata: function () {
			let data = {
				labels: [],
				datasets: [],
			};
			data.labels = Object.keys(this.curve);
			data.datasets.push({
				label: "Creatures",
				backgroundColor: "#ff9900",
				data: Object.values(this.curve).map((cmc) => cmc.creatures),
			});
			data.datasets.push({
				label: "Non-Creatures",
				backgroundColor: "#7dd6ff",
				data: Object.values(this.curve).map((cmc) => cmc.nonCreatures),
			});
			return data;
		},
	},
};

const ColorChart = {
	extends: Pie,
	props: { colors: { type: Object, required: true }, options: { type: Object } },
	mounted() {
		this.renderChart(this.chartdata, this.options);
	},
	computed: {
		chartdata: function () {
			let data = {
				labels: [],
				datasets: [],
			};
			data.labels = Object.keys(this.colors);
			data.datasets.push({
				label: "Deck",
				backgroundColor: [
					"rgb(249, 250, 244)",
					"rgb(14, 104, 171)",
					"rgb(21, 11, 0)",
					"rgb(211, 32, 42)",
					"rgb(0, 115, 62)",
				],
				data: Object.values(this.colors),
			});
			return data;
		},
	},
};

const CardTypeChart = {
	extends: Pie,
	props: { types: { type: Object, required: true }, options: { type: Object } },
	mounted() {
		this.renderChart(this.chartdata, this.options);
	},
	computed: {
		chartdata: function () {
			return {
				labels: Object.keys(this.types),
				datasets: [
					{
						label: "Deck",
						backgroundColor: Object.keys(this.types).map(() => Colors.next()),
						data: Object.values(this.types),
					},
				],
			};
		},
	},
};

export default {
	props: { cards: { type: Array, required: true }, addedbasics: { type: Number, required: true } },
	components: { cmcchart: CMCChart, colorchart: ColorChart, cardtypechart: CardTypeChart },
	computed: {
		types: function () {
			let r = this.cards
				.map((c) => {
					if (c.type.startsWith("Legendary ")) return c.type.slice(10);
					return c.type;
				})
				.reduce((acc, t) => {
					if (!(t in acc)) acc[t] = 1;
					else ++acc[t];
					return acc;
				}, {});
			r["Basic Land"] = (r["Basic Land"] || 0) + this.addedbasics;
			return r;
		},
		colors: function () {
			let fullNames = {
				W: "White",
				U: "Blue",
				B: "Black",
				R: "Red",
				G: "Green",
			};
			return this.cards
				.map((c) => {
					let colors = [];
					for (let s of ["{W}", "{U}", "{B}", "{R}", "{G}"]) {
						const matches = c.mana_cost.match(new RegExp(s, "g")) || [];
						const count = matches.length;
						for (let i = 0; i < count; ++i) colors.push(s[1]);
					}
					return colors;
				})
				.reduce(
					(acc, arr) => {
						for (let t of arr) {
							if (!(fullNames[t] in acc)) acc[fullNames[t]] = 1;
							else ++acc[fullNames[t]];
						}
						return acc;
					},
					{ White: 0, Blue: 0, Black: 0, Red: 0, Green: 0 }
				);
		},
		nonLands: function () {
			return this.cards.filter((c) => !c.type.includes("Land"));
		},
		manacurve: function () {
			return this.nonLands.reduce((acc, c) => {
				if (!(c.cmc in acc)) acc[c.cmc] = { creatures: 0, nonCreatures: 0 };
				if (c.type.includes("Creature")) ++acc[c.cmc].creatures;
				else ++acc[c.cmc].nonCreatures;
				return acc;
			}, {});
		},
		manaAverage: function () {
			return (this.nonLands.reduce((acc, c) => acc + c.cmc, 0) / this.nonLands.length).toPrecision(3);
		},
	},
};
</script>

<style scoped>
.charts {
	display: flex;
}

.charts h2 {
	text-align: center;
}

.info {
	text-align: center;
	margin: 0.25em;
}

.type-table {
	margin: auto;
}

td,
th {
	padding: 0.25em;
	padding-left: 0.5em;
	padding-right: 0.5em;
}

tr:nth-child(even) {
	background-color: rgba(255, 255, 255, 0.1);
}

.table-number {
	text-align: center;
}

.mana-icon {
	vertical-align: middle;
}
</style>
