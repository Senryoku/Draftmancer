<template>
	<div id="adsgoeshere" class="welcome-section" style="text-align: center" v-html="adsenseContent"></div>
</template>

<script>
export default {
	data() {
		return { adsenseContent: "" };
	},
	mounted() {
		this.adsenseContent = document.getElementById("divadsensedisplaynone").innerHTML;
	},
};
</script>

<style></style>
