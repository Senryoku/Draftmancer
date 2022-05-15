<template>
	<div>
		<a href="https://esporter.win/mtgadraft" target="_blank">
			<div class="welcome-section welcome-alt" style="position: relative">
				<div style="position: absolute; bottom: 0.5em; right: 0.5em; opacity: 0.2">
					<i class="fas fas fa-external-link-alt"></i>
				</div>
				<div style="display: flex; align-items: center">
					<img src="../assets/img/logo-nobackground-500-cropped.png" alt="Esporter Logo" width="100%" />
					<div v-if="remainingTime">
						<div style="font-size: 0.8em; font-style: italic">Next Split</div>
						<div style="text-align: right">
							<div style="white-space: nowrap"><strong>JustLolaman</strong></div>
							<div style="white-space: nowrap; font-family: 'Lucida Console'; font-size: 0.8em">
								<span v-if="remainingTime.days > 0">{{ remainingTime.days }}d</span>
								{{ remainingTime.hours.toString().padStart(2, "0") }}h
								{{ remainingTime.minutes.toString().padStart(2, "0") }}m
								{{ remainingTime.seconds.toString().padStart(2, "0") }}s
							</div>
						</div>
					</div>
					<div style="font-size: 0.8em; font-style: italic" v-else>New Splits start each week!</div>
				</div>
				<div>
					Esporter's Splits are the best way to improve at Magic!
					<ol>
						<li><strong>Coaching </strong> from pros</li>
						<li><strong>Play & Improve</strong> with people at your level</li>
						<li><strong>Become a Champion</strong> in a final tournament for prizes</li>
					</ol>
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
