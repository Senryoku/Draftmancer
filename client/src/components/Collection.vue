<template>
	<div v-if="collectionStats" style="position: relative">
		<div style="display: flex; justify-content: space-between">
			<div>
				Select set:
				<select v-model="selectedSetCode">
					<option
						v-for="set in ['all', 'standard', 'others']"
						:key="collectionStats[set].code"
						:value="collectionStats[set].code"
					>
						{{ collectionStats[set].fullName }}
					</option>
					<option style="color: #888" disabled>————————————————</option>
					<option v-for="set in sets" :key="collectionStats[set].code" :value="collectionStats[set].code">
						{{ collectionStats[set].fullName }}
					</option>
				</select>
			</div>
			<div>
				<input
					type="checkbox"
					@change="updateDisplayCollectionStatus"
					:checked="displaycollectionstatus"
					id="display-collection-status"
				/><label for="display-collection-status">Highlight required wildcards in games</label>
			</div>
		</div>
		<div class="resources">
			<h3>Resources</h3>
			<table style="margin: auto">
				<tr v-for="(value, rarity) in collectionInfos.wildcards" :key="rarity">
					<td><img class="wildcard-icon" :src="`img/wc_${rarity}.webp`" /></td>
					<td>{{ value }}</td>
				</tr>
				<tr
					v-if="collectionInfos.vaultProgress"
					v-tooltip.left="
						'Vault Progress. For every 100% you\'ll receive 1 mythic, 2 rare and 3 uncommon wildcards when opened.'
					"
				>
					<td><img src="../assets/img/vault.png" style="height: 1rem" /></td>
					<td>{{ collectionInfos.vaultProgress }}%</td>
				</tr>
			</table>
		</div>
		<div class="set-stats">
			<div v-if="selectedSet">
				<table>
					<caption>
						<img
							v-if="selectedSet.icon"
							:src="selectedSet.icon"
							class="set-icon"
							style="--invertedness: 100%"
						/>
						{{
							selectedSet.fullName
						}}
					</caption>
					<tr>
						<th>Rarity</th>
						<th>Unique</th>
						<th>Total</th>
						<th>Total Missing</th>
						<th>Unique (Booster)</th>
						<th>Total (Booster)</th>
						<th>Missing From Boosters</th>
					</tr>
					<tr v-for="r in ['common', 'uncommon', 'rare', 'mythic', 'all']" :key="r">
						<td style="text-transform: capitalize">{{ r }}</td>
						<td>{{ selectedSet.ownedUnique[r] }} / {{ selectedSet.total[r] }}</td>
						<td>{{ selectedSet.owned[r] }} / {{ 4 * selectedSet.total[r] }}</td>
						<td>{{ 4 * selectedSet.total[r] - selectedSet.owned[r] }}</td>
						<td>{{ selectedSet.inBoosters.ownedUnique[r] }} / {{ selectedSet.inBoosters.total[r] }}</td>
						<td>{{ selectedSet.inBoosters.owned[r] }} / {{ 4 * selectedSet.inBoosters.total[r] }}</td>
						<td>{{ 4 * selectedSet.inBoosters.total[r] - selectedSet.inBoosters.owned[r] }}</td>
					</tr>
				</table>

				<h3>
					Missing
					<select v-model="missingCardsRarity">
						<option value="common">Commons</option>
						<option value="uncommon">Uncommons</option>
						<option value="rare">Rares</option>
						<option value="mythic">Mythics</option>
					</select>
					<input type="checkbox" id="show-non-booster" v-model="showNonBooster" />
					<label for="show-non-booster">Show non-booster cards</label>
				</h3>
				<div class="card-container">
					<missing-card
						v-for="card in missingCards"
						:key="card.arena_id"
						:card="card"
						:language="language"
					></missing-card>
				</div>
			</div>
		</div>
	</div>
	<div v-else>Collection statistics not available.</div>
</template>

<script lang="ts">
import { Language, SetCode } from "@/Types";
import { defineComponent, PropType } from "vue";
import { Card, PlainCollection } from "@/CardTypes";
import MTGACards from "../MTGACards";
import Constants from "../../../src/Constants";
import SetsInfos from "../SetInfos";
import MissingCard from "./MissingCard.vue";

