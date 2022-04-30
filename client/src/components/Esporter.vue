<template>
	<div>
		<div class="section-title">
			<h2>Coaching</h2>
		</div>
		<a href="https://esporter.win/mtgadraft" target="_blank">
			<div class="welcome-section welcome-alt">
				<img src="../assets/img/logo-nobackground-500-cropped.png" alt="Esporter" />
				<div v-if="remainingTime">
					Next Split starts in <span v-if="remainingTime.days > 0">{{ remainingTime.days }}d</span>
					{{ remainingTime.hours.toString().padStart(2, "0") }}h
					{{ remainingTime.minutes.toString().padStart(2, "0") }}m
					{{ remainingTime.seconds.toString().padStart(2, "0") }}s
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
		const nextSplitDate = new Date("May 9, 2022 4:00 pm PST");
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
</style>
