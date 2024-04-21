<template>
	<div class="welcome-section">
		<div class="news">
			<em>April 20, 2024</em>
			<p>
				<font-awesome-icon icon="fa-solid fa-trophy"></font-awesome-icon> I rewrote the tournament bracket
				system to be more robust and maintainable. Please me let me know if you encounter any regression!
			</p>
			<p>
				As a first improvement to the tournament brackets and thanks to the help of Danbopes from
				<a href="https://mtgbot.tv/donate" target="_blank">MTGBot</a>, you can now enable the experimental
				"Sync. with MTGO matches" setting in your tournament bracket and Draftmancer will automatically populate
				it with your match results!<br />Make sure everyone use their MTGO screen names for this to work
				properly ;)
			</p>
		</div>
		<div class="news">
			<em>April 11, 2024</em>
			<p>
				Reworked the way Minesweeper Draft grids are generated, allowing the use of standard MTG sets and
				lifting some restrictions for cubes.
			</p>
		</div>
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