type CardWithCount = Card & { count: number };
class StatsByRarity {
	all: number = 0;
	common: number = 0;
	uncommon: number = 0;
	rare: number = 0;
	mythic: number = 0;
	[rarity: string]: number;
}

class SetStat {
	code: SetCode;
	fullName: string;
	cards: {
		[rarity: string]: CardWithCount[];
	} = {};
	owned: StatsByRarity = new StatsByRarity();
	ownedUnique: StatsByRarity = new StatsByRarity();
	total: StatsByRarity = new StatsByRarity();
	inBoosters: {
		owned: StatsByRarity;
		ownedUnique: StatsByRarity;
		total: StatsByRarity;
	} = { owned: new StatsByRarity(), ownedUnique: new StatsByRarity(), total: new StatsByRarity() };
	icon: string | undefined = undefined;

	constructor(setCode: string, name: string) {
		this.code = setCode;
		this.fullName = name;
	}
}

export default defineComponent({
	name: "Collection",
	components: { MissingCard },
	props: {
		collection: { type: Object as PropType<PlainCollection>, required: true },
		collectionInfos: {
			type: Object as PropType<{
				wildcards: {
					common: number;
					uncommon: number;
					rare: number;
					mythic: number;
				};
				vaultProgress: number;
			}>,
			required: true,
		},
		language: { type: String as PropType<Language>, required: true },
		displaycollectionstatus: { type: Boolean, required: true },
	},
	data: () => {
		return {
			missingCardsRarity: "rare",
			showNonBooster: false,
			selectedSetCode: Constants.MTGASets[Constants.MTGASets.length - 1],
		};
	},
	computed: {
		collectionStats() {
			if (!this.collection || !SetsInfos) return null;
			const stats: { [key: string]: SetStat } = {
				all: new SetStat("all", "All"),
				standard: new SetStat("standard", "Standard"),
				others: new SetStat("others", "Other Sets"),
			};
			for (let s of Constants.MTGASets) {
				stats[s] = new SetStat(s, SetsInfos[s].fullName);
				stats[s].icon = SetsInfos[s].icon;
			}
			for (let id in MTGACards) {
				const card = { ...MTGACards[id], count: 0 };
				const completeSet = Constants.MTGASets.includes(card.set);
				if (card && !card["type"].startsWith("Basic")) {
					card.count = this.collection[id] ? this.collection[id] : 0;
					const set = completeSet ? card.set : "others";
					let categories = [set, "all"];
					if (Constants.StandardSets.includes(card.set)) categories.push("standard");
					for (let s of categories) {
						if (!(card.rarity in stats[s].cards)) stats[s].cards[card.rarity] = [];
						stats[s].cards[card.rarity].push(card);

						const count = (target: {
							owned: StatsByRarity;
							ownedUnique: StatsByRarity;
							total: StatsByRarity;
						}) => {
							target.total.all += 1;
							if (!(card.rarity in target.total)) target.total[card.rarity] = 0;
							target.total[card.rarity] += 1;
							target.owned.all += card.count;
							if (!(card.rarity in target.owned)) target.owned[card.rarity] = 0;
							target.owned[card.rarity] += card.count;
							target.ownedUnique.all += card.count > 0 ? 1 : 0;
							if (!(card.rarity in target.ownedUnique)) target.ownedUnique[card.rarity] = 0;
							target.ownedUnique[card.rarity] += card.count > 0 ? 1 : 0;
						};

						count(stats[s]);
						if (card.in_booster) count(stats[s].inBoosters);
					}
				}
			}
			return stats;
		},
		selectedSet() {
			return this.collectionStats?.[this.selectedSetCode];
		},
		sets() {
			return Constants.MTGASets.slice().reverse();
		},
		missingCards() {
			return (
				this.selectedSet?.cards?.[this.missingCardsRarity]?.filter(
					(c) => (this.showNonBooster || c.in_booster) && c.count < 4
				) ?? []
			);
		},
	},
	methods: {
		updateDisplayCollectionStatus(event: Event) {
			this.$emit("display-collection-status", (event.target as HTMLInputElement).checked);
		},
	},
});
</script>

<style scoped>
.resources {
	float: right;
	margin-top: 2em;
	margin-right: 1em;

	background: #444;
	padding: 1em;
}

.resources h3 {
	margin: 0;
}

.resources table {
	margin: 0.25em;
	text-align: right;
}

.resources tr {
	margin: 0.1em;
}
</style>
