<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Start {{ teamSealed ? "Team " : "" }}Sealed</h2>
		</template>
		<template v-slot:body>
			<div class="sealed-dialog">
				<div class="sealed-dialog-settings">
					<div class="teams-selector" v-if="teamSealed">
						<h3>Assign players to a team:</h3>
						<div class="teams">
							<div v-for="(team, idx) in teams" :key="idx" class="team">
								<div>Team #{{ idx + 1 }}</div>
								<Sortable
									class="team-drag-target"
									:list="team"
									:item-key="(uid: UserID) => uid"
									@add="(evt) => teamAdd(evt, team)"
									@remove="(evt) => teamRemove(evt, team)"
									:options="{ group: 'teams', animation: '200' }"
								>
									<template #item="{ element }">
										<div class="player" :data-userid="element">
											{{ userById(element)?.userName }}
										</div>
									</template>
								</Sortable>
							</div>
						</div>
					</div>
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
							v-model.number="boostersPerPlayer"
						/>
					</div>
					<div>
						<h3>
							<input id="input-useCustomizedBoosters" type="checkbox" v-model="useCustomizedBoosters" />
							<label for="input-useCustomizedBoosters">Customize the set of each booster</label>
						</h3>
						<transition name="expand">
							<div class="input-customBoosters" v-show="useCustomizedBoosters">
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
						</transition>
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="cancel" @click="cancel">Cancel</button>
				<button class="confirm" @click="distribute">Distribute Boosters</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref, watch, toRefs } from "vue";
import Modal from "./Modal.vue";
import { Sortable } from "sortablejs-vue3";
import { UserID } from "../../../src/IDTypes";
import { UserData } from "../../../src/Session/SessionTypes";
import Constant from "../../../src/data/constants.json";
import SetsInfos from "../SetInfos";
import { SetCode } from "../../../src/Types";
import { SortableEvent } from "sortablejs";

const props = withDefaults(
	defineProps<{
		users: UserData[];
		teamSealed: Boolean;
	}>(),
	{ teamSealed: () => false }
);
const { users, teamSealed } = toRefs(props);

const teams = ref([[], [], [], []] as UserID[][]);
const boostersPerPlayer = ref(teamSealed.value ? 12 : 6);
const useCustomizedBoosters = ref(false);
const customBoostersDefaultValue = Array(boostersPerPlayer.value).fill("");
const customBoosters = ref([...customBoostersDefaultValue]);

// Defaults to two teams, distribute players among them.
for (let i = 0; i < users.value.length; i++) teams.value[i % 2].push(users.value[i].userID);

const PrimarySets = Constant.PrimarySets.filter((s) => !Constant.MTGASets.includes(s)).map((s: string) => {
	return { code: s, fullName: SetsInfos[s].fullName };
});
const MTGASets = Constant.MTGASets.slice()
	.reverse()
	.map((s: string) => {
		return { code: s, fullName: SetsInfos[s].fullName };
	});

const emit = defineEmits<{
	(e: "cancel"): void;
	(e: "distribute", boostersPerPlayer: number, customBoosters: SetCode[], teams: UserID[][]): void;
}>();

// Methods
const userById = (uid: UserID) => users.value.find((user) => user.userID === uid);
const teamAdd = (evt: SortableEvent, team: UserID[]) => {
	evt.item.remove();
	team.splice(evt.newIndex!, 0, evt.item.dataset.userid!);
};
const teamRemove = (evt: any, team: UserID[]) => {
	team.splice(evt.oldIndex, 1);
};
const cancel = () => emit("cancel");
const distribute = () =>
	emit(
		"distribute",
		boostersPerPlayer.value,
		useCustomizedBoosters.value ? customBoosters.value : customBoostersDefaultValue,
		teams.value
	);

// Watch
watch(boostersPerPlayer, () => {
	while (customBoosters.value.length < boostersPerPlayer.value) customBoosters.value.push("");
	while (customBoosters.value.length > boostersPerPlayer.value) customBoosters.value.pop();
});
</script>

<style scoped>
.sealed-dialog {
	text-align: center;
}

.sealed-dialog-settings {
	min-width: 60em;
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

.expand-enter-active,
.expand-leave-active {
	transition: all 0.5s ease-in-out;
	overflow: hidden;
}

.expand-enter,
.expand-leave-to {
	height: 0;
	padding: 0;
}
</style>
