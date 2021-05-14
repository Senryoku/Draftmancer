<template>
	<div v-if="collectionStats" style="position: relative">
		<div style="display: flex; justify-content: space-between">
			<div>
				Select set:
				<select v-model="selectedSetCode">
					<option
						v-for="set in ['all', 'standard', 'others']"
						:key="collectionStats[set].code"
						:value="collectionStats[set].name"
					>
						{{ collectionStats[set].fullName }}
					</option>
					<option style="color: #888" disabled>————————————————</option>
					<option v-for="set in sets" :key="collectionStats[set].code" :value="collectionStats[set].name">
						{{ collectionStats[set].fullName }}
					</option>
				</select>
			</div>
			<div>
				<input
					type="checkbox"
					@change="$emit('display-collection-status', $event.target.checked)"
					:checked="displaycollectionstatus"
					id="display-collection-status"
				/><label for="display-collection-status">Highlight required wildcards in games</label>
			</div>
		</div>
		<div class="resources">
			<h3>Resources</h3>
			<table style="margin: auto">
				<tr v-for="(value, rarity) in collectionInfos.wildcards" :key="rarity">
					<td><img class="wildcard-icon" :src="`img/wc_${rarity}.png`" /></td>
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
							(c) => (showNonBooster || c.in_booster) && c.count < 4
						)"
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

<script>
import MTGACards from "../../public/data/MTGACards.json";
import Constant from "../data/constants.json";
import SetsInfos from "../../public/data/SetsInfos.json";
import MissingCard from "./MissingCard.vue";

export default {
	name: "Collection",
	components: { MissingCard },
	props: {
		collection: { type: Object, required: true },
		collectionInfos: { type: Object, required: true },
		language: { type: String, required: true },
		displaycollectionstatus: { type: Boolean, required: true },
	},
	data: () => {
		return {
			missingCardsRarity: "rare",
			showNonBooster: false,
			selectedSetCode: Constant.MTGASets[Constant.MTGASets.length - 1],
		};
	},
	computed: {
		collectionStats: function () {
			if (!this.collection || !SetsInfos) return null;
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
			for (let s of Constant.MTGASets) {
				stats[s] = baseSet(s, SetsInfos[s].fullName);
				stats[s].icon = SetsInfos[s].icon;
			}
			for (let id in MTGACards) {
				const card = MTGACards[id];
				const completeSet = Constant.MTGASets.includes(card.set);
				if (card && !card["type"].startsWith("Basic")) {
					card.count = this.collection[id] ? this.collection[id] : 0;
					const set = completeSet ? card.set : "others";
					let categories = [set, "all"];
					if (Constant.StandardSets.includes(card.set)) categories.push("standard");
					for (let s of categories) {
						if (!(card.rarity in stats[s])) {
							stats[s][card.rarity] = [];
						}
						stats[s][card.rarity].push(card);

						const count = (target) => {
							target.total.all += 1;
							if (!(card.rarity in target.total)) target.total[card.rarity] = 0;
							target.total[card.rarity] += 1;
							target.owned.all += card.count;
							if (!(card.rarity in target.owned)) target.owned[card.rarity] = 0;
							target.owned[card.rarity] += card.count;
							target.owned.unique.all += card.count > 0 ? 1 : 0;
							if (!(card.rarity in target.owned.unique)) target.owned.unique[card.rarity] = 0;
							target.owned.unique[card.rarity] += card.count > 0 ? 1 : 0;
						};

						count(stats[s]);
						if (card.in_booster) count(stats[s].inBoosters);
					}
				}
			}
			return stats;
		},
		selectedSet: function () {
			return this.collectionStats[this.selectedSetCode];
		},
		sets: function () {
			return Constant.MTGASets.slice().reverse();
		},
	},
};
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
