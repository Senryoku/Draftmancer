<template>
	<div v-if="collectionStats">
		Select set:
		<select v-model="selectedSetCode">
			<option v-for="set in collectionStats" :key="set.code" :value="set.name">{{ set.fullName }}</option>
		</select>
		<div class="set-stats">
			<div v-if="selectedSet">
				<table>
					<caption>
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
						<td>{{ selectedSet.owned.unique[r] }} / {{ selectedSet.total[r] }}</td>
						<td>{{ selectedSet.owned[r] }} / {{ 4 * selectedSet.total[r] }}</td>
						<td>{{ 4 * selectedSet.total[r] - selectedSet.owned[r] }}</td>
						<td>{{ selectedSet.inBoosters.owned.unique[r] }} / {{ selectedSet.inBoosters.total[r] }}</td>
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
						v-for="card in selectedSet[missingCardsRarity].filter(
							c => (showNonBooster || c.in_booster) && c.count < 4
						)"
						:key="card.uniqueID"
						:card="card"
						:language="language"
					></missing-card>
				</div>
			</div>
		</div>
	</div>
	<div v-else>Collection statistics not available.</div>
</template>

<script>
import Constant from "../data/constants.json";
import SetsInfos from "../../public/data/SetsInfos.json";
import { Cards, genCard } from "./../Cards.js";
import MissingCard from "./MissingCard.vue";

export default {
	name: "Collection",
	components: { MissingCard },
	props: {
		collection: { type: Object, required: true },
		language: { type: String, required: true },
	},
	data: () => {
		return {
			missingCardsRarity: "rare",
			showNonBooster: false,
			selectedSetCode: Constant.MTGSets[Constant.MTGSets.length - 1],
		};
	},
	computed: {
		collectionStats: function() {
			if (!this.collection || !Cards || !SetsInfos) return null;
			const baseSet = (setCode, fullName) => {
				return {
					name: setCode,
					fullName: fullName,
					common: [],
					uncommon: [],
					rare: [],
					mythic: [],
					owned: {
						unique: { all: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 },
						all: 0,
						common: 0,
						uncommon: 0,
						rare: 0,
						mythic: 0,
					},
					total: { all: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 },
					inBoosters: {
						owned: {
							unique: { all: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 },
							all: 0,
							common: 0,
							uncommon: 0,
							rare: 0,
							mythic: 0,
						},
						total: { all: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 },
					},
				};
			};
			let stats = {
				all: baseSet("all", "All"),
				standard: baseSet("standard", "Standard"),
				others: baseSet("others", "Other Sets"),
			};
			for (let s of Constant.MTGSets.slice().reverse()) stats[s] = baseSet(s, SetsInfos[s].fullName);
			for (let id in Cards) {
				let card = genCard(id);
				const completeSet = Constant.MTGSets.includes(card.set);
				if (card && !["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(card["name"])) {
					card.count = this.collection[id] ? this.collection[id] : 0;
					const set = completeSet ? card.set : "others";
					let categories = [set, "all"];
					if (Constant.StandardSets.includes(card.set)) categories.push("standard");
					for (let s of categories) {
						stats[s][card.rarity].push(card);

						const count = target => {
							target.total.all += 1;
							target.total[card.rarity] += 1;
							target.owned.all += card.count;
							target.owned[card.rarity] += card.count;
							target.owned.unique.all += card.count > 0 ? 1 : 0;
							target.owned.unique[card.rarity] += card.count > 0 ? 1 : 0;
						};

						count(stats[s]);
						if (card.in_booster) count(stats[s].inBoosters);
					}
				}
			}
			return stats;
		},
		selectedSet: function() {
			return this.collectionStats[this.selectedSetCode];
		},
	},
};
</script>
