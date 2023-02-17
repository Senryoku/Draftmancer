<template>
	<modal @close="cancel">
		<h2 slot="header">Start {{ teamSealed ? "Team " : "" }}Sealed</h2>
		<div slot="body" class="sealed-dialog">
			<div class="sealed-dialog-settings">
				<div>
					<h3>
						How many boosters for each {{ teamSealed ? "team " : "player" }} (default is
						{{ teamSealed ? "12" : "6" }})?
					</h3>
					<input
						type="number"
						min="4"
						max="24"
						step="1"
						id="input-boostersPerPlayer"
						class="swal2-input"
						style="display: block; margin: auto"
						:placeholder="`Boosters per ${teamSealed ? 'team ' : 'player'}`"
						v-model="boostersPerPlayer"
					/>
				</div>
				<div class="teams-selector" v-if="teamSealed">
					<h3>Assign players to a team:</h3>
					<div class="teams">
						<div v-for="(team, idx) in teams" :key="idx" class="team">
							<div>Team #{{ idx + 1 }}</div>
							<draggable class="team-drag-target" group="teams" :list="team" :animation="200">
								<div v-for="uid in team" :key="uid" class="player">{{ userById(uid)?.userName }}</div>
							</draggable>
						</div>
					</div>
				</div>
				<div>
					<h3>(Optional) Customize the set of each booster:</h3>
					<div class="input-customBoosters">
						<select
							class="standard-input custom-booster"
							v-for="(val, idx) in customBoosters"
							:key="idx"
							:id="'custom-booster-select-' + idx"
							v-model="customBoosters[idx]"
						>
							<option value="">(Default)</option>
							<option value="random">Random set from Card Pool</option>
							<option value="" class="option-separator" disabled>————————————————</option>
							<option v-for="s in MTGASets" :key="s.code" :value="s.code">
								{{ s.fullName }}
							</option>
							<option value="" class="option-separator" disabled>————————————————</option>
							<option v-for="s in PrimarySets" :key="s.code" :value="s.code">
								{{ s.fullName }}
							</option>
						</select>
					</div>
				</div>
			</div>
		</div>
		<div class="actions" slot="footer">
			<button class="cancel" @click="cancel">Cancel</button>
			<button class="confirm" @click="distribute">Distribute Boosters</button>
		</div>
	</modal>
</template>

<script lang="ts">
import { PropType, defineComponent } from "vue";
import { UserID } from "../../../src/IDTypes";
import { UserData } from "../../../src/Session";
import Constant from "../../../src/data/constants.json";
import SetsInfos from "../SetInfos";

import Modal from "./Modal.vue";
import Draggable from "vuedraggable";

export default defineComponent({
	components: { Modal, Draggable },
	props: {
		users: { type: Array as PropType<UserData[]>, required: true },
		teamSealed: { type: Boolean, default: false },
	},
	data() {
		// Max of 4 teams, empty ones will simply be ignored.
		// FIXME: Allow more teams?
		const teams: UserID[][] = [[], [], [], []];
		// Defaults to two teams, distribute players among them.
		for (let i = 0; i < this.users.length; i++) teams[i % 2].push(this.users[i].userID);
		const boostersPerPlayer = this.teamSealed ? 12 : 6;
		return { boostersPerPlayer, customBoosters: Array(boostersPerPlayer).fill(""), teams: teams };
	},
	methods: {
		userById(uid: UserID) {
			return this.users.find((user) => user.userID === uid);
		},
		cancel() {
			this.$emit("cancel");
		},
		distribute() {
			this.$emit("distribute", this.boostersPerPlayer, this.customBoosters, this.teams);
		},
	},
	computed: {
		MTGASets() {
			return Constant.MTGASets.slice()
				.reverse()
				.map((s: string) => {
					return { code: s, fullName: SetsInfos[s].fullName };
				});
		},
		PrimarySets() {
			return Constant.PrimarySets.filter((s) => !Constant.MTGASets.includes(s)).map((s: string) => {
				return { code: s, fullName: SetsInfos[s].fullName };
			});
		},
	},
	watch: {
		boostersPerPlayer() {
			while (this.customBoosters.length < this.boostersPerPlayer) this.customBoosters.push("");
			while (this.customBoosters.length > this.boostersPerPlayer) this.customBoosters.pop();
		},
	},
});
</script>

<style scoped>
.sealed-dialog {
	text-align: center;
}

.option-separator {
	color: #888;
}

.input-customBoosters {
	height: 10em;
	overflow-x: hidden;
	overflow-y: auto;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	grid-column-gap: 0.5em;
	padding: 0.5em;
	margin: 0.25em 0.5em;
	background-color: #ffffff10;
	border-radius: 0.5em;
	align-content: start;
}

.custom-booster {
	height: 2.5em;
}

.teams {
	display: flex;
	align-items: start;
	justify-content: center;
	gap: 1em;
}

.team {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

.team-drag-target {
	display: flex;
	flex-direction: column;
	background-color: #ffffff20;
	min-width: 10em;
	min-height: 5em;
	border-radius: 0.5em;
	padding: 0.5em;
	gap: 0.2em;
}
.player {
	cursor: grab;
	user-select: none;
	background-color: #ffffff20;
	border-radius: 0.5em;
	padding: 0.2em 0.5em;
	max-width: 9em;
	overflow: hidden;
	text-overflow: ellipsis;
}

.actions {
	display: flex;
	z-index: 1;
	box-sizing: border-box;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	width: 100%;
	margin: 1.25em auto 0;
	padding: 0;
}

/* We have to provide more specialized selectors than the default #main-container button */

.actions button,
#main-container .actions button {
	width: auto;
	height: auto;
	margin: 0.3125em;
	padding: 0.625em 1.1em;
	box-shadow: none;
	font-weight: 500;
	border: 0;
	border-radius: 0.25em;
	color: #fff;
	font-size: 1em;
	font-family: "MS Shell Dlg 2";
	text-transform: none;
	letter-spacing: initial;
}

.actions button.cancel,
#main-container .actions button.cancel {
	background-color: rgb(221, 51, 51);
}

.actions button:hover,
#main-container .actions button:hover {
	background-image: linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.1));
}
</style>
