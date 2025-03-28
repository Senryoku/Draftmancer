<template>
	<div class="welcome-section">
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
		<div class="news">
			<em>November 2, 2024</em>
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
