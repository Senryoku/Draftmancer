<template>
  <div>
    <div class="toolbar">
      <button @click="newHand">New Hand</button>
      <button @click="drawCard" :disabled="library.length < 1">Draw Card</button>
    </div>
    <div class="hand">
      <card
        v-for="card in hand"
  			:card="card"
  			:language="language"
  		></card>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { Card as CardObject, CardColor, UniqueCard, toUnique } from "../../../src/CardTypes.ts";
import Card from "./Card.vue";

import MTGACards from "../MTGACards";



const basicLands: { [c in CardColor]: Card } = {
 "W" : MTGACards["72563"],
 "U" : MTGACards["72569"],
 "B" : MTGACards["72579"],
 "R" : MTGACards["72582"],
 "G" : MTGACards["72591"],
};

export default defineComponent({
	props: {
		language: { type: String as PropType<Language>, required: true },
		deck: { type: Array as PropType<UniqueCard[]>, required: true },
		options: {
			type: Object,
			default: () => {
				return { lands: null, preferredBasics: "" };
			},
		},
	},
  data() { return {
    library: [] as UniqueCard[],
    hand: [] as UniqueCard[],
  }},
  methods: {
    getBasicLands() {
      return Object.values(CardColor).flatMap(c => {
        const count = this.options.lands?.[c] ?? 0;
        return Array.apply(null, {length: count}).map(() => toUnique(basicLands[c]));
      })
    },
    drawCard() {
      if (this.library.length == 0) return;
      this.hand = [...this.hand, this.library.shift()];
    },
    newHand() {
      // Copy library from passed deck, then shuffle it
      this.library = [...this.deck, ...this.getBasicLands()];
      let counter = this.library.length;

      while (counter > 0) {
          let index = Math.floor(Math.random() * counter);
          counter--;

          let el = this.library[counter];
          this.library[counter] = this.library[index];
          this.library[index] = el;
      }     
      this.hand = [];

      while (this.hand.length < 7 && this.library.length > 0) {
        this.drawCard();
      }
    }
  },
  mounted() {
    this.newHand();
  },
  components: {
    Card
  }
});

</script>

<style scoped>
  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: .5em;
  }
  .hand {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: center;
    gap: 10px;
    width: calc(200px * 7 + 60px);
    height: 574px;
  }
</style>
