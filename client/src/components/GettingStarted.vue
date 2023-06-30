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
				<p>
					Customize your personal settings, like your User Name or Card Language on top of the page.<br />
					There are also toggles to enable e.g. sound alerts and notifications in the upper right.
				</p>
				<p>
					Join the desired session by entering its Session ID in the top left, or by following the link shared
					by the session owner.
				</p>
				<p>You can also enter an arbitrary Session ID at any to start your own session.</p>
			</div>
		</div>
		<div>
			<div class="section-title">
				<h2>
					As Session owner
					<font-awesome-icon icon="fa-solid fa-crown" class="subtle-gold"></font-awesome-icon>
					<span v-if="isSessionOwner"> (That's you!)</span>
					<span v-else
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
defineProps<{
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
