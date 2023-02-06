<template>
	<div>
		<template v-if="show">
			<div v-if="player in draftlog.users">
				<div class="draft-log-live-title">
					<h2>Live Review: {{ draftlog.users[player].userName }}</h2>
					<span v-if="player in draftlog.users && draftlog.users[player].picks.length > 0">
						<i
							:class="{ disabled: pack <= 0 && pick <= 0 }"
							class="fas fa-chevron-left clickable"
							@click="prevPick"
						></i>
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
						<i
							:class="{
								disabled: pack >= picksPerPack.length - 1 && pick >= picksPerPack[pack].length - 1,
							}"
							class="fas fa-chevron-right clickable"
							@click="nextPick"
						></i>
						<h2>{{ pickNames }}</h2>
						<scale-slider v-model.number="cardScale" style="float: right" />
					</span>
				</div>
				<template v-if="draftlog.users[player].picks.length === 0">
					<p>Waiting for {{ draftlog.users[player].userName }} to make their first pick...</p>
				</template>
				<template v-else>
					<div v-if="validPick">
						<transition :name="'slide-fade-' + pickTransition" mode="out-in">
							<draft-log-pick
								:key="`${player}-${pick}`"
								:pick="picksPerPack[pack][pick].data"
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
									<draggable
										:key="`side_col`"
										class="card-column drag-column"
										:list="selectedPlayerCards.side"
										:group="`side-${player}`"
										:animation="200"
									>
										<card
											v-for="card in selectedPlayerCards.side"
											:key="`side_card_${card.uniqueID}`"
											:card="card"
											:language="language"
										></card>
									</draggable>
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

<script>
import DraftLogPick from "./DraftLogPick.vue";
import CardPool from "./CardPool.vue";
import Card from "./Card.vue";
import ScaleSlider from "./ScaleSlider.vue";
import draggable from "vuedraggable";

export default {
	name: "DraftLogLive",
	components: { DraftLogPick, draggable, Card, CardPool, ScaleSlider },
	props: {
		show: { type: Boolean, default: true },
		draftlog: { type: Object, required: true },
		language: { type: String, required: true },
	},
	data() {
		return {
			player: undefined,
			pack: 0,
			pick: 0,
			eventListeners: [],
			pickTransition: "right",
			uniqueID: 0,
			cardScale: 1,
		};
	},
	mounted() {
		this.registerPlayerSelectEvents();

		document.addEventListener("keydown", this.shortcuts);
	},
	beforeDestroy() {
		this.clearPlayerSelectEvents();

		document.removeEventListener("keydown", this.shortcuts);
	},
	methods: {
		getCardName(cid) {
			return this.language in this.draftlog.carddata[cid].printed_names
				? this.draftlog.carddata[cid].printed_names[this.language]
				: this.draftlog.carddata[cid].name;
		},
		setPlayer(userID) {
			if (!(userID in this.draftlog.users)) return;
			this.player = userID;

			this.pack = 0;
			this.pick = 0;
			// Get to the last pick once computed values are updated.
			if (this.picksPerPack.length > 0)
				this.$nextTick(() => {
					this.pack = this.picksPerPack.length - 1;
					this.pick = this.picksPerPack[this.pack].length - 1;
				});
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
		newPick(data) {
			// Skip to last pick if we're spectating this player
			if (data.userID === this.player) {
				this.pack = this.picksPerPack.length - 1;
				this.pick = this.picksPerPack[this.pack].length - 1;
			}
		},
		generateCardArray(cardIDs) {
			return cardIDs.map((cid) => Object.assign({ uniqueID: ++this.uniqueID }, this.draftlog.carddata[cid]));
		},
		shortcuts(e) {
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
			const self = this;
			const playerEls = document.querySelectorAll("ul.player-list li");
			for (let el of playerEls) {
				const callback = () => {
					const id = el.dataset.userid;
					self.setPlayer(id);
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
			const pick = this.picksPerPack[this.pack][this.pick].data;
			return pick.pick
				.map((idx) => pick.booster[idx])
				.map(this.getCardName)
				.join(", ");
		},
		selectedPlayerCards() {
			if (this.draftlog.users?.[this.player]?.decklist?.main)
				return {
					main: this.generateCardArray(this.draftlog.users[this.player].decklist.main),
					side: this.generateCardArray(this.draftlog.users[this.player].decklist.side),
				};
			return {
				main: this.generateCardArray(
					this.draftlog.users[this.player].picks.map((p) => p.pick.map((idx) => p.booster[idx])).flat()
				),
				side: [],
			};
		},
		selectedLog() {
			return this.draftlog.users[this.player];
		},
		picksPerPack() {
			if (
				!this.selectedLog ||
				!this.selectedLog.picks ||
				this.selectedLog.picks.length === 0 ||
				this.draftlog.type !== "Draft"
			)
				return [];
			// Infer PackNumber & PickNumber
			let r = [];
			let currPick = 0;
			let currBooster = -1;
			let lastSize = 0;
			let currPickNumber = 0;
			while (currPick < this.selectedLog.picks.length) {
				if (this.selectedLog.picks[currPick].booster.length > lastSize) {
					++currBooster;
					currPickNumber = 0;
					r.push([]);
				} else ++currPickNumber;
				r[currBooster].push({
					key: currPick,
					data: this.selectedLog.picks[currPick],
					packNumber: currBooster,
					pickNumber: currPickNumber,
				});
				lastSize = this.selectedLog.picks[currPick].booster.length;
				++currPick;
			}
			return r;
		},
		validPick() {
			return this.pack < this.picksPerPack.length && this.pick < this.picksPerPack[this.pack].length;
		},
	},
	watch: {
		pick(n, o) {
			if (n < o) this.pickTransition = "right";
			else this.pickTransition = "left";
		},
		pack(newVal) {
			this.pick = Math.min(this.pick, this.picksPerPack[newVal].length - 1); // Make sure pick is still valid.
		},
	},
};
</script>

<style scoped>
.draft-log-live-title h2 {
	display: inline-block;
	margin: 0;
	margin-left: 1em;
	margin-right: 1em;
}

.draft-log-live-instructions {
	text-align: center;
}
</style>
