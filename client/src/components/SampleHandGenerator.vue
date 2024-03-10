<template>
  <div>
    <div class="toolbar">
      <button @click="newHand">New Hand</button>
      <button @click="drawCard" :disabled="library.value.length < 1">Draw Card</button>
    </div>
    <div class="hand">
      <card
        v-for="card in hand.value"
  			:card="card"
  			:language="language"
  		></card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, defineProps, reactive, onMounted, PropType } from "vue";
import { Card as CardObject, CardColor, UniqueCard, toUnique } from "../../../src/CardTypes.ts";
import Card from "./Card.vue";

import MTGACards from "../MTGACards";


const props = defineProps({
	language: { type: String as PropType<Language>, required: true },
	deck: { type: Array as PropType<UniqueCard[]>, required: true },
	options: {
		type: Object,
		default: () => {
			return { lands: null, preferredBasics: "" };
		},
	},
});

const basicLands: { [c in CardColor]: Card } = {
 "W" : MTGACards["72563"],
 "U" : MTGACards["72569"],
 "B" : MTGACards["72579"],
 "R" : MTGACards["72582"],
 "G" : MTGACards["72591"],
};

let library = reactive<{ value: UniqueCard[] }>({
  value: []
});
let hand = reactive<{ value: UniqueCard[] }>({
  value: []
});

function getBasicLands() {
  return Object.values(CardColor).flatMap(c => {
    const count = props.options.lands?.[c] ?? 0;
    return Array.apply(null, {length: count}).map(() => toUnique(basicLands[c]));
  })
}

function drawCard() {
  if (library.value.length == 0) return;
  const card = library.value.shift();
  hand.value = [...hand.value, card];
}

function newHand() {
  // Copy library from passed deck, then shuffle it
  library.value = [...props.deck, ...getBasicLands()];
  let counter = library.value.length;

  while (counter > 0) {
      let index = Math.floor(Math.random() * counter);
      counter--;

      let el = library.value[counter];
      library.value[counter] = library.value[index];
      library.value[index] = el;
  }     
  hand.value = [];

  while (hand.value.length < 7 && library.value.length > 0) {
    drawCard();
  }
}

onMounted(() => {
  newHand();
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
