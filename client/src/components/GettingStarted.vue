<template>
	<div>
		<div>
			<div class="section-title">
				<h2>
					As Player <font-awesome-icon icon="fa-solid fa-user"></font-awesome-icon>
					<span v-if="!isSessionOwner">(That's you!)</span>
				</h2>
			</div>
			<div style="margin-top: 0.5em; margin-bottom: 1em">
				Customize your personal settings, like your User Name or Card Language on top of the page.<br />
				There are also toggles to enable e.g. sound alerts and notifications in the upper right.
				<br />
				<span v-if="!isSessionOwner">
					<ul>
						<li>
							Wait for the session owner (<em
								>{{ sessionOwnerName }}
								<font-awesome-icon icon="fa-solid fa-crown" class="subtle-gold"></font-awesome-icon></em
							>) to select the settings and launch the game!
						</li>
						<li>Or, to create a new session that you own, change "Session ID" in the top left.</li>
					</ul>
				</span>
			</div>
		</div>
		<div>
			<div class="section-title">
				<h2>
					As Session owner
					<font-awesome-icon icon="fa-solid fa-crown" class="subtle-gold"></font-awesome-icon>
					<span v-if="isSessionOwner">(That's you!)</span
					><span v-else
						>(currently <em>{{ sessionOwnerName }}</em
						>)</span
					>
				</h2>
			</div>
			<div style="margin-top: 0.5em; margin-bottom: 1em">
				One player takes the role of owner of the session (designated with
				<font-awesome-icon icon="fa-solid fa-crown" class="subtle-gold"></font-awesome-icon>), by default the
				first connected player.
				<ol>
					<li>Session owner chooses an arbitrary Session ID.</li>
					<li>
						Other players join the session by entering its ID or by following the
						<a @click="sessionURLToClipboard">
							Session Link
							<font-awesome-icon icon="fa-solid fa-share-square"></font-awesome-icon>
						</a>
						.
					</li>
					<li>
						Owner configures the game. (Take a look at all
						<a @click="openSettings">
							<font-awesome-icon icon="fa-solid fa-cog"></font-awesome-icon> Settings</a
						>)
					</li>
					<li>
						Ready check is performed to make sure everybody is set (
						<font-awesome-icon icon="fa-solid fa-user-check"></font-awesome-icon>
						).
					</li>
					<li>Once all confirmed, the session owner launches the desired game mode.</li>
				</ol>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	isSessionOwner: boolean;
	sessionOwnerName: string;
}>();

const emit = defineEmits<{
	(e: "openSettings"): void;
	(e: "sessionURLToClipboard"): void;
}>();

const openSettings = () => {
	emit("openSettings");
};
const sessionURLToClipboard = () => {
	emit("sessionURLToClipboard");
};
</script>
