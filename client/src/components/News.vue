<template>
	<div class="welcome-section">
		<div class="news">
			<em>March 27, 2023</em>
			<ul>
				<li>
					New game mode: <strong>Winchester Draft</strong>! A draft variant with elements from Winston and
					Rochester drafts.
				</li>
				<li>The set selector has been updated: To select multiple sets, use Ctrl+Click or a longpress.</li>
				<li>
					You can now select a specific bonus sheet for
					<img src="img/sets/sir.svg" class="set-icon" style="--invertedness: 100%" />
					Shadows over Innistrad Remastered drafts (look for 'SIR: ...' in the 'More Sets...' menu).
				</li>
				<li>
					A lot of work behind the scene went into updating the tech stack. <br />Hopefully you won't see many
					differences - aside from some performance improvements, but I may have missed some regression: As
					always please report those in the
					<a href="https://discord.gg/XscXXNw" target="_blank"
						><font-awesome-icon icon="fa-brands fa-discord"></font-awesome-icon> discord server</a
					>!
				</li>
			</ul>
		</div>
		<div class="news">
			<em>March 17, 2023</em>
			<p>
				<img src="img/sets/sir.svg" class="set-icon" style="--invertedness: 100%; width: 2em" />
				Shadows over Innistrad Remastered preliminary support.
			</p>
		</div>
		<div class="news">
			<em>March 13, 2023</em>
			<p>
				Grid Draft now supports a 3 players variant, as described on the
				<a href="https://luckypaper.co/resources/formats/grid-draft/" target="_blank" rel="noopener nofollow"
					>Lucky Paper website</a
				>.
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
