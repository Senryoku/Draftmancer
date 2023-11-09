<template>
	<div class="welcome-section">
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
		<div class="news">
			<em>August 24, 2023</em>
			<ul>
				<li>
					<img src="img/sets/woe.svg" class="set-icon" style="--invertedness: 100%" alt="" /> Wilds of
					Eldraine is now available!
				</li>
				<li>Two new Grid Draft variants: Two players with two picks per grid and four players.</li>
				<li>
					New session setting "Automatic Logs Unlock Timer". This will automatically unlock the logs after a
					customizable period of time if the owner forgot to do it.
				</li>
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
