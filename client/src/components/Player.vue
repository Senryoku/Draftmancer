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
		/>
		<font-awesome-icon
			icon="fa-solid fa-angle-double-left"
			class="passing-order-left"
			v-else-if="passingOrder === PassingOrder.Left"
			v-tooltip="'Passing order'"
		/>
		<font-awesome-icon
			icon="fa-solid fa-angle-double-right"
			class="passing-order-right"
			v-else-if="passingOrder === PassingOrder.Right"
			v-tooltip="'Passing order'"
		/>

		<div class="player-name" v-tooltip="user.userName">{{ user.userName }}</div>

		<div class="status-icons">
			<font-awesome-icon
				v-if="user.isBot || user.isReplaced"
				icon="fa-solid fa-robot"
				v-tooltip="user.isBot ? `${user.userName} is a bot.` : `${user.userName} has been replaced by a bot.`"
			/>
			<font-awesome-icon
				v-if="user.userID === sessionOwner"
				icon="fa-solid fa-crown"
				class="subtle-gold"
				v-tooltip="`${user.userName} is the session's owner.`"
			/>
			<!-- Owner controls -->
			<template v-if="userID === sessionOwner && !user.isBot && user.userID !== sessionOwner">
				<!-- Note: Bots are only supported in standard drafts, kicking player in other modes doesn't make sense. -->
				<font-awesome-icon
					v-if="removable"
					icon="fa-solid fa-user-slash"
					class="clickable red"
					v-tooltip="`Remove ${user.userName} from the session`"
					@click="emit('removePlayer', user.userID)"
				/>
				<template v-if="!user.isDisconnected">
					<img
						src="../assets/img/pass_ownership.svg"
						class="clickable"
						:class="{ 'opaque-disabled': user.isDisconnected }"
						style="height: 18px; margin-top: -4px"
						v-tooltip="`Give session ownership to ${user.userName}`"
						@click="emit('setSessionOwner', user.userID)"
					/>
				</template>
			</template>
			<template v-if="!user.isBot">
				<template v-if="!user.isDisconnected">
					<font-awesome-icon
						v-show="isCurrentPlayer"
						icon="fa-solid fa-spinner"
						spin
						v-tooltip="user.userName + ' is thinking...'"
					/>
				</template>
				<Transition name="error-icon">
					<font-awesome-icon
						v-if="user.isDisconnected"
						icon="fa-solid fa-plug-circle-xmark"
						class="red"
						v-tooltip="`${user.userName} is disconnected.`"
					/>
				</Transition>
			</template>
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
				/>
			</template>
		</div>

		<div class="chat-bubble" :id="'chat-bubble-' + user.userID"></div>
	</li>
</template>

<script setup lang="ts">
/**
 * User display in the session bar while a game is in progress.
 * @see SessionUser (equivalent before a game starts)
 */

import type { UserID } from "@/IDTypes";
import type { UserData } from "@/Session/SessionTypes";
import { PassingOrder } from "../common";

defineProps<{
	user: UserData;
	userID: UserID;
	sessionOwner: UserID;
	passingOrder: PassingOrder;
	isCurrentPlayer: boolean;
	removable: boolean;
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

<style scoped>
.error-icon-enter-active {
	animation: error-icon 0.8s linear;
}

@keyframes error-icon {
	0% {
		transform: scale(0) rotate(0deg);
		opacity: 0;
	}
	10% {
		transform: scale(1.5) rotate(-15deg);
		opacity: 1;
	}
	20% {
		transform: scale(1.5) rotate(15deg);
	}
	30% {
		transform: scale(1.5) rotate(-15deg);
	}
	40% {
		transform: scale(1.5) rotate(15deg);
	}
	50% {
		transform: scale(1.4) rotate(-10deg);
	}
	60% {
		transform: scale(1.3) rotate(10deg);
	}
	70% {
		transform: scale(1.2) rotate(-5deg);
	}
	80% {
		transform: scale(1.1) rotate(5deg);
	}
	100% {
		transform: scale(1) rotate(0deg);
	}
}
</style>
