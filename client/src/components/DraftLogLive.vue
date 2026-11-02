<template>
	<div>
		<template v-if="show">
			<div v-if="player && player in draftlog.users">
				<div class="draft-log-live-title">
					<h2>Live Review: {{ draftlog.users[player].userName }}</h2>
					<template v-if="picksPerPack.length > 0">
						<span class="pick-controls">
							<font-awesome-icon
								:class="{ disabled: pack <= 0 && pick <= 0 }"
								icon="fa-solid fa-chevron-left"
								class="clickable"
								v-tooltip="'Previous pick'"
								@click="prevPick"
							/>
							<label>Pack #</label>
							<select v-model="pack" style="width: 4em">
								<option v-for="index in picksPerPack.length" :key="index" :value="index - 1">
									{{ index }}
								</option>
							</select>
							,
							<label>Pick #</label>
							<select v-model="pick" style="width: 4em">
								<option v-for="index in picksPerPack[pack].length" :key="index" :value="index - 1">
									{{ index }}
								</option>
							</select>
							<font-awesome-icon
								:class="{
									disabled: pack >= picksPerPack.length - 1 && pick >= picksPerPack[pack].length - 1,
								}"
								icon="fa-solid fa-chevron-right"
								class="clickable"
								v-tooltip="'Next pick'"
								@click="nextPick"
							/>
							<font-awesome-icon
								:key="`latest-${unseenPicks}`"
								:class="{ disabled: onLatestPick, 'new-pick': hasUnseenPicks }"
								icon="fa-solid fa-angle-double-right"
								class="clickable jump-to-latest"
								v-tooltip="'Jump to the newest pick'"
								@click="jumpToLatest"
							/>
						</span>
						<h2>{{ pickNames }}</h2>
						<span v-if="previousPickNames">Previous pick: {{ previousPickNames }}</span>
					</template>
					<scale-slider v-model.number="cardScale" />
				</div>
				<template v-if="picksPerPack.length === 0">
					<p>Waiting for {{ draftlog.users[player].userName }} to make their first pick...</p>
				</template>
				<template v-else>
					<div v-if="validPick">
						<transition :name="'slide-fade-' + pickTransition" mode="out-in">
							<draft-log-pick
								:key="`${player}-${pick}`"
								:pick="picksPerPack[pack][pick]"
								:carddata="draftlog.carddata"
								:language="language"
								:scale="cardScale"
							></draft-log-pick>
						</transition>
						<div
							class="container deck-container"
							style="min-height: calc(30vw); /* Workaround (Hackish) to avoid unwanted scrolls */"
						>
							<div class="deck">
								<card-pool
									:cards="selectedPlayerCards.main"
									:language="language"
									:readOnly="true"
									:group="`deck-${player}`"
									:key="`deck-${player}-${selectedPlayerCards.main.length}`"
								>
									<template v-slot:title>Deck ({{ selectedPlayerCards.main.length }})</template>
								</card-pool>
							</div>
							<div class="collapsed-sideboard" v-if="selectedPlayerCards.side.length > 0">
								<div class="section-title">
									<h2>Sideboard ({{ selectedPlayerCards.side.length }})</h2>
								</div>
								<div class="card-container">
									<Sortable
										:key="`side_col_${selectedPlayerCards.side.length}`"
										class="card-column drag-column"
										:list="selectedPlayerCards.side"
										item-key="uniqueID"
										@update="sortableUpdate($event, selectedPlayerCards.side)"
										:options="{
											group: `side-${player}`,
											animation: '200',
										}"
									>
										<template #item="{ element }">
											<CardComponent
												:key="`side_card_${element.uniqueID}`"
												:card="element"
												:language="language"
											></CardComponent>
										</template>
									</Sortable>
								</div>
							</div>
						</div>
					</div>
				</template>
			</div>
			<p class="draft-log-live-instructions" v-else>Click on a player to inspect their picks!</p>
		</template>
		<template v-else>
			<p class="draft-log-live-instructions">
				(Live review is not available when the draft logs recipients setting is set to 'No-one')
			</p>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, withDefaults } from "vue";
import DraftLogPick from "./DraftLogPick.vue";
import CardPool from "./CardPool.vue";
import CardComponent from "./Card.vue";
import ScaleSlider from "./ScaleSlider.vue";
import { Sortable } from "sortablejs-vue3";
import { Language } from "@/Types";
import { DraftLog, DraftPick, DeprecatedDraftPick } from "@/DraftLog";
import { CardID, Card, UniqueCard } from "@/CardTypes";
import { UserID } from "@/IDTypes";
import { sortableUpdate, groupPicksPerPack } from "../helper";

