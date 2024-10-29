<template>
	<div class="welcome-section">
		<div class="news">
			<em>October, 2024</em>
			<ul>
				<li>
					<img src="img/sets/fdn.svg" class="set-icon" style="--invertedness: 100%" alt="FDN" /> Foundations
					support.
				</li>
				<li>
					<img src="img/sets/j25.svg" class="set-icon" style="--invertedness: 100%" alt="J25" /> Foundations
					Jumpstart support. You can find it in the new "Jumpstart" sub menu.
				</li>
			</ul>
		</div>
		<div class="news">
			<em>October 16, 2024</em>
			<ul>
				<li>Added Alchemy: Duskmourn cards.</li>
				<li>
					New experimental game mode: Jump In!<br />Subtleties like dual lands allocations and more sets will
					be added later on if there's an interest.
				</li>
				<li>
					Extended slots in cubes to support multiple sheets (card lists) per slot.
					<br />This will help create complex layouts more easily, limiting the number combinaison needed.
				</li>
				<li>
					Added 'striped' collation support. Thanks to tiera3 for the idea and help with the implementation.
				</li>
				<li>Usual maintenance and minor tweaks and fixes.</li>
			</ul>
		</div>
		<div class="news">
			<em>September 24, 2024</em>
			<p>
				Added <img src="img/sets/mb2.svg" class="set-icon" style="--invertedness: 100%" alt="MB2" />
				Mystery Booster 2 support!
			</p>
		</div>
		<div class="news">
			<em>September 14, 2024</em>
			<p>
				<img src="img/sets/dsk.svg" class="set-icon" style="--invertedness: 100%" alt="DSK" />
				Duskmourn: House of Horror is now available!
			</p>
		</div>
		<div class="news">
			<em>July 18, 2024</em>
			<p>
				<img src="img/sets/blb.svg" class="set-icon" style="--invertedness: 100%" alt="BLB" />
				Bloomburrow is now available!
			</p>
			<p>Winston Draft: The number of piles can now be customized.</p>
		</div>
		<div class="news">
			<em>May 30, 2024</em>
			<p>
				<img src="img/sets/mh3.svg" class="set-icon" style="--invertedness: 100%" alt="MH3" />
				Modern Horizons 3 is now available!
			</p>
		</div>
	</div>
</template>

<style scoped>
.news:not(:last-child) {
	margin-bottom: 1em;
}

.news p {
	margin: 0.25em 0 0 1em;
}

.news ul {
	list-style-type: disc;
	margin: 0.25em 0 0 2em;
}

.news li {
	margin: 0.25em 0 0 1em;
}
</style>
