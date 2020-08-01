<template>
	<div class="charts">
		<div>
			<h2>CMC</h2>
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
	// FIXME
	codes: [
		"#69d2e7",
		"#a7dbd8",
		"#e0e4cc",
		"#f38630",
		"#fa6900",
		"#fe4365",
		"#fc9d9a",
		"#f9cdad",
		"#c8c8a9",
		"#83af9b",
	],
	current: 0,
	next: function() {
		const r = this.current;
		this.current = (this.current + 1) % this.codes.length;
		return this.codes[r];
	},
};

Chart.defaults.global.defaultFontColor = "#ddd";

const CMCChart = {
	extends: Bar,
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
			let cmcs = this.cards
				.filter(c => !c.type.includes("Land"))
				.map(c => {
					return c.cmc;
				})
				.reduce((acc, t) => {
					if (!(t in acc)) acc[t] = 1;
					else ++acc[t];
					return acc;
				}, {});
			data.labels = Object.keys(cmcs);
			data.datasets.push({
				label: "Deck",
				backgroundColor: "#BBB",
				data: Object.values(cmcs),
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
			// FIXME: Use color in mana cost and not color identity!
			let types = this.cards
				.map(c => c.color_identity)
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
	color: #;
}

.charts h2 {
	text-align: center;
}
</style>