const props = withDefaults(
	defineProps<{
		show?: boolean;
		draftlog: DraftLog;
		pendingPicks?: Record<UserID, DraftPick>;
		language: Language;
	}>(),
	{
		show: true,
		pendingPicks: () => ({}),
	}
);

let uniqueID = 0;
const genUniqueCard = (card: Card): UniqueCard => Object.assign({ uniqueID: ++uniqueID }, card);

const player = ref<UserID | undefined>(undefined);
const pack = ref(0);
const pick = ref(0);
const eventListeners = ref<{ element: HTMLElement; callback: () => void }[]>([]);
const pickTransition = ref("right");
const cardScale = ref(1);
const unseenPicks = ref(0);

const getCard = (cid: CardID) => props.draftlog.carddata[cid];
const getCardName = (cid: CardID) => {
	const c = getCard(cid);
	return props.language in c.printed_names ? c.printed_names[props.language] : c.name;
};
const setPlayer = (userID: UserID) => {
	if (!(userID in props.draftlog.users)) return;
	player.value = userID;

	pack.value = 0;
	pick.value = 0;
	unseenPicks.value = 0;
	// Get to the last pick once computed values are updated.
	nextTick(jumpToLatest);
};
const jumpToLatest = () => {
	if (picksPerPack.value.length === 0) return;
	pack.value = picksPerPack.value.length - 1;
	pick.value = picksPerPack.value[pack.value].length - 1;
};
const prevPick = () => {
	if (pick.value === 0) {
		if (pack.value === 0) return;
		--pack.value;
		pick.value = picksPerPack.value[pack.value].length - 1;
	} else {
		--pick.value;
	}
};
const nextPick = () => {
	if (pick.value === picksPerPack.value[pack.value].length - 1) {
		if (pack.value === picksPerPack.value.length - 1) return;
		++pack.value;
		pick.value = 0;
	} else {
		++pick.value;
	}
};
const shortcuts = (e: KeyboardEvent) => {
	if (e.key === "ArrowLeft") {
		prevPick();
		e.preventDefault();
	} else if (e.key === "ArrowRight") {
		nextPick();
		e.preventDefault();
	}
};
const registerPlayerSelectEvents = () => {
	clearPlayerSelectEvents();
	const playerEls = document.querySelectorAll<HTMLElement>("ul.player-list li");
	for (const el of playerEls) {
		const callback = () => {
			const id = el.dataset.userid;
			if (id) setPlayer(id as UserID);
		};
		eventListeners.value.push({ element: el, callback });
		el.classList.add("clickable");
		el.addEventListener("click", callback);
	}
};
const clearPlayerSelectEvents = () => {
	for (const tuple of eventListeners.value) {
		tuple.element.removeEventListener("click", tuple.callback);
		tuple.element.classList.remove("clickable");
	}
	eventListeners.value = [];
};

