<template>
	<div class="welcome-section">
		<div class="news">
			<em>June 09, 2023</em>
			<p>
				<img src="img/sets/ltr.svg" class="set-icon" style="--invertedness: 100%" alt="" /> The Lord of the
				Rings: Tales of Middle-earth support!
			</p>
		</div>
		<div class="news">
			<em>May 30, 2023</em>
			<ul>
				<li>
					Extended
					<img src="img/sets/cns.svg" class="set-icon" style="--invertedness: 100%" alt="" /> Conspiracy draft
					effects support to
					<a href="https://github.com/Senryoku/Draftmancer/wiki/Conspiracy-cards-support" target="blank">
						more cards</a
					>.
				</li>
				<li>
					Added a way to apply these Conspiracy draft effects on
					<a href="https://draftmancer.com/cubeformat.html#custom-cards" target="blank">Custom Cards</a>.
				</li>
				<li>Enhanced draft logs to include picks for more Game Modes.</li>
				<li>Various bug fixes and improvements.</li>
			</ul>
		</div>
		<div class="news">
			<em>May 16, 2023</em>
			<ul>
				<li>
					Experimental support for
					<img src="img/sets/cns.svg" class="set-icon" style="--invertedness: 100%" alt="" /> Conspiracy draft
					matters cards!<br />
					Not all cards are supported, but I tried to focus on the most popular ones, like
					<a href="https://scryfall.com/card/cns/58/cogwork-librarian" target="blank">
						<font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon>
						Cogwork Librarian
					</a>
					or
					<a href="https://scryfall.com/card/cns/62/lore-seeker" target="blank">
						<font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon>
						Lore Seeker
					</a>
					. You can find the detailled list of supported cards on
					<a href="https://github.com/Senryoku/Draftmancer/wiki/Conspiracy-cards-support" target="blank"
						>this page of the GitHub wiki</a
					>.
				</li>
			</ul>
		</div>
		<div class="news">
			<em>May 09, 2023</em>
			<ul>
				<li>
					New feature: <a href="/draftqueue">Draft Queues</a>!<br />
					Quickly and conveniently practice drafting againt actual humans!
				</li>
				<li>
					<img src="img/sets/mat.svg" class="set-icon" style="--invertedness: 100%" alt="" /> March of the
					Machine: The Aftermath draft, mimicking Arena's with one MAT card in a MOM booster.
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
