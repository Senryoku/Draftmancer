<template>
	<div>
		<a href="https://esporter.win/mtgadraft" target="_blank">
			<div class="welcome-section welcome-alt">
				<img src="../assets/img/logo-nobackground-500-cropped.png" alt="Esporter Logo" />
				<div>
					Esporter's Splits are the best way to improve at Magic!
					<ol>
						<li><strong>Group Coaching</strong> sessions with a Pro</li>
						<li><strong>Scrimmages</strong> with other players in your Split</li>
						<li><strong>Gameplay reviews</strong> with our resident Esporter coaches</li>
						<li>A <strong>Championship Tournament</strong> to conclude the Split</li>
					</ol>
				</div>
				<div v-if="remainingTime" style="margin: 0.2em 0.2em 0 0.2em">
					<div style="text-align: right">
						<div style="float: left">Next Split:</div>
						Led by <strong>JustLolaman</strong><br />
						Starts in <span v-if="remainingTime.days > 0">{{ remainingTime.days }}d</span>
						{{ remainingTime.hours.toString().padStart(2, "0") }}h
						{{ remainingTime.minutes.toString().padStart(2, "0") }}m
						{{ remainingTime.seconds.toString().padStart(2, "0") }}s
					</div>
				</div>
			</div></a
		>
	</div>
</template>

<script>
function computeRemainingTime(targetDate) {
	const now = new Date(Date.now());
	const distance = targetDate - now;
	if (distance < 0) return null;
	return {
		days: Math.floor(distance / (1000 * 60 * 60 * 24)),
		hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
		minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
		seconds: Math.floor((distance % (1000 * 60)) / 1000),
	};
}
export default {
	data: () => {
		const nextSplitDate = new Date("May 30, 2022 4:00 pm PST");
		let remainingTime = computeRemainingTime(nextSplitDate);
		return {
			interval: null,
			nextSplitDate: nextSplitDate,
			remainingTime: remainingTime,
		};
	},
	mounted() {
		this.interval = setInterval(() => {
			this.remainingTime = computeRemainingTime(this.nextSplitDate);
			if (!this.remainingTime) {
				clearInterval(this.interval);
				this.interval = null;
			}
		}, 1000);
	},
	methods: {},
};
</script>

<style scoped>
a,
a:visited {
	color: #ddd;
}

ol {
	list-style: none;
	margin: 0;
}
</style>
