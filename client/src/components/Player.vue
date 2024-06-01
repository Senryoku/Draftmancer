<template>
	<li
		:class="{
			bot: user.isBot,
			'current-player': isCurrentPlayer,
		}"
		:data-userid="user.userID"
	>
		<font-awesome-icon
			icon="fa-solid fa-circle"
			size="xs"
			class="passing-order-repeat"
			v-if="passingOrder === PassingOrder.Repeat"
			v-tooltip="'Passing order'"
		></font-awesome-icon>
		<font-awesome-icon
			icon="fa-solid fa-angle-double-left"
			class="passing-order-left"
			v-else-if="passingOrder === PassingOrder.Left"
			v-tooltip="'Passing order'"
		></font-awesome-icon>
		<font-awesome-icon
			icon="fa-solid fa-angle-double-right"
			class="passing-order-right"
			v-else-if="passingOrder === PassingOrder.Right"
			v-tooltip="'Passing order'"
		></font-awesome-icon>

		<div class="player-name" v-tooltip="user.userName">{{ user.userName }}</div>

		<div class="status-icons">
			<template v-if="!user.isBot && !user.isDisconnected">
				<font-awesome-icon
					v-if="user.userID === sessionOwner"
					icon="fa-solid fa-crown"
					class="subtle-gold"
					v-tooltip="`${user.userName} is the session's owner.`"
				></font-awesome-icon>
				<template v-if="userID === sessionOwner && user.userID !== sessionOwner">
					<img
						src="../assets/img/pass_ownership.svg"
						class="clickable"
						:class="{ 'opaque-disabled': user.isDisconnected }"
						style="height: 18px; margin-top: -4px"
						v-tooltip="`Give session ownership to ${user.userName}`"
						@click="emit('setSessionOwner', user.userID)"
					/>
					<font-awesome-icon
						icon="fa-solid fa-user-slash"
						class="clickable red"
						:class="{ 'opaque-disabled': user.isDisconnected }"
						v-tooltip="`Remove ${user.userName} from the session`"
						@click="emit('removePlayer', user.userID)"
					></font-awesome-icon>
				</template>
				<font-awesome-icon
					v-show="!user.isDisconnected && isCurrentPlayer"
					icon="fa-solid fa-spinner"
					spin
					v-tooltip="user.userName + ' is thinking...'"
				></font-awesome-icon>
			</template>
			<font-awesome-icon v-if="user.isBot || user.isReplaced" icon="fa-solid fa-robot"></font-awesome-icon>
			<template v-if="user.boosterCount !== undefined">
				<div
					v-tooltip="`${user.userName} has ${user.boosterCount} boosters.`"
					v-if="user.boosterCount > 0"
					class="booster-count"
				>
					<template v-if="user.boosterCount === 1">
						<img src="../assets/img/booster.svg" />
					</template>
					<template v-else-if="user.boosterCount === 2">
						<img src="../assets/img/booster.svg" style="transform: translate(-50%, -50%) rotate(10deg)" />
						<img src="../assets/img/booster.svg" style="transform: translate(-50%, -50%) rotate(-10deg)" />
					</template>
					<template v-else-if="user.boosterCount > 2">
						<img src="../assets/img/booster.svg" style="transform: translate(-50%, -50%) rotate(10deg)" />
						<img src="../assets/img/booster.svg" style="transform: translate(-50%, -50%) rotate(-10deg)" />
						<img src="../assets/img/booster.svg" />
						<div>
							{{ user.boosterCount }}
						</div>
					</template>
				</div>
				<font-awesome-icon
					icon="fa-solid fa-spinner"
					spin
					v-tooltip="`${user.userName} is waiting...`"
					v-else
				></font-awesome-icon>
			</template>
		</div>

		<div class="chat-bubble" :id="'chat-bubble-' + user.userID"></div>
	</li>
</template>

<script setup lang="ts">
import type { UserID } from "@/IDTypes";
import type { UserData } from "@/Session/SessionTypes";
import { PassingOrder } from "../common";

defineProps<{
	user: UserData;
	userID: UserID;
	sessionOwner: UserID;
	passingOrder: PassingOrder;
	isCurrentPlayer: boolean;
}>();

const emit = defineEmits<{
	(e: "removePlayer", userID: UserID): void;
	(e: "setSessionOwner", userID: UserID): void;
}>();
</script>

<style scoped>
.bot {
	min-width: auto;
	flex: 1 1 auto;
}

.passing-order-repeat {
	position: absolute;
	right: -1.15em;
	top: 50%;
	transform: translateY(-50%);
	font-size: 10px;
}

.passing-order-left {
	position: absolute;
	left: -0.85em;
	top: 0.6em;
}

.passing-order-right {
	position: absolute;
	right: -0.85em;
	top: 0.6em;
}
</style>
