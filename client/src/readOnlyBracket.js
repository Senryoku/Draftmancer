import Vue from "vue";
import ReadOnlyBracket from "./ReadOnlyBracket.vue";

Vue.config.productionTip = false;

new Vue({
	render: h => h(ReadOnlyBracket),
}).$mount("#read-only-bracket");
