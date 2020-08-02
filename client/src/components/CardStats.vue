<template>
	<div class="charts">
		<div>
			<h2>Mana Curve</h2>
			<cmcchart :cards="cards"></cmcchart>
		</div>
		<div>
			<h2>Colors in Mana Cost</h2>
			<colorchart :cards="cards"></colorchart>
		</div>
		<div>
			<h2>Types</h2>
			<cardtypechart :cards="cards"></cardtypechart>
		</div>
	</div>
</template>

<script>
import Chart from "chart.js";
import { Bar, Pie } from "vue-chartjs";

const Colors = {
	codes: ["#7fc97f", "#beaed4", "#fdc086", "#ffff99", "#386cb0", "#f0027f", "#bf5b17", "#666666"],
	current: 0,
	next: function() {
		const r = this.current;
		this.current = (this.current + 1) % this.codes.length;
		return this.codes[r];
	},
	reset: function() {
		this.current = 0;
	},
};

Chart.defaults.global.defaultFontColor = "#ddd";

const CMCChart = {
	extends: Bar,
	props: { cards: { type: Array, required: true } },
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
		chartdata: function() {
			let data = {
				labels: [],
				datasets: [],
			};
			let nonLand = this.cards.filter(c => !c.type.includes("Land"));
			let creaturesCMCs = nonLand
				.filter(c => c.type.includes("Creature"))
				.map(c => c.cmc)
				.reduce((acc, t) => {
					if (!(t in acc)) acc[t] = 1;
					else ++acc[t];
					return acc;
				}, {});
			let nonCreaturesCMCs = nonLand
				.filter(c => !c.type.includes("Creature"))
				.map(c => c.cmc)
				.reduce((acc, t) => {
					if (!(t in acc)) acc[t] = 1;
					else ++acc[t];
					return acc;
				}, {});
			data.labels = [...new Set(Object.keys(creaturesCMCs), Object.keys(nonCreaturesCMCs))];
			data.datasets.push({
				label: "Creatures",
				backgroundColor: "#ff9900",
				data: Object.values(creaturesCMCs),
			});
			data.datasets.push({
				label: "Non-Creatures",
				backgroundColor: "#7dd6ff",
				data: Object.values(nonCreaturesCMCs),
			});
			return data;
		},
	},
};

const ColorChart = {
	extends: Pie,
	props: { cards: { type: Array, required: true }, options: { type: Object } },
	mounted() {
		this.renderChart(this.chartdata, this.options);
	},
	computed: {
		chartdata: function() {
			let data = {
				labels: [],
				datasets: [],
			};
			let types = this.cards
				.map(c => {
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
							if (!(t in acc)) acc[t] = 1;
							else ++acc[t];
						}
						return acc;
					},
					{ W: 0, U: 0, B: 0, R: 0, G: 0 }
				);
			data.labels = Object.keys(types);
			data.datasets.push({
				label: "Deck",
				backgroundColor: [
					"rgb(249, 250, 244)",
					"rgb(14, 104, 171)",
					"rgb(21, 11, 0)",
					"rgb(211, 32, 42)",
					"rgb(0, 115, 62)",
				],
				data: Object.values(types),
			});
			return data;
		},
	},
};

const CardTypeChart = {
	extends: Pie,
	props: { cards: { type: Array, required: true }, options: { type: Object } },
	mounted() {
		this.renderChart(this.chartdata, this.options);
	},
	computed: {
		chartdata: function() {
			let data = {
				labels: [],
				datasets: [],
			};
			let types = this.cards
				.map(c => {
					if (c.type.startsWith("Legendary ")) return c.type.slice(10);
					return c.type;
				})
				.filter(t => t !== "Basic Land")
				.reduce((acc, t) => {
					if (!(t in acc)) acc[t] = 1;
					else ++acc[t];
					return acc;
				}, {});
			data.labels = Object.keys(types);
			data.datasets.push({
				label: "Deck",
				backgroundColor: data.labels.map(() => Colors.next()),
				data: Object.values(types),
			});
			return data;
		},
	},
};

export default {
	props: { cards: { type: Array, required: true } },
	components: { cmcchart: CMCChart, colorchart: ColorChart, cardtypechart: CardTypeChart },
};
</script>

<style scoped>
.charts {
	display: flex;
}

.charts h2 {
	text-align: center;
}
</style>
