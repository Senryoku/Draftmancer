<template>
	<div class="welcome-section">
		<div class="news">
			<em>January 26, 2023</em>
			<ul>
				<li>
					<img src="img/sets/mkm.svg" class="set-icon" style="--invertedness: 100%" alt="MKM" /> Murders at
					Karlov Manor is now available! <br />
					As always, new set, new boosters, there might be issues, I'll try to fix them as soon as possible!
				</li>
				<li>Bots will now join inactive draft queues to help them start more often.</li>
				<li>
					New "AddCard" draft effect (See
					<a href="cubeformat.html#custom-cards" target="_blank">Cube format</a>).
				</li>
				<li>General maintenance.</li>
			</ul>
		</div>
		<div class="news">
			<em>December 16, 2023</em>
			<ul>
				<li>
					Support for
					<img src="img/sets/rvr.svg" class="set-icon" style="--invertedness: 100%" alt="RVR" /> Ravnica
					Remastered! You can find it in the "<a class="clickable" @click="$emit('more-sets')"
						>More sets... </a
					>" menu.<br />
					Note that the retro frame slot is not simulated. It seems really convoluted and I don't think all
					the information necessary to correctly implement it is available yet.
				</li>
				<li>Fixed Arena versions of cards apppearing in Khans of Tarkir boosters.</li>
			</ul>
		</div>
		<div class="news">
			<em>December 6, 2023</em>
			<ul>
				<li>
					Added a
					<a href="/draftqueue"
						>Draft Queue for
						<img src="img/sets/ktk.svg" class="set-icon" style="--invertedness: 100%" alt="KTK" /> Khans of
						Tarkir</a
					>
					to accompany its release on MTGA!
				</li>
				<li>Adjusted mythics/rares ratio depending on the set.</li>
				<li>Correctly escape special characters, like quotes, in card names for MTGO export.</li>
				<li>Fixed session collection download.</li>
				<li>Usual minor tweaks</li>
			</ul>
		</div>
		<div class="news">
			<em>November 29, 2023</em>
			<ul>
				<li>
					Resolved an issue causing cards to disappear from the deck.<br />This should catch most cases, but
					I'm still unsure of the root cause. Please report if you encounter a similar issue!
				</li>
				<li>Improved the Swiss bracket pairing algorithm and user interface.</li>
				<li>
					Added a download option for MTGA/Card Names exports, as an alternative to the default copy to
					clipboard behaviour.
				</li>
				<li>Optimized draft logs compression and decompression speed.</li>
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
