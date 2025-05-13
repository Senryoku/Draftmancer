<template>
	<div v-if="draftlog.version === '2.0' || draftlog.version === '2.1'">
		<div
			v-if="!draftlog.delayed"
			style="display: flex; justify-content: space-between; align-items: center; margin: 0.5em 1em"
		>
			<div>Click on a player to display more information.</div>
			<div>
				<button
					@click="reloadBoosters"
					v-tooltip="`Set 'Predetermined Boosters' to boosters from this game to replay it.`"
				>
					<font-awesome-icon :icon="['fas', 'rotate-left']" /> Reload Boosters
				</button>
				<button type="button" @click="exportBoosters" v-tooltip="'Export boosters to clipboard.'">
					<font-awesome-icon icon="fa-solid fa-clipboard-check"></font-awesome-icon> Export Boosters
				</button>
			</div>
		</div>
		<!-- Table -->
		<div>
			<ul
				:class="{
					'player-table': type === 'Draft' && tableSummary.length <= 8,
					'player-list-log': type !== 'Draft' || tableSummary.length > 8,
					six: type === 'Draft' && tableSummary.length === 6,
				}"
			>
				<li
					v-for="(log, index) of tableSummary"
					:key="index"
					class="player-button"
					:class="{
						clickable: log.userName !== '(empty)',
						disabled: log.userName === '(empty)',
						'selected-player': log.userID == displayOptions.detailsUserID,
						teama: type === 'Draft' && teamDraft && index % 2 === 0,
						teamb: type === 'Draft' && teamDraft && index % 2 === 1,
						self: userID === log.userID || userName === log.userName,
					}"
					@click="selectPlayer(log)"
				>
					<div>
						{{ log.userName }}
						<font-awesome-icon
							icon="fa-solid fa-clipboard-check"
							class="green"
							v-if="log.hasDeck"
							@click="displayOptions.category = 'Deck'"
							v-tooltip="`${log.userName} submitted their deck.`"
							style="margin: 0 0.5em"
						></font-awesome-icon>
					</div>
					<!-- Color Summary of the picks, explicitly hidden for other players if the details are supposed to be delayed (Don't leak it to the owner) -->
					<span class="color-list" v-if="(!draftlog.delayed || log.userID === userID) && log.colors">
						<img v-for="c in log.colors" :key="c" :src="'img/mana/' + c + '.svg'" class="mana-icon" />
					</span>
				</li>
			</ul>
		</div>

		<div v-if="draftlog.type === 'Silent Auction Draft' && draftlog.silentAuction">
			<div style="display: flex; align-items: center; gap: 1em; margin-left: 1em">
				<font-awesome-icon
					:class="{ disabled: displayOptions.pack <= 0 }"
					icon="fa-solid fa-chevron-left"
					class="clickable"
					@click="displayOptions.pack--"
				/>
				<label>Pack #</label>
				<select v-model="displayOptions.pack" style="width: 4em">
					<option v-for="index in draftlog.silentAuction.length" :key="index" :value="index - 1">
						{{ index }}
					</option>
				</select>
				<font-awesome-icon
					:class="{ disabled: displayOptions.pack >= draftlog.silentAuction.length - 1 }"
					icon="fa-solid fa-chevron-right"
					class="clickable"
					@click="displayOptions.pack++"
				/>
			</div>
			<div class="card-container pack">
				<div
					v-for="(card, idx) in draftlog.silentAuction[displayOptions.pack].state.currentPack"
					:key="card.uniqueID"
				>
					<div class="card-display">
						<Card :card="card" :language="language" :lazyLoad="false" />
						<div class="results">
							<div
								v-for="bid in draftlog.silentAuction[displayOptions.pack].results[idx].bids"
								:key="bid.userID"
								:class="{ winner: bid.won }"
							>
								<div class="name">{{ draftlog.users[bid.userID].userName }}</div>
								<div class="bid">
									{{ bid.bid }}
									<div class="currency-icon" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Cards of selected player -->
		<div v-if="validSelectedUser">
			<!-- Display the log if available (contains cards) and is not delayed or is personal, otherwise only display the deck hash -->
			<template
				v-if="
					(!draftlog.delayed || (draftlog.personalLogs && userID === selectedUser.userID)) &&
					selectedUser.cards?.length > 0
				"
			>
				<div class="section-title">
					<h2>{{ selectedUser.userName }}</h2>
					<div class="controls">
						<select
							v-model="displayOptions.category"
							@change="displayOptions.pack = displayOptions.pick = 0"
						>
							<option>Cards</option>
							<option v-if="picksPerPack.length > 0">Picks</option>
							<option
								v-if="
									picksPerPack.length > 0 &&
									picksPerPack[0].length > 0 &&
									'pick' in picksPerPack[0][0] &&
									'booster' in picksPerPack[0][0]
								"
							>
								Picks Summary
							</option>
							<option v-if="selectedLogDecklist !== undefined || displayOptions.category === 'Deck'">
								Deck
							</option>
						</select>
						<button @click="$emit('loadDeck', draftlog, selectedUser.userID)">
							<font-awesome-icon :icon="['fas', 'rotate-left']" /> Load Deck
						</button>
						<button
							@click="downloadMPT(selectedUser.userID)"
							v-tooltip="`Download ${selectedUser.userName} picks in MTGO draft log format.`"
							v-if="type === 'Draft'"
						>
							<font-awesome-icon icon="fa-solid fa-file-download"></font-awesome-icon> Download log in
							MTGO format
						</button>
						<button
							@click="submitToMPT(selectedUser.userID)"
							v-tooltip="
								`Submit ${selectedUser.userName}'s picks to MagicProTools and open it in a new tab.`
							"
							v-if="type === 'Draft'"
						>
							<font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon> Submit log to
							MagicProTools
						</button>
					</div>
				</div>

				<template v-if="displayOptions.category === 'Picks'">
					<template
						v-if="
							displayOptions.pack < picksPerPack.length &&
							displayOptions.pick < picksPerPack[displayOptions.pack].length
						"
					>
						<div style="display: flex; align-items: center; gap: 1em; margin-left: 1em">
							<div>
								<font-awesome-icon
									:class="{ disabled: displayOptions.pack <= 0 && displayOptions.pick <= 0 }"
									icon="fa-solid fa-chevron-left"
									class="clickable"
									@click="prevPick"
								></font-awesome-icon>
								<label>Pack #</label>
								<select v-model="displayOptions.pack" style="width: 4em">
									<option v-for="index in picksPerPack.length" :key="index" :value="index - 1">
										{{ index }}
									</option>
								</select>
								,
								<label>Pick #</label>
								<select v-model="displayOptions.pick" style="width: 4em">
									<option
										v-for="index in picksPerPack[displayOptions.pack].length"
										:key="index"
										:value="index - 1"
									>
										{{ index }}
									</option>
								</select>
								<font-awesome-icon
									:class="{
										disabled:
											displayOptions.pack >= picksPerPack.length - 1 &&
											displayOptions.pick >= picksPerPack[displayOptions.pack].length - 1,
									}"
									icon="fa-solid fa-chevron-right"
									class="clickable"
									@click="nextPick"
								></font-awesome-icon>
							</div>
							<h2>
								{{ pickTitle }}
							</h2>
						</div>
						<draft-log-pick
							:pick="draftPick"
							:carddata="draftlog.carddata"
							:language="language"
							:type="draftlog.type"
						/>
						<div
							v-if="
								selectedLogCardsUpToPick &&
								(selectedLogCardsUpToPick.main.length > 0 || selectedLogCardsUpToPick.side.length > 0)
							"
							style="display: flex"
						>
							<card-pool
								style="flex: 1 1 auto"
								:cards="selectedLogCardsUpToPick.main"
								:language="language"
								:readOnly="true"
								:group="`cardPool-${selectedUser.userID}-pack-${displayOptions.pack}-pick-${displayOptions.pick}`"
								:key="`cardPool-${selectedUser.userID}-pack-${displayOptions.pack}-pick-${displayOptions.pick}`"
							>
								<template v-slot:title>Cards ({{ selectedLogCardsUpToPick.main.length }})</template>
							</card-pool>
							<div v-if="selectedLogCardsUpToPick.side.length > 0" class="collapsed-sideboard">
								<div class="section-title">
									<h2>
										Sideboard
										<span style="font-size: 0.8em">
											({{ selectedLogCardsUpToPick.side.length }})
										</span>
									</h2>
								</div>
								<div class="card-container">
									<Sortable
										:key="`collapsed-sideboard-col-${selectedLogCardsUpToPick.side.map((c) => c.uniqueID).join('-')}`"
										class="card-column drag-column"
										:list="selectedLogCardsUpToPick.side"
										item-key="uniqueID"
										:options="{ animation: '200', ghostClass: 'ghost' }"
									>
										<template #item="{ element }">
											<card :card="element" :language="language"></card>
										</template>
									</Sortable>
								</div>
							</div>
						</div>
					</template>
					<template v-else><div class="log-container">No picks.</div></template>
				</template>
				<template v-else-if="displayOptions.category === 'Cards'">
					<div class="log-container">
						<card-pool
							:cards="selectedLogCards"
							:language="language"
							:readOnly="true"
							:group="`cardPool-${selectedUser.userID}`"
							:key="`cardPool-${selectedUser.userID}`"
						>
							<template v-slot:title>Cards ({{ selectedLogCards.length }})</template>
							<template v-slot:controls>
								<ExportDropdown :language="language" :deck="selectedLogCards" />
							</template>
						</card-pool>
					</div>
				</template>
				<template v-else-if="displayOptions.category === 'Deck'">
					<div class="log-container">
						<decklist
							:list="selectedLogDecklist"
							:username="selectedUser.userName"
							:carddata="draftlog.carddata"
							:language="language"
							:hashesonly="draftlog.delayed && (!draftlog.personalLogs || userID !== selectedUser.userID)"
						/>
					</div>
				</template>
				<template v-else-if="displayOptions.category === 'Picks Summary'">
					<div class="log-container">
						<draft-log-picks-summary
							:picks="picksPerPack as DraftPick[][]"
							:carddata="draftlog.carddata"
							:language="language"
							@selectPick="
								(pack: number, pick: number) => {
									displayOptions.pack = pack;
									displayOptions.pick = pick;
									displayOptions.category = 'Picks';
								}
							"
						/>
					</div>
				</template>
			</template>
			<template v-else>
				<decklist
					:list="selectedLogDecklist"
					:username="selectedUser.userName"
					:carddata="draftlog.carddata"
					:language="language"
					:hashesonly="true"
				/>
			</template>
		</div>
	</div>
	<div v-else>
		<h2>Incompatible draft log version</h2>
	</div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
	DraftLog,
	DraftLogUserData,
	DraftPick,
	DeprecatedDraftPick,
	GridDraftPick,
	WinstonDraftPick,
	WinchesterDraftPick,
	HousmanDraftPick,
} from "@/DraftLog";
import { UserID } from "@/IDTypes";

