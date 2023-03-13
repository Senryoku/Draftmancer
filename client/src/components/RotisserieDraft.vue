<template>
	<div class="rotisserie-draft-container player-colors" :style="cssVariables">
		<card-pool
			:language="language"
			:cards="state.cards"
			:@cardClick="onCardClick"
			:@cardDoubleClick="onCardDoubleClick"
			:@cardDragStart="dragStart"
			group="rotisserie-draft"
			:cardConditionalClasses="cardConditionalClasses"
			:readOnly="true"
		>
			<template v-slot:controls>
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
				classes.push("card-picked");
				classes.push("owner-player-" + this.users.findIndex((u) => u.userID === card.owner));
			}
			return classes;
		},
		dragStart(e: DragEvent, card: UniqueCard) {
			if (e.dataTransfer) {
				e.dataTransfer.setData("isrotisseriedraft", "true");
				e.dataTransfer.setData("uniqueID", card.uniqueID.toString());
				e.dataTransfer.effectAllowed = "move";
			}
		},
	},
});
</script>

<style scoped>
.rotisserie-draft-infos {
	display: flex;
	justify-content: space-between;
	margin: 1em;
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
</style>

<style src="../css/player-colors.css" scoped />
