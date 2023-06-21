<template>
	<div class="welcome-section">
		<div class="news">
			<em>June 21, 2023</em>
			<ul>
				<li>Experimental tournament settings for standard drafts:</li>
				<ul>
					<li>
						Stricter timer following
						<a href="https://blogs.magicjudges.org/rules/mtr-appendix-b/" target="_blank"
							>official rulings</a
						>.
					</li>
					<li>Option to hide picks during the draft.</li>
					<li>Optional review phase between boosters.</li>
				</ul>
				<li>Extended Winston Draft to any number of players.</li>
			</ul>
		</div>
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