import * as helper from "../helper";
import { fireToast } from "../alerts";

import Card from "./Card.vue";
import CardPool from "./CardPool.vue";
import Decklist from "./Decklist.vue";
import DraftLogPick from "./DraftLogPick.vue";
import DraftLogPicksSummary from "./DraftLogPicksSummary.vue";
import ExportDropdown from "./ExportDropdown.vue";
import { Sortable } from "sortablejs-vue3";
import { CardColor, CardID, UniqueCard } from "@/CardTypes";
import { Language } from "@/Types";

type PlayerSummary = {
	userID: UserID;
	userName: string;
	hasDeck: boolean;
	colors: CardColor[];
};

let uniqueID = 0;

export default defineComponent({
	name: "DraftLog",
	components: { Card, CardPool, DraftLogPick, DraftLogPicksSummary, Decklist, ExportDropdown, Sortable },
	props: {
		draftlog: { type: Object as PropType<DraftLog>, required: true },
		language: { type: String as PropType<Language>, required: true },
		userID: { type: String as PropType<UserID>, required: true },
		userName: { type: String },
	},
	data() {
		const displayOptions: {
			detailsUserID?: UserID;
			category: string;
			textList: boolean;
			pack: number;
			pick: number;
		} = {
			detailsUserID: undefined,
			category: "Cards",
			textList: false,
			pack: 0,
			pick: 0,
		};
		return {
			displayOptions,
		};
	},
	mounted() {
		if (this.draftlog && this.draftlog.users) {
			const userIDs = Object.keys(this.draftlog.users);
			if (userIDs.length > 0) {
				this.displayOptions.detailsUserID = userIDs[0]; // Fallback to the first player in the list
				// Tries to display the user's picks by default, checking by ID then username
				if (userIDs.includes(this.userID)) this.displayOptions.detailsUserID = this.userID;
				else
					for (let uid of userIDs)
						if (this.draftlog.users[uid].userName === this.userName)
							this.displayOptions.detailsUserID = uid;
				// Defaults to deck display if available
				if (
					this.displayOptions.detailsUserID &&
					this.hasSubmittedDeck(this.draftlog.users[this.displayOptions.detailsUserID]) &&
					((this.draftlog.users[this.displayOptions.detailsUserID].decklist?.main?.length ?? 0) > 0 ||
						(this.draftlog.users[this.displayOptions.detailsUserID].decklist?.side?.length ?? 0) > 0)
				)
					this.displayOptions.category = "Deck";
			}
		}
	},
	methods: {
		boosterStr() {
			return this.draftlog.boosters
				.map((b) =>
					b
						.map(
							(c) =>
								`${this.draftlog.carddata[c].name} (${this.draftlog.carddata[c].set}) ${this.draftlog.carddata[c].collector_number}`
						)
						.join("\n")
				)
				.join("\n\n");
		},
		reloadBoosters() {
			this.$emit("reloadBoosters", this.boosterStr());
		},
		exportBoosters() {
			helper.copyToClipboard(this.boosterStr());
			fireToast("success", "Boosters copied to clipboard");
		},
		downloadMPT(id: UserID) {
			helper.download(`DraftLog_${id}.txt`, helper.exportToMagicProTools(this.draftlog, id));
		},
		submitToMPT(id: UserID) {
			fetch("https://magicprotools.com/api/draft/add", {
				credentials: "omit",
				headers: {
					Accept: "application/json, text/plain, */*",
					"Content-Type": "application/x-www-form-urlencoded",
				},
				referrer: "https://draftmancer.com",
				body: `draft=${encodeURIComponent(
					helper.exportToMagicProTools(this.draftlog, id, true)
				)}&apiKey=yitaOuTvlngqlKutnKKfNA&platform=mtgadraft`,
				method: "POST",
				mode: "cors",
			}).then((response) => {
				if (response.status !== 200) {
					fireToast("error", "An error occured submiting log to MagicProTools.");
				} else {
					response.json().then((json) => {
						if (json.error) {
							fireToast("error", `Error: ${json.error}.`);
						} else {
							if (json.url) {
								helper.copyToClipboard(json.url);
								fireToast("success", "MagicProTools URL copied to clipboard.");
								window.open(json.url, "_blank");
							} else {
								fireToast("error", "An error occured submiting log to MagicProTools.");
							}
						}
					});
				}
			});
		},
		colorsInCardList(cardIDs: CardID[]): { W: number; U: number; B: number; R: number; G: number } {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			if (!cardIDs) return r;
			for (let cid of cardIDs) for (let color of this.draftlog.carddata[cid].colors) r[color as CardColor] += 1;
			return r;
		},
		prevPick() {
			if (this.displayOptions.pick === 0) {
				if (this.displayOptions.pack === 0) return;
				--this.displayOptions.pack;
				this.displayOptions.pick = this.picksPerPack[this.displayOptions.pack].length - 1;
			} else {
				--this.displayOptions.pick;
			}
		},
		nextPick() {
			if (this.displayOptions.pick === this.picksPerPack[this.displayOptions.pack].length - 1) {
				if (this.displayOptions.pack === this.picksPerPack.length - 1) return;
				++this.displayOptions.pack;
				this.displayOptions.pick = 0;
			} else {
				++this.displayOptions.pick;
			}
		},
		hasSubmittedDeck(log: DraftLogUserData): boolean {
			return (
				log?.decklist !== undefined &&
				(log.decklist.main?.length > 0 || log.decklist.side?.length > 0 || log.decklist.hashes !== undefined)
			);
		},
		selectPlayer(userLogSummary: PlayerSummary) {
			if (userLogSummary.userName !== "(empty)") {
				this.displayOptions.detailsUserID = userLogSummary.userID;
				if (userLogSummary.hasDeck) {
					if (this.displayOptions.category === "Cards") this.displayOptions.category = "Deck";
				} else {
					if (this.displayOptions.category === "Deck") this.displayOptions.category = "Cards";
				}
				this.$nextTick(() => {
					this.displayOptions.pack = Math.min(this.displayOptions.pack, this.picksPerPack.length - 1);
					this.displayOptions.pick = Math.min(
						this.displayOptions.pick,
						(this.picksPerPack[this.displayOptions.pack]?.length ?? 0) - 1
					);
				});
			}
		},
	},
	computed: {
		type() {
			return this.draftlog.type ? this.draftlog.type : "Draft";
		},
		validSelectedUser(): boolean {
			return (
				this.displayOptions.detailsUserID !== undefined &&
				this.displayOptions.detailsUserID in this.draftlog.users
			);
		},
		selectedUser(): DraftLogUserData {
			return this.draftlog.users[this.displayOptions.detailsUserID!];
		},
		selectedLogCardsUpToPick(): { main: UniqueCard[]; side: UniqueCard[] } | null {
			switch (this.type) {
				default:
					return null;
				case "Draft": {
					const cards: UniqueCard[] = [];
					const add = (pick: DraftPick) => {
						for (const index of pick.pick)
							cards.push(
								Object.assign({ uniqueID: ++uniqueID }, this.draftlog.carddata[pick.booster[index]])
							);
					};
					// Previous packs
					for (let pack = 0; pack < Math.min(this.picksPerPack.length, this.displayOptions.pack); ++pack)
						for (const pick of this.picksPerPack[pack]) add(pick as DraftPick);
					// Current pack, up to the currently displayed pick.
					const picksInCurrentPack = Math.min(
						this.picksPerPack[this.displayOptions.pack].length,
						this.displayOptions.pick
					);
					for (let pick = 0; pick < picksInCurrentPack; ++pick)
						add(this.picksPerPack[this.displayOptions.pack][pick] as DraftPick);

					const r: { main: UniqueCard[]; side: UniqueCard[] } = { main: [], side: [] };
					if (this.selectedUser.decklist) {
						for (const cid of this.selectedUser.decklist.main) {
							const card_idx = cards.findIndex((c) => c.id === cid);
							if (card_idx >= 0) {
								r.main.push(cards[card_idx]);
								cards.splice(card_idx, 1);
							}
						}
						for (const cid of this.selectedUser.decklist.side) {
							const card_idx = cards.findIndex((c) => c.id === cid);
							if (card_idx >= 0) {
								r.side.push(cards[card_idx]);
								cards.splice(card_idx, 1);
							}
						}
						if (cards.length > 0) {
							console.error(
								"selectedLogCardsUpToPick: Some were not assigned to either main or sideboard. Weird.",
								this.selectedUser.decklist,
								cards
							);
							r.main.push(...cards);
						}
					} else r.main = cards;

					console.log(r);
					return r;
				}
			}
		},
		selectedLogCards(): UniqueCard[] {
			return this.selectedUser.cards.map((cid: CardID) =>
				Object.assign({ uniqueID: ++uniqueID }, this.draftlog.carddata[cid])
			);
		},
		selectedLogDecklist() {
			if (!this.validSelectedUser || !this.hasSubmittedDeck(this.selectedUser)) return undefined;
			return this.selectedUser.decklist;
		},
		tableSummary(): PlayerSummary[] {
			// Aggregate information about each player
			let tableSummary: PlayerSummary[] = [];
			for (let userID in this.draftlog.users) {
				const colorCount =
					(this.draftlog.users[userID].decklist?.main?.length ?? 0) > 0
						? this.colorsInCardList(this.draftlog.users[userID].decklist?.main ?? [])
						: this.type === "Draft"
							? this.colorsInCardList(this.draftlog.users[userID].cards)
							: { W: 0, U: 0, B: 0, R: 0, G: 0 };
				tableSummary.push({
					userID: userID,
					userName: this.draftlog.users[userID].userName,
					hasDeck: this.hasSubmittedDeck(this.draftlog.users[userID]),
					colors: Object.keys(colorCount).filter((c) => colorCount[c as CardColor] >= 10) as CardColor[],
				});
			}
			// Add empty seats to better visualize the draft table
			while ((this.type === "Draft" && tableSummary.length < 6) || tableSummary.length === 7)
				tableSummary.push({
					userID: "none",
					userName: "(empty)",
					hasDeck: false,
					colors: [],
				});
			return tableSummary;
		},
		teamDraft() {
			return this.draftlog.teamDraft;
		},
		picksPerPack(): (DraftPick | GridDraftPick | WinstonDraftPick | WinchesterDraftPick | HousmanDraftPick)[][] {
			if (!this.validSelectedUser || !this.selectedUser.picks || this.selectedUser.picks.length === 0) return [];
			switch (this.type) {
				default:
					return [];
				case "Rochester Draft": // Intended Fallthrough
				case "Draft": {
					if (this.draftlog.version === "2.0") {
						// Infer PackNumber & PickNumber
						let r: DraftPick[][] = [];
						let lastSize = 0;
						let currPickNumber = 0;
						let currBooster = -1;
						for (let currPick = 0; currPick < this.selectedUser.picks.length; ++currPick) {
							const p = this.selectedUser.picks[currPick] as DeprecatedDraftPick;
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
						}
						return r;
					} else {
						// Version >= 2.1
						return helper.groupPicksPerPack(this.selectedUser.picks as DraftPick[]);
					}
				}
				case "Grid Draft": {
					let packNum = 0;
					return this.selectedUser.picks.map((p) => {
						const gp = p as GridDraftPick;
						return [
							{
								packNum: packNum++,
								pickNum: 0,
								pick: gp.pick,
								burn: gp.burn,
								booster: gp.booster,
							},
						];
					});
				}
				case "Winston Draft":
					return [this.selectedUser.picks as WinstonDraftPick[]];
				case "Winchester Draft":
					return [this.selectedUser.picks as WinchesterDraftPick[]];
				case "Solomon Draft":
					return [this.selectedUser.picks as WinchesterDraftPick[]];
				case "Housman Draft": {
					const r: HousmanDraftPick[][] = [];
					let lastRoundNum = -1;
					for (const p of this.selectedUser.picks as HousmanDraftPick[]) {
						if (p.round !== lastRoundNum) {
							lastRoundNum = p.round;
							r.push([]);
						}
						r[r.length - 1].push(p);
					}
					return r;
				}
			}
		},
		draftPick() {
			return this.picksPerPack[this.displayOptions.pack][this.displayOptions.pick];
		},
		pickTitle() {
			// Winston Draft, and other pile based modes
			if ("piles" in this.draftPick) {
				if ("randomCard" in this.draftPick) return this.draftlog.carddata[this.draftPick.randomCard].name;
				return `Pile #${this.draftPick.pickedPile + 1}`;
			}
			// Housman Draft
			if ("revealedCards" in this.draftPick)
				return this.draftlog.carddata[this.draftPick.revealedCards[this.draftPick.picked]].name;
			const p = this.draftPick;
			return p.pick
				.map((idx: number) => (p.booster[idx] ? this.draftlog.carddata[p.booster[idx]!].name : null))
				.filter((n) => n !== null)
				.join(", ");
		},
	},
	watch: {
		draftlog: {
			deep: true,
			immediate: true,
			handler() {
				// Displayed log defaults to first player
				if (
					this.draftlog &&
					this.draftlog.users &&
					Object.keys(this.draftlog.users)[0] &&
					(!this.displayOptions.detailsUserID || !this.draftlog.users[this.displayOptions.detailsUserID])
				)
					this.displayOptions.detailsUserID = Object.keys(this.draftlog.users)[0];
			},
		},
		displayOptions: {
			deep: true,
			immediate: true,
			handler() {
				if (this.picksPerPack.length > this.displayOptions.pack)
					this.displayOptions.pick = Math.min(
						this.displayOptions.pick,
						(this.picksPerPack[this.displayOptions.pack]?.length ?? 0) - 1
					); // Make sure pick is still valid.
			},
		},
	},
});
</script>

