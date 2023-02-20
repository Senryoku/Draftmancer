<template>
	<div class="rotisserie-draft-container" :style="cssVariables">
		<div class="rotisserie-draft-infos">
			<div class="team">
				<div>Your Team:</div>
				<div v-for="user in teamDisplay" :key="user.idx" :class="`player player-${user.idx}`">
					<span>{{ user.userName }}</span>
					<span class="color-list" v-if="user.colors">
						<img v-for="c in user.colors" :key="c" :src="'img/mana/' + c + '.svg'" class="mana-icon" />
					</span>
				</div>
			</div>
			<div>Click on cards to add them to your deck or return them to the common pool.</div>
		</div>
		<card-pool
			:language="language"
			:cards="state.cards"
			:click="onCardClick"
			group="rotisserie-draft"
			:cardConditionalClasses="cardConditionalClasses"
			:readOnly="true"
		></card-pool>
	</div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { CardColor, UniqueCard } from "../../../src/CardTypes";
import { UserData } from "../../../src/Session/SessionTypes";
import { RotisserieDraftSyncData, RotisserieDraftCard } from "../../../src/RotisserieDraft";
import { Language } from "../../../src/Types";
import CardPool from "./CardPool.vue";

export default defineComponent({
	components: { CardPool },
	props: {
		language: { type: String as PropType<Language>, required: true },
		state: { type: Object as PropType<RotisserieDraftSyncData>, required: true },
		users: { type: Array as PropType<UserData[]>, required: true },
	},
	computed: {
		cssVariables() {
			const variables = [];
			for (let i = 0; i < this.state.team.length; ++i) {
				const user = this.users.find((u) => u.userID === this.state.team[i]);
				variables.push(`--user-name-${i}: "${user?.userName ?? "(Disconnected)"}";`);
			}
			return variables.join(" ");
		},
	},
	methods: {
		onCardClick(event: Event, card: UniqueCard) {
			this.$emit("pick", card.uniqueID);
		},
		cardConditionalClasses(card: RotisserieDraftCard) {
			if (!card.owner) return [];
			return [
				"rotisserie-draft-picked",
				"rotisserie-draft-player-" + this.state.team.findIndex((t) => t === card.owner),
			];
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

.color-list {
	display: inline-flex;
	gap: 0.2em;
	margin-left: 0.5em;
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
</style>
