<template>
	<div class="team-sealed-container" :style="cssVariables">
		<div class="section-title">
			<h2>Team Sealed</h2>
			<div>
				Your Team:
				<div v-for="user in teamDisplay" :key="user.idx">{{ user.userName }}</div>
			</div>
		</div>
		<card-pool
			:language="language"
			:cards="state.cards"
			:click="onCardClick"
			:readOnly="true"
			:cardConditionalClasses="cardConditionalClasses"
		></card-pool>
	</div>
</template>

<script>
import CardPool from "./CardPool.vue";

export default {
	components: { CardPool },
	props: {
		language: { type: String, required: true },
		state: { type: Object, required: true },
		users: { type: Array, required: true },
	},
	computed: {
		cssVariables() {
			const variables = [];
			for (let i = 0; i < this.state.team.length; ++i) {
				const user = this.users.find((u) => u.userID === this.state.team[i]);
				if (user) variables.push("--user-name-" + i + ': "' + user.userName + '";');
			}
			return variables.join(" ");
		},
		teamDisplay() {
			const r = [];

			for (let i = 0; i < this.state.team.length; ++i) {
				const user = this.users.find((u) => u.userID === this.state.team[i]);
				r.push({ idx: i, userName: user ? user.userName : "(Disconnected)'" });
			}
			return r;
		},
	},
	methods: {
		onCardClick(event, card) {
			this.$emit("pick", card.uniqueID);
		},
		cardConditionalClasses(card) {
			if (!card.owner) return [];
			return ["team-sealed-picked", "team-sealed-player-" + this.state.team.findIndex((t) => t === card.owner)];
		},
	},
};
</script>

<style scoped>
:deep(.team-sealed-picked > *) {
	filter: brightness(0.5);
}

:deep(.team-sealed-picked):after {
	content: "[Picked]";
	position: absolute;
	top: 50%;
	right: 1em;
	transform: translateY(-50%);
	margin: 0.2em;
	max-width: 50%;
	min-width: 20%;
	max-height: 100%;
	display: block;
	filter: brightness(1);
	border-radius: 0.4em;
	padding: 0.2em 0.4em;
	overflow: hidden;
	text-overflow: ellipsis;
}

:deep(.team-sealed-picked img) {
	box-sizing: border-box;
	border: 3px solid grey;
}

.team-sealed-container {
	--color-player-0: #8f2323;
	--color-player-1: #23628f;
	--color-player-2: #4f8f23;
	--color-player-3: #8f6a23;
	--color-player-4: #6b238f;
}

:deep(.team-sealed-player-0 img) {
	border-color: var(--color-player-0);
}
:deep(.team-sealed-player-0):after {
	content: var(--user-name-0);
	background-color: var(--color-player-0);
}
:deep(.team-sealed-player-1 img) {
	border-color: var(--color-player-1);
}
:deep(.team-sealed-player-1):after {
	content: var(--user-name-1);
	background-color: var(--color-player-1);
}
:deep(.team-sealed-player-2 img) {
	border-color: var(--color-player-2);
}
:deep(.team-sealed-player-2):after {
	content: var(--user-name-2);
	background-color: var(--color-player-2);
}
:deep(.team-sealed-player-3 img) {
	border-color: var(--color-player-3);
}
:deep(.team-sealed-player-3):after {
	content: var(--user-name-3);
	background-color: var(--color-player-3);
}
:deep(.team-sealed-player-4 img) {
	border-color: var(--color-player-4);
}
:deep(.team-sealed-player-4):after {
	content: var(--user-name-4);
	background-color: var(--color-player-4);
}
</style>
