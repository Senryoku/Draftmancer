<template>
	<div class="charts">
		<cmcchart :cards="cards"></cmcchart>
		<cardtypechart :cards="cards"></cardtypechart>
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
	components: { cmcchart: CMCChart, cardtypechart: CardTypeChart },
};
</script>

<style scoped>
.charts {
	display: flex;
	color: #;
}
</style>