const pickNames = computed(() => {
	if (picksPerPack.value.length === 0 || !validPick.value) return "";
	const currentPick = picksPerPack.value[pack.value][pick.value];
	if (currentPick.pick.length === 0) return "Picking...";
	return currentPick.pick
		.map((idx) => currentPick.booster[idx])
		.map(getCardName)
		.join(", ");
});
const selectedPlayerCards = computed(() => {
	const selected = props.draftlog.users?.[player.value!];
	const decklist = selected?.decklist;
	if (decklist?.main)
		return {
			main: decklist.main.map(getCard).map(genUniqueCard),
			side: decklist.side.map(getCard).map(genUniqueCard),
		};
	if (!selected?.picks) return { main: [], side: [] };
	return {
		main: (selected.picks as DraftPick[])
			.flatMap((p: DraftPick) => p.pick.map((idx) => p.booster[idx]))
			.map(getCard)
			.map(genUniqueCard),
		side: [],
	};
});
const selectedLog = computed(() => props.draftlog.users[player.value!]);
const picksPerPack = computed(() => {
	if (!selectedLog.value || !selectedLog.value.picks || props.draftlog.type !== "Draft") return [] as DraftPick[][];
	if (props.draftlog.version === "2.0") {
		// Infer PackNumber & PickNumber
		const groups: DraftPick[][] = [];
		let currPick = 0;
		let currBooster = -1;
		let lastSize = 0;
		let currPickNumber = 0;
		while (currPick < selectedLog.value.picks.length) {
			const p = selectedLog.value.picks[currPick] as DeprecatedDraftPick;
			if (p.booster.length > lastSize) {
				++currBooster;
				currPickNumber = 0;
				groups.push([]);
			} else ++currPickNumber;
			groups[currBooster].push({
				packNum: currBooster,
				pickNum: currPickNumber,
				pick: p.pick,
				burn: p.burn,
				booster: p.booster,
			});
			lastSize = p.booster.length;
			++currPick;
		}
		return groups;
	}
	const picks = selectedLog.value.picks as DraftPick[];
	const pendingPick = props.pendingPicks[player.value!];
	return groupPicksPerPack(pendingPick ? [...picks, pendingPick] : picks);
});
const validPick = computed(
	() => pack.value < picksPerPack.value.length && pick.value < picksPerPack.value[pack.value]?.length
);
const pickIndex = computed(() => {
	let index = pick.value;
	for (let p = 0; p < pack.value && p < picksPerPack.value.length; ++p) index += picksPerPack.value[p].length;
	return index;
});
const totalPicks = computed(() => picksPerPack.value.reduce((acc, packPicks) => acc + packPicks.length, 0));
const madePicks = computed(() => selectedLog.value?.picks?.length ?? 0);
const previousPickNames = computed(() => {
	if (!validPick.value) return "";
	const onPendingPick = picksPerPack.value[pack.value][pick.value].pick.length === 0;
	if (!onPendingPick) return "";
	return lastMadePickCardIDs.value.map(getCardName).join(", ");
});
const lastMadePickCardIDs = computed(() => {
	const picks = (selectedLog.value?.picks ?? []) as DraftPick[];
	const lastPick = picks[picks.length - 1];
	if (!lastPick) return [] as CardID[];
	return lastPick.pick.map((idx) => lastPick.booster[idx]) as CardID[];
});
const onLatestPick = computed(() => pickIndex.value === totalPicks.value - 1);
const onLatestMadePick = computed(() => pickIndex.value >= madePicks.value - 1);
const hasUnseenPicks = computed(() => unseenPicks.value > 0 && !onLatestMadePick.value);
const livePosition = computed(() => ({
	player: player.value,
	totalPicks: totalPicks.value,
	madePicks: madePicks.value,
}));

// A following viewer moves to the booster being picked from, the header shows what was just picked
watch(livePosition, (current, previous) => {
	if (!previous || current.player !== previous.player) return;
	if (current.totalPicks < previous.totalPicks && !validPick.value) return jumpToLatest();
	const pickLanded = current.madePicks > previous.madePicks;
	if (!pickLanded && current.totalPicks <= previous.totalPicks) return;
	const wasFollowing = previous.totalPicks === 0 || pickIndex.value === previous.totalPicks - 1;
	if (wasFollowing) jumpToLatest();
	else if (pickLanded) ++unseenPicks.value;
});
watch(onLatestMadePick, (isLatest) => {
	if (isLatest) unseenPicks.value = 0;
});
watch(pick, (n, o) => {
	if (n < o) pickTransition.value = "right";
	else pickTransition.value = "left";
});
watch(pack, (newVal) => {
	if (newVal >= 0 && picksPerPack.value[newVal]) {
		pick.value = Math.min(pick.value, picksPerPack.value[newVal].length - 1); // Make sure pick is still valid.
	}
});

onMounted(() => {
	registerPlayerSelectEvents();
	document.addEventListener("keydown", shortcuts);
});
onBeforeUnmount(() => {
	clearPlayerSelectEvents();
	document.removeEventListener("keydown", shortcuts);
});
</script>

<style scoped>
.draft-log-live-title {
	display: flex;

	h2 {
		display: inline-block;
		margin: 0;
		margin-left: 1em;
		margin-right: 1em;
	}

	.pick-controls {
		text-wrap: nowrap;
	}

	:nth-last-child(2) {
		flex-grow: 2;
	}
}

@media (max-width: 1200px) {
	.draft-log-live-title {
		flex-wrap: wrap;
		flex-wrap: balance; /* Not supported in Firefox yet */
		justify-content: center;

		:nth-last-child(2) {
			flex-grow: unset;
		}
	}
}

@media (max-width: 700px) {
	.draft-log-live-title {
		flex-direction: column;
		gap: 0.25em;
		align-items: center;

		> h2 {
			display: block;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			margin: 0 0.25em;
			font-size: 1.25em;
		}
	}
}

.draft-log-live-instructions {
	text-align: center;
}

.jump-to-latest {
	margin-left: 0.4em;
}

.new-pick {
	color: #00da0b;
	animation: new-pick-pulse 1.5s ease-out;
}

@keyframes new-pick-pulse {
	0%,
	40% {
		transform: scale(1.5);
		filter: drop-shadow(#00da0b 0px 0px 6px);
	}
	100% {
		transform: scale(1);
		filter: none;
	}
}
</style>
