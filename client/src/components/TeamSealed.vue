<template>
	<div class="team-sealed-container player-colors" :style="cssVariables">
		<div class="team-sealed-infos">
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
			group="team-sealed"
			:cardConditionalClasses="cardConditionalClasses"
			:readOnly="true"
		></card-pool>
	</div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { CardColor, UniqueCard } from "../../../src/CardTypes";
import { UserData } from "../../../src/Session/SessionTypes";
import { TeamSealedPool, TeamSealedCard } from "../../../src/TeamSealed";
import { Language } from "../../../src/Types";
import CardPool from "./CardPool.vue";

export default defineComponent({
	components: { CardPool },
	props: {
		language: { type: String as PropType<Language>, required: true },
		state: { type: Object as PropType<TeamSealedPool>, required: true },
		users: { type: Array as PropType<UserData[]>, required: true },
	},
	computed: {
		cssVariables() {
			const variables = [];
			for (let i = 0; i < this.state.team.length; ++i) {
				const user = this.users.find((u) => u.userID === this.state.team[i]);
				variables.push("--user-name-" + i + ': "' + (user?.userName ?? "(Disconnected)") + '";');
			}
			return variables.join(" ");
		},
		teamDisplay() {
			const r = [];

			for (let i = 0; i < this.state.team.length; ++i) {
				const user = this.users.find((u) => u.userID === this.state.team[i]);
				const colors: { [c in CardColor]: number } = this.state.cards
					.filter((c) => c.owner === this.state.team[i])
					.reduce(
						(acc, card) => {
							for (let c of card.colors) acc[c] += 1;
							return acc;
						},
						{ W: 0, U: 0, B: 0, R: 0, G: 0 }
					);
				const finalColors = [];
				for (const c in CardColor) if (colors[c as CardColor] >= 3) finalColors.push(c);
				r.push({
					idx: i,
					userName: user ? user.userName : "(Disconnected)",
					colors: finalColors,
				});
			}
			return r;
		},
	},
	methods: {
		onCardClick(event: Event, card: UniqueCard) {
			this.$emit("pick", card.uniqueID);
		},
		cardConditionalClasses(card: TeamSealedCard) {
			if (!card.owner) return [];
			return ["card-picked", "owner-player-" + this.state.team.findIndex((t) => t === card.owner)];
		},
	},
});
</script>

<style scoped>
.team-sealed-infos {
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

.color-list {
	display: inline-flex;
	gap: 0.2em;
	margin-left: 0.5em;
}
</style>

<style src="../css/player-colors.css" scoped />
