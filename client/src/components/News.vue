<template>
	<div class="welcome-section">
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
		<div class="news">
			<em>November 09, 2023</em>
			<ul>
				<li>
					New experimental setting for cubes: <em>Per-booster settings</em>.
					<br />
					Allows you to adjust the number of picked or burned cards for each booster. See the
					<a href="cubeformat.html#settings" target="_blank">Cube format documentation</a>.
				</li>
			</ul>
		</div>
		<div class="news">
			<em>November 03, 2023</em>
			<ul>
				<li>
					<img src="img/sets/lci.svg" class="set-icon" style="--invertedness: 100%" alt="" /> The Lost Caverns
					of Ixalan are now available! <br />
					As usual with new sets, there might be errors in the cards or collation. Please report them and I'll
					fix them as soon as possible!
				</li>
				<li>
					Fixed an issue creating phantom cards when a card was automatically picked while drag and dropping
					another.
				</li>
				<li>Usual card updates and small fixes.</li>
			</ul>
		</div>
		<div class="news">
			<em>October 04, 2023</em>
			<ul>
				<li>Better support for parentheses in card names.</li>
				<li>Improved reconnection reliability when multiple tabs are open.</li>
				<li>Players can now start a vote to take ownership of a session (4 players or more).</li>
				<li>Usual tweaks and fixes.</li>
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
