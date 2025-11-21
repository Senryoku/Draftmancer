<template>
	<div class="welcome-section">
		<div class="news">
			<em>November 21, 2025</em>
			<p>Improved Cube Cobra integration to better support Custom Cards.</p>
		</div>
		<div class="news">
			<em>November 8, 2025</em>
			<p>
				<img src="img/sets/tla.svg" class="set-icon" style="--invertedness: 100%" alt="TLA" /> Avatar: The Last
				Airbender (TLA) is now available.
			</p>
		</div>
		<div class="news">
			<em>September, 2025</em>
			<p>
				<img src="img/sets/spm.svg" class="set-icon" style="--invertedness: 100%" alt="SPM" /> Marvel's
				Spider-Man (SPM) is now available.
			</p>
		</div>
		<div class="news">
			<em>July 19, 2025</em>
			<p>
				<img src="img/sets/eoe.svg" class="set-icon" style="--invertedness: 100%" alt="EOE" /> Edge of
				Eternities (EOE) is now available!
			</p>
		</div>
		<div class="news">
			<em>June 21, 2025</em>
			<p>Experimental custom cards import from Cube Cobra. Check 'Retrieve custom properties' on import.</p>
			<p>Improved color balancing (Thanks tiera!)</p>
		</div>
		<div class="news">
			<em>May 30, 2025</em>
			<p>
				<img src="img/sets/fin.svg" class="set-icon" style="--invertedness: 100%" alt="FIN" /> Final Fantasy is
				now available!<br />
			</p>
			<p>New options for Silent Auction Draft.</p>
		</div>
		<div class="news">
			<em>May 14, 2025</em>
			<p>
				New experimental game mode: Silent Auction Draft.<br />
				Accessible from the "Other Game Modes" dropdown.
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
