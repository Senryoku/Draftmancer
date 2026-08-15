<template>
	<div class="welcome-section">
		<div class="news">
			<em>August 16, 2026</em>
			<p>
				Removed the automatic session-wide pause when a player disconnects. Their individual timer is still
				paused.
			</p>
			<p>
				Added quick export to <a href="https://www.moxgate.com/" target="_blank">Moxgate</a>. The tournament
				brackets now includes direct links to play your matches in Moxgate.
			</p>
		</div>
		<div class="news">
			<em>July 31, 2026</em>
			<p>
				<img src="img/sets/hob.svg" class="set-icon" style="--invertedness: 100%" alt="HOB" /> The Hobbit (HOB)
				is now available.
			</p>
		</div>
		<div class="news">
			<em>June 12, 2026</em>
			<ul>
				<li>
					<img src="img/sets/msh.svg" class="set-icon" style="--invertedness: 100%" alt="MSH" /> Marvel Super
					Heroes (MSH) is now available.
				</li>
				<li>
					New opt-in Spectator Mode:<br />After enabling it from the session settings, invite spectators by
					sharing the generated link.<br />Thanks to
					<a href="https://github.com/MNoya" target="_blank">Noya</a> for implementing this feature!
				</li>
			</ul>
		</div>
		<div class="news">
			<em>April 10, 2026</em>
			<p>
				<img src="img/sets/sos.svg" class="set-icon" style="--invertedness: 100%" alt="SOS" /> Secrets of
				Strixhaven (SOS) is now available.
			</p>
		</div>
		<div class="news">
			<em>February 21, 2026</em>
			<p>
				<img src="img/sets/tmt.svg" class="set-icon" style="--invertedness: 100%" alt="TMT" /> Teenage Mutant
				Ninja Turtles (TMT) is now available.
			</p>
		</div>
		<div class="news">
			<em>January 10, 2026</em>
			<p>
				<img src="img/sets/ecl.svg" class="set-icon" style="--invertedness: 100%" alt="ECL" /> Lorwyn Eclipsed
				(ECL) is now available!
			</p>
		</div>
		<div class="news">
			<em>November 21, 2025</em>
			<p>Improved Cube Cobra integration to better support Custom Cards.</p>
			<p>Experimental support for Cube Cobra custom draft formats.</p>
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
	margin: 0.25em 0 0 0.25em;
}
</style>
