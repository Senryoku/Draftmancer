<template>
	<div class="welcome-section">
		<div class="news">
			<em>April 4, 2024</em>
			<ul>
				<li>
					<img src="img/sets/otj.svg" class="set-icon" style="--invertedness: 100%" alt="OTJ" />
					Outlaws of Thunder Junction is now available!
				</li>
				<li>New solo game mode: Supreme Draft!<br />Pick 2 cards from each booster and discard the rest.</li>
				<li>
					<img
						src="../assets/img/cards.svg"
						width="24px"
						height="24px"
						style="float: left; margin-right: 0.5em"
					/>
					Added a quick way to generate sample hands from your current deck.<br />Thanks Aritsune for the idea
					and implementation!
				</li>
			</ul>
		</div>
		<div class="news">
			<em>February 17, 2024</em>
			<ul>
				<li>
					You can now customize the card back of your uploaded custom card lists and adjust the height of the
					card title to your liking.<br />
					See the <a href="cubeformat.html#settings" target="_blank">Cube format</a> documentation.
				</li>
			</ul>
		</div>
		<div class="news">
			<em>January 26, 2024</em>
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
