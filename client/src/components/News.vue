<template>
	<div class="welcome-section">
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
		<div class="news">
			<em>April 16, 2023</em>
			<ul>
				<li>
					New game mode: <strong>Housman Draft</strong>!
					<p>
						Draft variant suited for 2-4 players. Players take turns exchanging a card from a five cards
						hand with one of nine revealed cards. After three exchanges, players add their hand to their
						deck and the remaining face up cards are discarded. Repeat for nine rounds.
					</p>
				</li>
				<li>
					New setting 'bonus' in booster content: Controls the amount of cards from 'bonus sheets' in boosters
					(like Multiverse Legends cards in March of the Machines). Exact behavior can be a bit convoluted,
					refer to the setting tooltip for more information.
				</li>
				<li>
					Added support for
					<img src="img/sets/mb1.svg" class="set-icon" style="--invertedness: 100%" alt="" /> Mystery Booster
					convention editions and their playtest cards.
				</li>
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