<style scoped>
.log-container {
	background-color: #282828;
	border-radius: 10px;
	box-shadow: inset 0 0 8px #383838;
	padding: 0.5em;
}

.mana-icon {
	vertical-align: sub;
}

ul.player-list-log,
ul.player-table {
	display: flex;
	flex-wrap: wrap;
	list-style: none;
	margin: 0.5rem;
	--half-gap: 1rem;
	gap: calc(2 * var(--half-gap));
	--halflength: 4;
}
ul.player-table.six {
	--halflength: 3;
}

ul.player-list-log li,
ul.player-table li {
	display: inline-flex;
	justify-content: space-between;

	border: 1px solid #282828;
	padding: 0.5em;
	border-radius: 0.2em;
	background-color: #555;
}

ul.player-table li {
	width: calc(100% / var(--halflength) - 1% - 2 * var(--half-gap) - 1em);
	max-width: calc(100% / var(--halflength) - 1% - 2 * var(--half-gap) - 1em);
	position: relative;
}

ul.player-list-log > li {
	margin-right: 0.75em;
}

.color-list > img {
	margin-left: 0.25em;
	margin-right: 0.25em;
}

ul.player-table li:nth-child(1) {
	order: 1;
}
ul.player-table li:nth-child(2) {
	order: 2;
}
ul.player-table li:nth-child(3) {
	order: 3;
}
ul.player-table li:nth-child(4) {
	order: 4;
}
ul.player-table li:nth-child(5) {
	order: 8;
}
ul.player-table li:nth-child(6) {
	order: 7;
}
ul.player-table li:nth-child(7) {
	order: 6;
}
ul.player-table li:nth-child(8) {
	order: 5;
}

