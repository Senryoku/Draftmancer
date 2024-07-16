<template>
	<div class="welcome-section">
		<div class="news">
			<em>July, 2024</em>
			<p>Winston Draft: The number of piles can now be customized.</p>
		</div>
		<div class="news">
			<em>May 30, 2024</em>
			<p>
				<img src="img/sets/mh3.svg" class="set-icon" style="--invertedness: 100%" alt="MH3" />
				Modern Horizons 3 is now available!
			</p>
			<p>
				Pack content is particularly confusing this time around, it is very possible I made some mistakes.
				Please let me know if you find any :)
			</p>
		</div>
		<div class="news">
			<em>May 18, 2024</em>
			<p>Custom cards update:</p>
			<ul>
				<li>
					New <code>oracle_text</code>, <code>power</code>, <code>toughness</code> and
					<code>loyalty</code> fields.
				</li>
				<li>New <code>image</code> field: A shortcut for <code>image_uris</code> with a single image.</li>
				<li>
					The system will now accept cards without images, allowing you to quickly prototype and test your
					custom cards without having to generate or host images!
				</li>
			</ul>
			<p>
				See the
				<a href="cubeformat.html#custom-cards" target="_blank">
					<font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon> Cube format
					documentation
				</a>
				for more information.
			</p>
		</div>
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
