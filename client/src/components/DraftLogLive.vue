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

<script lang="ts">
import { defineComponent, PropType } from "vue";
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

let uniqueID = 0;
const genUniqueCard = (card: Card): UniqueCard => Object.assign({ uniqueID: ++uniqueID }, card);

export default defineComponent({
	name: "DraftLogLive",
	components: { DraftLogPick, CardComponent, CardPool, ScaleSlider, Sortable },
	props: {
		show: { type: Boolean, default: true },
		draftlog: { type: Object as PropType<DraftLog>, required: true },
		pendingPicks: { type: Object as PropType<Record<UserID, DraftPick>>, default: () => ({}) },
		language: { type: String as PropType<Language>, required: true },
	},
	data() {
		return {
			sortableUpdate,
			player: undefined as UserID | undefined,
			pack: 0,
			pick: 0,
			eventListeners: [] as { element: HTMLElement; callback: () => void }[],
			pickTransition: "right",
			cardScale: 1,
			unseenPicks: 0,
		};
	},
	mounted() {
		this.registerPlayerSelectEvents();

		document.addEventListener("keydown", this.shortcuts);
	},
	beforeUnmount() {
		this.clearPlayerSelectEvents();

		document.removeEventListener("keydown", this.shortcuts);
	},
	methods: {
		getCard(cid: CardID) {
			return this.draftlog.carddata[cid];
		},
		getCardName(cid: CardID) {
			const c = this.getCard(cid);
			return this.language in c.printed_names ? c.printed_names[this.language] : c.name;
		},
		setPlayer(userID: UserID) {
			if (!(userID in this.draftlog.users)) return;
			this.player = userID;

			this.pack = 0;
			this.pick = 0;
			this.unseenPicks = 0;
			// Get to the last pick once computed values are updated.
			this.$nextTick(this.jumpToLatest);
		},
		jumpToLatest() {
			if (this.picksPerPack.length === 0) return;
			this.pack = this.picksPerPack.length - 1;
			this.pick = this.picksPerPack[this.pack].length - 1;
		},
		prevPick() {
			if (this.pick === 0) {
				if (this.pack === 0) return;
				--this.pack;
				this.pick = this.picksPerPack[this.pack].length - 1;
			} else {
				--this.pick;
			}
		},
		nextPick() {
			if (this.pick === this.picksPerPack[this.pack].length - 1) {
				if (this.pack === this.picksPerPack.length - 1) return;
				++this.pack;
				this.pick = 0;
			} else {
				++this.pick;
			}
		},
		shortcuts(e: KeyboardEvent) {
			if (e.key === "ArrowLeft") {
				this.prevPick();
				e.preventDefault();
			} else if (e.key === "ArrowRight") {
				this.nextPick();
				e.preventDefault();
			}
		},
		registerPlayerSelectEvents() {
			this.clearPlayerSelectEvents();
			const playerEls = document.querySelectorAll<HTMLElement>("ul.player-list li");
			for (let el of playerEls) {
				const callback = () => {
					const id = el.dataset.userid;
					this.setPlayer(id!);
				};
				this.eventListeners.push({ element: el, callback: callback });
				el.classList.add("clickable");
				el.addEventListener("click", callback);
			}
		},
		clearPlayerSelectEvents() {
			for (let tuple of this.eventListeners) {
				tuple.element.removeEventListener("click", tuple.callback);
				tuple.element.classList.remove("clickable");
			}
			this.eventListeners = [];
		},
	},
	computed: {
		pickNames() {
			if (this.picksPerPack.length === 0 || !this.validPick) return "";
			const pick = this.picksPerPack[this.pack][this.pick];
			if (pick.pick.length === 0) return "Picking...";
			return pick.pick
				.map((idx) => pick.booster[idx])
				.map(this.getCardName)
				.join(", ");
		},
		selectedPlayerCards() {
			if (this.draftlog.users?.[this.player!]?.decklist?.main)
				return {
					main: this.draftlog.users[this.player!].decklist!.main.map(this.getCard).map(genUniqueCard),
					side: this.draftlog.users[this.player!].decklist!.side.map(this.getCard).map(genUniqueCard),
				};
			return {
				main: (this.draftlog.users[this.player!].picks as DraftPick[])
					.map((p: DraftPick) => p.pick.map((idx) => p.booster[idx]))
					.flat()
					.map(this.getCard)
					.map(genUniqueCard),
				side: [],
			};
		},
		selectedLog() {
			return this.draftlog.users[this.player!];
		},
		picksPerPack() {
			if (!this.selectedLog || !this.selectedLog.picks || this.draftlog.type !== "Draft") return [];
			if (this.draftlog.version === "2.0") {
				// Infer PackNumber & PickNumber
				let r: DraftPick[][] = [];
				let currPick = 0;
				let currBooster = -1;
				let lastSize = 0;
				let currPickNumber = 0;
				while (currPick < this.selectedLog.picks.length) {
					const p = this.selectedLog.picks[currPick] as DeprecatedDraftPick;
					if (p.booster.length > lastSize) {
						++currBooster;
						currPickNumber = 0;
						r.push([]);
					} else ++currPickNumber;
					r[currBooster].push({
						packNum: currBooster,
						pickNum: currPickNumber,
						pick: p.pick,
						burn: p.burn,
						booster: p.booster,
					});
					lastSize = p.booster.length;
					++currPick;
				}
				return r;
			}
			const picks = this.selectedLog.picks as DraftPick[];
			const pendingPick = this.pendingPicks[this.player!];
			return groupPicksPerPack(pendingPick ? [...picks, pendingPick] : picks);
		},
		validPick() {
			return this.pack < this.picksPerPack.length && this.pick < this.picksPerPack[this.pack].length;
		},
		pickIndex() {
			let index = this.pick;
			for (let p = 0; p < this.pack && p < this.picksPerPack.length; ++p) index += this.picksPerPack[p].length;
			return index;
		},
		totalPicks() {
			let total = 0;
			for (const packPicks of this.picksPerPack) total += packPicks.length;
			return total;
		},
		madePicks() {
			return this.selectedLog?.picks?.length ?? 0;
		},
		previousPickNames() {
			if (!this.validPick) return "";
			const onPendingPick = this.picksPerPack[this.pack][this.pick].pick.length === 0;
			if (!onPendingPick) return "";
			return this.lastMadePickCardIDs.map(this.getCardName).join(", ");
		},
		lastMadePickCardIDs() {
			const picks = (this.selectedLog?.picks ?? []) as DraftPick[];
			const lastPick = picks[picks.length - 1];
			if (!lastPick) return [];
			return lastPick.pick.map((idx) => lastPick.booster[idx]);
		},
		onLatestPick() {
			return this.pickIndex === this.totalPicks - 1;
		},
		onLatestMadePick() {
			return this.pickIndex >= this.madePicks - 1;
		},
		hasUnseenPicks() {
			return this.unseenPicks > 0 && !this.onLatestMadePick;
		},
		livePosition() {
			return { player: this.player, totalPicks: this.totalPicks, madePicks: this.madePicks };
		},
	},
	watch: {
		// A following viewer moves to the booster being picked from, the header shows what was just picked
		livePosition(current, previous) {
			if (current.player !== previous.player) return;
			if (current.totalPicks < previous.totalPicks && !this.validPick) return this.jumpToLatest();
			const pickLanded = current.madePicks > previous.madePicks;
			if (!pickLanded && current.totalPicks <= previous.totalPicks) return;
			const wasFollowing = previous.totalPicks === 0 || this.pickIndex === previous.totalPicks - 1;
			if (wasFollowing) this.jumpToLatest();
			else if (pickLanded) ++this.unseenPicks;
		},
		onLatestMadePick(isLatest) {
			if (isLatest) this.unseenPicks = 0;
		},
		pick(n, o) {
			if (n < o) this.pickTransition = "right";
			else this.pickTransition = "left";
		},
		pack(newVal) {
			this.pick = Math.min(this.pick, this.picksPerPack[newVal].length - 1); // Make sure pick is still valid.
		},
	},
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
