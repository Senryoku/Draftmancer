<template>
	<div v-if="collectionStats">
		Select set:
		<select v-model="selectedSetCode">
			<option v-for="set in collectionStats" :key="set.code" :value="set.name">{{ set.fullName }}</option>
		</select>
		<div class="set-stats">
			<div v-if="selectedSet">
				<table>
					<caption>{{selectedSet.fullName}}</caption>
					<tr>
						<th>Rarity</th>
						<th>Unique</th>
						<th>Total</th>
						<th>Total Missing</th>
						<th>Unique (Booster)</th>
						<th>Missing From Boosters</th>
					</tr>
					<tr>
						<td>Total</td>
						<td>{{ selectedSet.cards.filter(c => c.count > 0).length }}/{{ selectedSet.total.unique }}</td>
						<td>{{ selectedSet.cardCount }}/{{ 4 * selectedSet["total"]["unique"] }}</td>
						<td>{{ 4 * selectedSet["total"]["unique"] - selectedSet.cardCount }}</td>
						<td>{{ selectedSet.cards.filter(c => c.in_booster && c.count > 0).length }}/{{ selectedSet.cards.filter(c => c.in_booster).length }}</td>
						<td>-</td>
					</tr>
					<tr
						v-for="r in ['common', 'uncommon', 'rare', 'mythic'].filter(r => selectedSet[r + 'Count'] && selectedSet['total'][r + 'Count'] > 0)"
						:key="r"
					>
						<td>{{ r }}</td>
						<td>{{ selectedSet[r].filter(c => c.count > 0).length }}/{{ selectedSet["total"][r + "Count"] }}</td>
						<td>{{ selectedSet[r + "Count"] }}/{{ 4 * selectedSet["total"][r + "Count"] }}</td>
						<td>{{ 4 * selectedSet["total"][r + "Count"] - selectedSet[r + "Count"] }}</td>
						<td>{{ selectedSet[r].filter(c => c.in_booster && c.count > 0).length }}/{{selectedSet[r].filter(c => c.in_booster).length}}</td>
						<td>{{4 * selectedSet[r].filter(c => c.in_booster).length - selectedSet[r].filter(c => c.in_booster).reduce((acc, val) => acc + val.count, 0)}}</td>
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
						v-for="card in selectedSet.cards.filter(c => c.rarity == missingCardsRarity && (showNonBooster || c.in_booster) && c.count < 4)"
						:key="card.uniqueID"
						:card="card"
						:language="$root.language"
					></missing-card>
				</div>
			</div>
		</div>
	</div>
	<div v-else>Collection statistics not available.</div>
</template>

<script>
import MissingCard from "./MissingCard.vue";

export default {
	name: "Collection",
	components: { MissingCard },
	props: {
		collection: { type: Object, required: true },
	},
	data: () => {
		return {
			missingCardsRarity: "rare",
			showNonBooster: false,
			selectedSetCode: "iko",
		};
	},
	computed: {
		collectionStats: function() {
			if (!this.collection || !this.$root.cards || !this.$root.setsInfos) return null;
			let stats = {};
			for (let id in this.$root.cards) {
				let card = this.$root.genCard(id);
				const completeSet = this.$root.sets.includes(card.set);
				if (card && !["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(card["name"])) {
					card.count = this.collection[id] ? this.collection[id] : 0;
					const set = completeSet ? card.set : "Others";
					if (!(set in stats)) {
						stats[set] = {
							name: set,
							fullName: completeSet ? this.$root.setsInfos[card.set].fullName : "Others",
							cards: [],
							cardCount: 0,
							common: [],
							uncommon: [],
							rare: [],
							mythic: [],
							commonCount: 0,
							uncommonCount: 0,
							rareCount: 0,
							mythicCount: 0,
							total: completeSet
								? {
										unique: this.$root.setsInfos[card.set].cardCount,
										commonCount: this.$root.setsInfos[card.set]["commonCount"],
										uncommonCount: this.$root.setsInfos[card.set]["uncommonCount"],
										rareCount: this.$root.setsInfos[card.set]["rareCount"],
										mythicCount: this.$root.setsInfos[card.set]["mythicCount"],
								  }
								: { unique: 0, commonCount: 0, uncommonCount: 0, rareCount: 0, mythicCount: 0 },
						};
					}
					stats[set].cards.push(card);
					stats[set].cardCount += card.count;
					stats[set][card.rarity].push(card);
					stats[set][card.rarity + "Count"] += card.count;
					if (!completeSet) {
						stats[set].total.unique += 1;
						stats[set].total[card.rarity + "Count"] += 1;
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
