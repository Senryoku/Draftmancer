<template>
	<div class="welcome-section">
		<div class="news">
			<em>May 04, 2023</em>
			<ul>
				<li>
					<img src="img/sets/mat.svg" class="set-icon" style="--invertedness: 100%" alt="" /> March of the
					Machine: The Aftermath cards.
				</li>
				<li>Option to remove basics in Solomon and Housman drafts. Thanks NerdyNathan for his contribution!</li>
				<li>Various tweaks and fixes.</li>
			</ul>
		</div>
		<div class="news">
			<em>April 28, 2023</em>
			<ul>
				<li>
					New game mode: <strong>Solomon Draft</strong>!<br />A draft variant for two players reminiscing of
					the card Fact or Fiction.
				</li>
				<li>Added a pick history for Rotisserie Drafts.</li>
				<li>
					Updated <a href="cubeformat.html#custom-cards" target="blank">Custom Cards support</a>:
					<ul>
						<li>Added an optional 'related_cards' property.</li>
						<li>Improved mana cost parsing.</li>
					</ul>
				</li>
				<li>Various tweaks and fixes.</li>
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
