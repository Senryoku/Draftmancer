<template>
	<div class="winchester-draft">
		<div class="section-title">
			<h2>Winchester Draft</h2>
			<div class="controls">
				<span>
					<template v-if="userID === winchesterDraftState.currentPlayer">
						Your turn to pick a pile of cards!
					</template>
					<template v-else>
						Waiting for
						{{
							winchesterDraftState.currentPlayer in sessionUsers
								? sessionUsers[winchesterDraftState.currentPlayer].userName
								: "(Disconnected)"
						}}...
					</template>
					There are {{ winchesterDraftState.remainingCards }} cards left in the main stack.
				</span>
			</div>
		</div>
		<div class="winchester-piles">
			<div
				v-for="(pile, index) in winchesterDraftState.piles"
				:key="`winchester-pile-${index}`"
				class="winchester-pile"
			>
				<div class="winchester-pile-options">
					<button
						class="winchester-pick confirm"
						@click="pick(index)"
						v-if="userID === winchesterDraftState.currentPlayer && pile.length > 0"
					>
						Take Pile
					</button>
				</div>
				<transition name="pile" mode="out-in">
					<div
						class="card-column winchester-card-column"
						:key="pile.length > 0 ? pile[0].uniqueID : `pile-${index}-cards`"
					>
						<TransitionGroup name="card">
							<card v-for="card in pile" :key="card.uniqueID" :card="card" :language="language"></card>
						</TransitionGroup>
					</div>
				</transition>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { UserID } from "@/IDTypes";
import { UserData } from "@/Session/SessionTypes";
import { WinchesterDraftSyncData } from "@/WinchesterDraft";
import { Language } from "../../../src/Types";
import Card from "./Card.vue";

defineProps<{
	userID: UserID;
	language: Language;
	sessionUsers: { [uid: UserID]: UserData };
	winchesterDraftState: WinchesterDraftSyncData;
}>();

const emit = defineEmits<{
	(e: "pick", index: number): void;
}>();

const pick = (index: number) => {
	emit("pick", index);
};
</script>

<style scoped>
.winchester-piles {
	display: flex;
	justify-content: space-around;
	position: relative;
	padding: 0.75em;
	min-height: 400px;
}

.winchester-pick {
	display: block !important;
	margin: auto !important;
}

.winchester-pile {
	display: flex;
	flex-direction: column;
	margin: 0 1em 0 1em;
	padding: 0.5em;
	width: 100%;
	max-width: 300px;
}

.winchester-pile-options {
	height: 40px;
}

.winchester-card-column .card {
	width: 100%;
	max-width: 300px;
}

.pile-enter-active,
.pile-leave-active {
	transition: all 0.5s ease;
}

.card-enter-active {
	transition: all 0.5s ease 0.5s;
}

.pile-leave-to {
	transform: translateY(-300px);
	opacity: 0;
}

.pile-enter-from,
.card-enter-from {
	transform: translateY(300px);
	opacity: 0;
}
</style>
