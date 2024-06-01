<template>
	<div>
		<p>
			Developped by
			<a href="https://senryoku.github.io/" target="_blank" rel="noopener nofollow">Senryoku</a>
			(contact in French or English:
			<a href="mailto:dev@draftmancer.com">dev@draftmancer.com</a>
			) using
			<a href="https://scryfall.com/">Scryfall</a>
			card data and images and loads of open source software.
		</p>
		<p>
			Draftmancer Discord:
			<a href="https://discord.gg/XscXXNw">https://discord.gg/XscXXNw</a>
		</p>
		<h3>Patch Notes</h3>
		<patch-notes></patch-notes>
		<span style="font-size: 0.8em">
			(detailed changes can be found on
			<a href="https://github.com/Senryoku/Draftmancer" title="GitHub" target="_blank" rel="noopener nofollow">
				<font-awesome-icon
					icon="fa-brands fa-github"
					style="vertical-align: baseline; padding: 0px 0.25em"
				></font-awesome-icon>
				GitHub
			</a>
			)
		</span>
		<h3>Notice</h3>
		<p>
			Draftmancer is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by
			Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
		</p>
	</div>
</template>

<script setup lang="ts">
import PatchNotes from "./PatchNotes.vue";
</script>
