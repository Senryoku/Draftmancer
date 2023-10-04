<template>
	<div class="welcome-section">
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
		<div class="news">
			<em>July 23, 2023</em>
			<p>
				<img src="img/sets/cmm.svg" class="set-icon" style="--invertedness: 100%" alt="" /> Commander Masters
				experimental support.
			</p>
			<ul>
				<li>
					Available from the <font-awesome-icon icon="fa-solid fa-ellipsis-v"></font-awesome-icon> More
					sets... menu.
				</li>
				<li>Use 'Picked cards per booster' set to 2 to draft the set as intended!</li>
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