ul.player-table.six li:nth-child(4) {
	order: 6;
}
ul.player-table.six li:nth-child(5) {
	order: 5;
}
ul.player-table.six li:nth-child(6) {
	order: 4;
}

ul.player-table li:nth-child(6):after,
ul.player-table li:nth-child(7):after,
ul.player-table li:nth-child(8):after,
ul.player-table.six li:nth-child(5):after,
ul.player-table.six li:nth-child(6):after {
	position: absolute;
	top: 0;
	right: calc(-2rem + 1px);
	font-family: "Mini Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100"; /* << */
}

ul.player-table li:nth-child(2):after,
ul.player-table li:nth-child(3):after,
ul.player-table li:nth-child(4):after,
ul.player-table.six li:nth-child(2):after,
ul.player-table.six li:nth-child(3):after {
	position: absolute;
	top: 0;
	left: calc(-2rem + 1px);
	font-family: "Mini Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f101"; /* >> */
}

ul.player-table li:nth-child(5):before,
ul.player-table.six li:nth-child(4):before {
	position: absolute;
	top: calc(-2rem - 2px);
	left: calc(50%);
	font-family: "Mini Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100";
	transform: translateX(-50%) rotate(-90deg);
}

ul.player-table li:nth-child(1):before,
ul.player-table.six li:nth-child(1):before {
	position: absolute;
	bottom: calc(-2rem - 2px);
	left: calc(50%);
	font-family: "Mini Font Awesome 5 Free";
	font-weight: 900;
	font-size: 2rem;
	content: "\f100";
	transform: translateX(-50%) rotate(90deg);
}

ul.player-table.six li:nth-child(4):after,
ul.player-table.six li:nth-child(5):before {
	content: "";
}

.player-button.selected-player {
	box-shadow: inset 0px 0px 8px 2px rgb(99, 101, 149);
	background-color: #666;
}

.player-button.self {
	background-color: #505056;
}

.player-button.selected-player {
	background-color: #606068;
}

.player-button.clickable:not(.selected-player) {
	box-shadow:
		inset 2px 2px 2px 0px rgba(255, 255, 255, 0.2),
		inset -2px -2px 2px 0px rgba(0, 0, 0, 0.2);
}

.player-button.clickable:not(.selected-player):hover {
	background-color: #585858;
	color: white;
}

.player-button.clickable:not(.selected-player):active {
	box-shadow:
		inset 2px 2px 2px 0px rgba(0, 0, 0, 0.2),
		inset -2px -2px 2px 0px rgba(255, 255, 255, 0.2);
}
</style>

<style scoped src="../css/silentAuction.css" />
