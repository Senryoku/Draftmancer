<template>
	<div class="welcome-section">
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
			<p>Improved color balacing (Thanks tiera!)</p>
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
		<div class="news">
			<em>March 28, 2025</em>
			<p>
				<img src="img/sets/tdm.svg" class="set-icon" style="--invertedness: 100%" alt="TDM" /> Tarkir:
				Dragonstorm is now available!<br />
			</p>
		</div>
		<div class="news">
			<em>February 1, 2025</em>
			<p>
				<img src="img/sets/dft.svg" class="set-icon" style="--invertedness: 100%" alt="DFT" /> Aetherdrift is
				now available!<br />
			</p>
		</div>
		<div class="news">
			<em>January 10, 2025</em>
			<p>Happy new year everyone! :)</p>
			<p>
				Initial <img src="img/sets/inr.svg" class="set-icon" style="--invertedness: 100%" alt="INR" />Innistrad
				Remastered support is live!<br />
			</p>
		</div>
		<div class="news">
			<em>December 7, 2024</em>
			<p>
				<img src="img/sets/pio.svg" class="set-icon" style="--invertedness: 100%" alt="PIO" /> Pioneer Masters
				experimental support.<br />
				This set has a rotating bonus sheet. You can select a specific bonus sheet in the "More sets" menu.
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
