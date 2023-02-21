<template>
	<div class="rotisserie-draft-container" :style="cssVariables">
		<card-pool
			:language="language"
			:cards="state.cards"
			:click="onCardClick"
			:doubleClick="onCardDoubleClick"
			group="rotisserie-draft"
			:cardConditionalClasses="cardConditionalClasses"
			:readOnly="true"
		>
			<template slot="controls">
				<div v-if="userID === state.currentPlayer">Your turn! Pick a card:</div>
				<div v-else>Waiting for {{ currentPlayerName }} to pick a card...</div>
				<button v-if="userID === state.currentPlayer" @click="onConfirmPick" :disabled="selectedCard === null">
					Confirm Pick
				</button>
			</template>
		</card-pool>
	</div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { UniqueCard, UniqueCardID } from "../../../src/CardTypes";
import { UserData } from "../../../src/Session/SessionTypes";
import { RotisserieDraftSyncData, RotisserieDraftCard } from "../../../src/RotisserieDraft";
import { Language } from "../../../src/Types";
import CardPool from "./CardPool.vue";
import { UserID } from "../../../src/IDTypes";

export default defineComponent({
	components: { CardPool },
	data() {
		return { selectedCard: null as UniqueCardID | null };
	},
	props: {
		language: { type: String as PropType<Language>, required: true },
		state: { type: Object as PropType<RotisserieDraftSyncData>, required: true },
		users: { type: Array as PropType<UserData[]>, required: true },
		userID: { type: String as PropType<UserID>, required: true },
	},
	computed: {
		cssVariables() {
			const variables = [];
			let idx = 0;
			for (const user of this.users)
				variables.push(`--user-name-${idx++}: "${user?.userName ?? "(Disconnected)"}";`);
			return variables.join(" ");
		},
		currentPlayerName() {
			return this.users.find((u) => u.userID === this.state.currentPlayer)?.userName ?? "(Disconnected)";
		},
	},
	methods: {
		selectCard(card: UniqueCard): boolean {
			if (this.userID !== this.state.currentPlayer) return false;
			if ((card as RotisserieDraftCard).owner !== null) return false;
			this.selectedCard = card.uniqueID;
			return true;
		},
		onCardClick(event: Event, card: UniqueCard) {
			this.selectCard(card);
		},
		onCardDoubleClick(event: Event, card: UniqueCard) {
			if (this.selectCard(card)) this.onConfirmPick();
		},
		onConfirmPick() {
			if (this.userID !== this.state.currentPlayer) return;
			if (!this.selectedCard) return;
			this.$emit("pick", this.selectedCard);
			this.selectedCard = null;
		},
		cardConditionalClasses(card: RotisserieDraftCard) {
			const classes: string[] = [];
			if (card.uniqueID === this.selectedCard) classes.push("rotisserie-selected");
			if (card.owner) {
				classes.push("rotisserie-draft-picked");
				classes.push("rotisserie-draft-player-" + this.users.findIndex((u) => u.userID === card.owner));
			}
			return classes;
		},
	},
});
</script>

<style scoped>
.rotisserie-draft-container {
	--color-player-0: #8f2323;
	--color-player-1: #23628f;
	--color-player-2: #4f8f23;
	--color-player-3: #8f6a23;
	--color-player-4: #6b238f;
	--color-player-5: #737373;
	--color-player-6: #ffd400;
	--color-player-7: #00eaff;
}

.rotisserie-draft-infos {
	display: flex;
	justify-content: space-between;
	margin: 1em;
}

.team {
	display: flex;
	gap: 1em;
	align-items: baseline;
}

.player {
	padding: 0.25em 0.5em;
	background-color: #222;
	border-radius: 0.25em;
	display: inline-flex;
	align-items: center;
}
.player-0 {
	background-color: var(--color-player-0);
}
.player-1 {
	background-color: var(--color-player-1);
}
.player-2 {
	background-color: var(--color-player-2);
}
.player-3 {
	background-color: var(--color-player-3);
}
.player-4 {
	background-color: var(--color-player-4);
}
.player-5 {
	background-color: var(--color-player-5);
}
.player-6 {
	background-color: var(--color-player-6);
}
.player-7 {
	background-color: var(--color-player-7);
}

.color-list {
	display: inline-flex;
	gap: 0.2em;
	margin-left: 0.5em;
}

:deep(.rotisserie-selected) {
	margin: -3px;
	border: 3px solid green;
	border-radius: 4% / calc((1 / 0.135) * 4%);
}

:deep(.rotisserie-selected::before),
:deep(.rotisserie-selected::after) {
	content: "";
	position: absolute;
	top: 50%;
	border-top: 6px solid transparent;
	border-bottom: 6px solid transparent;
	animation: bob 1.5s ease-in-out infinite;
	filter: drop-shadow(0 0 2px black);
	z-index: 1;
	transform: translateY(-50%);
}
:deep(.rotisserie-selected::before) {
	left: -10px;
	border-left: 6px solid green;
}
:deep(.rotisserie-selected::after) {
	right: -10px;
	border-right: 6px solid green;
	animation-delay: -0.75s;
}

@keyframes bob {
	0% {
		transform: translateX(-2px) translateY(-50%);
	}
	50% {
		transform: translateX(2px) translateY(-50%);
	}
	100% {
		transform: translateX(-2px) translateY(-50%);
	}
}

:deep(.rotisserie-draft-picked > *) {
	filter: brightness(0.5);
}

:deep(.rotisserie-draft-picked):after {
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

:deep(.rotisserie-draft-picked img) {
	box-sizing: border-box;
	border: 3px solid grey;
}

:deep(.rotisserie-draft-player-0 img) {
	border-color: var(--color-player-0);
}
:deep(.rotisserie-draft-player-0):after {
	content: var(--user-name-0);
	background-color: var(--color-player-0);
}
:deep(.rotisserie-draft-player-1 img) {
	border-color: var(--color-player-1);
}
:deep(.rotisserie-draft-player-1):after {
	content: var(--user-name-1);
	background-color: var(--color-player-1);
}
:deep(.rotisserie-draft-player-2 img) {
	border-color: var(--color-player-2);
}
:deep(.rotisserie-draft-player-2):after {
	content: var(--user-name-2);
	background-color: var(--color-player-2);
}
:deep(.rotisserie-draft-player-3 img) {
	border-color: var(--color-player-3);
}
:deep(.rotisserie-draft-player-3):after {
	content: var(--user-name-3);
	background-color: var(--color-player-3);
}
:deep(.rotisserie-draft-player-4 img) {
	border-color: var(--color-player-4);
}
:deep(.rotisserie-draft-player-4):after {
	content: var(--user-name-4);
	background-color: var(--color-player-4);
}
:deep(.rotisserie-draft-player-5 img) {
	border-color: var(--color-player-5);
}
:deep(.rotisserie-draft-player-5):after {
	content: var(--user-name-5);
	background-color: var(--color-player-5);
}
:deep(.rotisserie-draft-player-6 img) {
	border-color: var(--color-player-6);
}
:deep(.rotisserie-draft-player-6):after {
	content: var(--user-name-6);
	background-color: var(--color-player-6);
}
:deep(.rotisserie-draft-player-7 img) {
	border-color: var(--color-player-7);
}
:deep(.rotisserie-draft-player-7):after {
	content: var(--user-name-7);
	background-color: var(--color-player-7);
}
</style>
