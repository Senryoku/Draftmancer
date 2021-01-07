<template>
	<div v-if="!ready">
		<div class="loading"></div>
		<span>Loading cards data...</span>
	</div>
	<div id="main-container" v-else>
		<!-- Personal Options -->
		<div id="view-controls" class="main-controls">
			<span>
				<label for="user-name">User Name</label>
				<delayed-input id="user-name" v-model="userName" type="text" maxlength="50" :delay="2" />
				<div class="inline" v-tooltip="'Controls the display language of cards.'">
					<label for="language">Card Language</label>
					<select v-model="language" name="language" id="select-language">
						<option
							v-for="lang in languages"
							v-bind:value="lang.code"
							:selected="lang.code === language"
							:key="lang.code"
						>
							{{ lang.name }}
						</option>
					</select>
				</div>
			</span>
			<span>
				<label for="file-input">MTGA Collection</label>
				<input type="file" id="file-input" @change="parseMTGALog" style="display: none" accept=".log" />
				<button
					onclick="document.querySelector('#file-input').click()"
					v-tooltip="'Import your collection by uploading your Player.log file.'"
				>
					Upload
					<i v-if="hasCollection" class="fas fa-check green" v-tooltip="'Collection uploaded.'"></i>
				</button>
				<button
					v-if="hasCollection"
					v-tooltip="'Display some statistics about your collection.'"
					@click="displayedModal = 'collection'"
				>
					Stats
				</button>
				<div
					v-show="hasCollection"
					class="inline"
					v-tooltip="
						'Only a limited pool of cards you own is used, uncheck to utilize all set(s). (Ignored when using a Custom Card List)'
					"
				>
					<input type="checkbox" v-model="useCollection" id="useCollection" />
					<label for="useCollection">Restrict to Collection</label>
				</div>
			</span>
			<div>
				<button @click="displayedModal = 'draftLogs'" v-tooltip="'Displays logs of your previous drafts'">
					Draft Logs
				</button>
			</div>
			<span>
				<i
					class="fas clickable"
					:class="{ 'fa-volume-mute': !enableSound, 'fa-volume-up': enableSound }"
					@click="enableSound = !enableSound"
					v-tooltip="'Toggle sound.'"
				></i>
				<div class="inline" v-tooltip="'Allows you to pick cards by double clicking.'">
					<input type="checkbox" v-model="pickOnDblclick" id="pickOnDblclick" />
					<label for="pickOnDblclick">Pick on Double Click</label>
				</div>
				<span
					:class="{ disabled: notificationPermission == 'denied' }"
					v-tooltip="'Enable to get desktop notifications when your draft starts.'"
				>
					<input
						type="checkbox"
						v-model="enableNotifications"
						@change="checkNotificationPermission"
						id="notification-input"
					/>
					<label for="notification-input">Notifications</label>
				</span>
			</span>
		</div>

		<!-- Session Options -->
		<div class="generic-container">
			<div id="limited-controls" class="main-controls" v-bind:class="{ disabled: drafting }">
				<span id="session-controls">
					<div class="inline" v-tooltip="'Unique ID of your game session.'">
						<label for="session-id">Session ID</label>
						<delayed-input
							v-model="sessionID"
							autocomplete="off"
							id="session-id"
							:type="hideSessionID ? 'password' : 'text'"
							maxlength="50"
							:delay="2"
						/>
					</div>
					<i
						class="far fa-fw clickable"
						:class="hideSessionID ? 'fa-eye' : 'fa-eye-slash'"
						@click="hideSessionID = !hideSessionID"
						v-tooltip="'Show/Hide your session ID.'"
					></i>
					<i
						class="fas fa-fw fa-share-square clickable"
						v-tooltip="'Copy session link for sharing.'"
						@click="sessionURLToClipboard"
					></i>
					<i
						class="fas fa-project-diagram clickable"
						v-if="sessionOwner === userID && !bracket"
						@click="generateBracket"
						v-tooltip="'Generate Bracket.'"
					></i>
					<i
						class="fas fa-project-diagram clickable"
						v-if="bracket"
						@click="displayedModal = 'bracket'"
						v-tooltip="'Display Bracket.'"
					></i>
					<i
						class="fas fa-user-check clickable"
						v-if="sessionOwner === userID"
						@click="readyCheck"
						v-tooltip="'Ready Check: Ask everyone in your session if they\'re ready to play.'"
					></i>
				</span>
				<span class="generic-container card-pool-controls">
					<input
						type="file"
						id="card-list-input-main"
						@change="uploadFile($event, parseCustomCardList)"
						style="display: none"
						accept=".txt"
					/>

					<strong>Card Pool:</strong>
					<span v-if="useCustomCardList">
						{{ customCardList.name ? customCardList.name : "Custom Card List" }}
						(
						<template v-if="customCardList.length > 0">
							{{ customCardList.length }} cards
							<a @click="displayedModal = 'cardList'" v-tooltip="'Review the card list'">
								<i class="fas fa-file-alt"></i>
							</a>
						</template>
						<template v-else>No list loaded</template>
						<i
							class="fas fa-file-upload clickable"
							onclick="document.querySelector('#card-list-input-main').click()"
							v-tooltip="'Upload a Custom Card List'"
							v-if="sessionOwner === userID"
						></i>
						<i
							class="fas fa-times clickable brightred"
							@click="useCustomCardList = false"
							v-tooltip="'Return to official sets.'"
							v-if="sessionOwner === userID"
						></i>
						)
					</span>
					<span v-else :class="{ disabled: sessionOwner != userID }">
						<div class="inline">
							<label
								for="set-restriction"
								v-tooltip="
									'Restricts to the selected sets. No selection means all cards present in Arena.'
								"
								>Set(s)</label
							>
							<multiselect
								v-if="setsInfos"
								v-model="setRestriction"
								placeholder="All"
								:options="sets.slice().reverse()"
								:searchable="false"
								:allow-empty="true"
								:close-on-select="false"
								:multiple="true"
								select-label
								selected-label=""
								deselect-label=""
							>
								<template slot="selection" slot-scope="{ values }">
									<span class="multiselect__single" v-if="values.length == 1">
										<img class="set-icon" :src="setsInfos[values[0]].icon" />
										{{ setsInfos[values[0]].fullName }}
									</span>
									<span
										class="multiselect__single multiselect__single_nooverflow"
										v-if="values.length > 1"
									>
										({{ values.length }})
										<img v-for="v in values" class="set-icon" :src="setsInfos[v].icon" :key="v" />
									</span>
								</template>
								<template slot="option" slot-scope="{ option }">
									<span class="multiselect__option">
										<img class="set-icon padded-icon" :src="setsInfos[option].icon" />
										{{ setsInfos[option].fullName }}
									</span>
								</template>
								<div
									class="clickable"
									style="text-align: center; padding: 0.5em; font-size: 0.75em"
									slot="beforeList"
									onclick="document.querySelector('#card-list-input-main').click()"
								>
									Upload a Custom Card List...
								</div>
								<div
									class="clickable"
									style="text-align: center; padding: 0.5em; font-size: 0.75em"
									slot="afterList"
									@click="displayedModal = 'setRestriction'"
								>
									More sets...
								</div>
							</multiselect>
							<i
								class="fas fa-ellipsis-h clickable"
								@click="displayedModal = 'setRestriction'"
								v-tooltip="'View all sets'"
							></i>
							<div
								class="inline"
								v-tooltip="
									'Draft with all cards within set restriction disregarding players collections.'
								"
							>
								<input type="checkbox" v-model="ignoreCollections" id="ignore-collections" />
								<label for="ignore-collections">Ignore Collections</label>
							</div>
						</div>
					</span>
				</span>
				<span class="generic-container" :class="{ disabled: sessionOwner != userID }">
					<strong>Draft:</strong>
					<div
						class="inline"
						:class="{ disabled: teamDraft }"
						v-tooltip="'Add some dumb bots to your draft.'"
					>
						<label for="bots">Bots</label>
						<input
							type="number"
							id="bots"
							class="small-number-input"
							min="0"
							max="7"
							step="1"
							v-model.number="bots"
						/>
					</div>
					<div class="inline" v-tooltip="'Pick Timer (sec.). Zero means no timer.'">
						<label for="timer">
							<i class="fas fa-clock"></i>
						</label>
						<input
							type="number"
							id="timer"
							class="small-number-input"
							min="0"
							max="180"
							step="15"
							v-model.number="maxTimer"
						/>
					</div>
					<button @click="startDraft" v-tooltip="'Starts a Draft Session.'">Draft</button>
				</span>
				<span>
					<dropdown :class="{ disabled: sessionOwner != userID }">
						<template v-slot:handle>
							Other Game Modes
							<i class="fas fa-caret-down"></i>
						</template>
						<template v-slot:dropdown>
							<span class="game-modes-cat">Draft</span>
							<button
								@click="startWinstonDraft()"
								v-tooltip.left="'Starts a Winston Draft. This is a draft variant for only two players.'"
							>
								Winston (2p.)
							</button>
							<button
								@click="startGridDraft()"
								v-tooltip.left="'Starts a Grid Draft. This is a draft variant for only two players.'"
							>
								Grid (2p.)
							</button>
							<button
								@click="startGlimpseDraft()"
								v-tooltip.left="
									'Starts a Glimpse Draft. Players also remove cards from the draft each pick.'
								"
							>
								Glimpse/Burn
							</button>
							<button
								@click="startRochesterDraft()"
								v-tooltip.left="'Starts a Rochester Draft. Every players picks from a single booster.'"
							>
								Rochester
							</button>
							<span class="game-modes-cat">Sealed</span>
							<button
								@click="sealedDialog"
								v-tooltip.left="'Distributes boosters to everyone for a sealed session.'"
							>
								Sealed
							</button>
							<button
								@click="deckWarning(distributeJumpstart)"
								v-tooltip.left="'Distributes two Jumpstart boosters to everyone.'"
							>
								Jumpstart
							</button>
						</template>
					</dropdown>
				</span>
				<span
					v-tooltip="'More session options'"
					@click="displayedModal = 'sessionOptions'"
					class="setting-button clickable"
				>
					Settings
					<i class="fas fa-cog"></i>
				</span>
			</div>
			<div v-show="drafting" id="draft-in-progress">
				Draft in progress!
				<button v-if="sessionOwner == userID" class="stop" @click="stopDraft">
					<i class="fas fa-stop"></i> Stop Draft
				</button>
				<button v-if="sessionOwner == userID && maxTimer > 0" class="stop" @click="pauseDraft">
					<i class="fas fa-pause"></i> Pause Draft
				</button>
			</div>
		</div>

		<!-- Session Players -->
		<div class="main-controls session-players">
			<div
				v-if="!ownerIsPlayer"
				class="generic-container"
				v-tooltip="'Non-playing session owner.'"
				style="flex: 0 3 auto; text-align: center"
			>
				<i
					class="fas fa-crown subtle-gold"
					v-tooltip="
						sessionOwnerUsername
							? `${sessionOwnerUsername} is the session owner.`
							: 'Session owner is disconnected.'
					"
				></i>
				<br />
				{{ sessionOwnerUsername ? sessionOwnerUsername : "(Disconnected)" }}
				<div class="chat-bubble" :id="'chat-bubble-' + sessionOwner"></div>
			</div>
			<div
				v-tooltip="'Maximum players can be adjusted in session settings.'"
				style="flex: 0 3 auto; text-align: center; font-size: 0.8em; margin-right: 0.5em"
			>
				Players
				<br />
				({{ sessionUsers.length }}/{{ maxPlayers }})
			</div>
			<i
				v-if="userID == sessionOwner && !drafting"
				class="fas fa-random clickable"
				@click="randomizeSeating"
				v-tooltip="'Randomize Seating Order.'"
			></i>
			<template v-if="!drafting">
				<draggable
					tag="ul"
					class="player-list"
					v-model="userOrder"
					@change="changePlayerOrder"
					:disabled="userID != sessionOwner || drafting"
				>
					<li
						v-for="(id, idx) in userOrder"
						:key="id"
						:class="{
							teama: teamDraft && idx % 2 === 0,
							teamb: teamDraft && idx % 2 === 1,
							draggable: userID === sessionOwner && !drafting,
							bot: userByID[id].isBot,
						}"
						:data-userid="id"
					>
						<div class="player-name">{{ userByID[id].userName }}</div>
						<template v-if="userID == sessionOwner">
							<i
								class="fas fa-chevron-left clickable move-player move-player-left"
								v-tooltip="`Move ${userByID[id].userName} to the left`"
								@click="movePlayer(idx, -1)"
							></i>
							<i
								class="fas fa-chevron-right clickable move-player move-player-right"
								v-tooltip="`Move ${userByID[id].userName} to the right`"
								@click="movePlayer(idx, 1)"
							></i>
						</template>
						<div class="status-icons">
							<i
								v-if="id === sessionOwner"
								class="fas fa-crown subtle-gold"
								v-tooltip="`${userByID[id].userName} is the session owner.`"
							></i>
							<template v-if="userID === sessionOwner && id != sessionOwner">
								<i
									class="fas fa-user-plus clickable subtle-gold"
									v-tooltip="`Give session ownership to ${userByID[id].userName}`"
									@click="setSessionOwner(id)"
								></i>
								<i
									class="fas fa-user-slash clickable red"
									v-tooltip="`Remove ${userByID[id].userName} from the session`"
									@click="removePlayer(id)"
								></i>
							</template>
							<template v-if="!useCustomCardList && !ignoreCollections">
								<template v-if="!userByID[id].collection">
									<i
										class="fas fa-book red"
										v-tooltip="userByID[id].userName + ' has not uploaded their collection yet.'"
									></i>
								</template>
								<template v-else-if="userByID[id].collection && !userByID[id].useCollection">
									<i
										class="fas fa-book yellow"
										v-tooltip="
											userByID[id].userName +
											' has uploaded their collection, but is not using it.'
										"
									></i>
								</template>
								<template v-else>
									<i
										class="fas fa-book green"
										v-tooltip="userByID[id].userName + ' has uploaded their collection.'"
									></i>
								</template>
							</template>
							<template v-if="pendingReadyCheck">
								<template v-if="userByID[id].readyState == ReadyState.Ready">
									<i class="fas fa-check green" v-tooltip="`${userByID[id].userName} is ready!`"></i>
								</template>
								<template v-else-if="userByID[id].readyState == ReadyState.NotReady">
									<i
										class="fas fa-times red"
										v-tooltip="`${userByID[id].userName} is NOT ready!`"
									></i>
								</template>
								<template v-else-if="userByID[id].readyState == ReadyState.Unknown">
									<i
										class="fas fa-spinner fa-spin"
										v-tooltip="`Waiting for ${userByID[id].userName} to respond...`"
									></i>
								</template>
							</template>
						</div>
						<div class="chat-bubble" :id="'chat-bubble-' + id"></div>
					</li>
				</draggable>
			</template>
			<template v-else>
				<ul class="player-list">
					<li
						v-for="(user, idx) in virtualPlayers"
						:class="{
							teama: teamDraft && idx % 2 === 0,
							teamb: teamDraft && idx % 2 === 1,
							bot: user.isBot,
							currentPlayer:
								(winstonDraftState && winstonDraftState.currentPlayer === user.userID) ||
								(gridDraftState && gridDraftState.currentPlayer === user.userID) ||
								(rochesterDraftState && rochesterDraftState.currentPlayer === user.userID),
						}"
						:data-userid="user.userID"
						:key="user.userID"
					>
						<template v-if="!rochesterDraftState">
							<i
								class="fas fa-angle-double-left passing-order-left"
								v-show="boosterNumber % 2 == 1"
								v-tooltip="'Passing order'"
							></i>
							<i
								class="fas fa-angle-double-right passing-order-right"
								v-show="boosterNumber % 2 == 0"
								v-tooltip="'Passing order'"
							></i>
						</template>
						<div class="player-name">{{ user.userName }}</div>
						<template v-if="!user.isBot && !user.disconnected">
							<div class="status-icons">
								<i
									v-if="user.userID === sessionOwner"
									class="fas fa-crown subtle-gold"
									v-tooltip="`${user.userName} is the session's owner.`"
								></i>
								<template v-if="userID === sessionOwner && user.userID != sessionOwner">
									<i
										class="fas fa-user-plus clickable subtle-gold"
										v-if="ownerIsPlayer"
										v-tooltip="`Give session ownership to ${user.userName}`"
										@click="setSessionOwner(user.userID)"
									></i>
									<i
										class="fas fa-user-slash clickable red"
										v-tooltip="`Remove ${user.userName} from the session`"
										@click="removePlayer(user.userID)"
									></i>
								</template>
								<template v-if="winstonDraftState || gridDraftState || rochesterDraftState">
									<i
										v-show="
											(winstonDraftState && user.userID === winstonDraftState.currentPlayer) ||
											(gridDraftState && user.userID === gridDraftState.currentPlayer) ||
											(rochesterDraftState && user.userID === rochesterDraftState.currentPlayer)
										"
										class="fas fa-spinner fa-spin"
										v-tooltip="user.userName + ' is thinking...'"
									></i>
								</template>
								<template v-else>
									<template v-if="user.pickedThisRound">
										<i
											class="fas fa-check green"
											v-tooltip="user.userName + ' has picked a card.'"
										></i>
									</template>
									<template v-else>
										<i
											class="fas fa-spinner fa-spin"
											v-tooltip="user.userName + ' is thinking...'"
										></i>
									</template>
								</template>
							</div>
							<div class="chat-bubble" :id="'chat-bubble-' + user.userID"></div>
						</template>
					</li>
				</ul>
			</template>
			<div class="chat">
				<form @submit.prevent="sendChatMessage">
					<input
						type="text"
						v-model="currentChatMessage"
						placeholder="Chat with players in your session."
						maxlength="255"
					/>
				</form>
				<i
					class="far fa-comments clickable"
					@click="displayChatHistory = !displayChatHistory"
					v-tooltip="'Display chat history.'"
				></i>
				<div
					class="chat-history"
					v-show="displayChatHistory"
					@focusout="displayChatHistory = false"
					tabindex="0"
				>
					<template v-if="messagesHistory && messagesHistory.length > 0">
						<ol>
							<li
								v-for="msg in messagesHistory.slice().reverse()"
								:title="new Date(msg.timestamp)"
								:key="msg.timestamp"
							>
								<span class="chat-author">
									{{
										msg.author in userByID
											? userByID[msg.author].userName
											: msg.author === sessionOwner && sessionOwnerUsername
											? sessionOwnerUsername
											: "(Left)"
									}}
								</span>
								<span class="chat-message">{{ msg.text }}</span>
							</li>
						</ol>
					</template>
					<template v-else>No messages in chat history.</template>
				</div>
			</div>
		</div>

		<!-- Draft Controls -->
		<template v-if="drafting">
			<transition :name="'slide-fade-' + (boosterNumber % 2 ? 'left' : 'right')" mode="out-in">
				<div v-if="draftingState == DraftState.Watching" key="draft-watching" class="draft-watching">
					<div class="draft-watching-state">
						<h1>Players are drafting...</h1>
						<div v-show="pickTimer >= 0">
							<i class="fas fa-clock"></i>
							{{ pickTimer }}
						</div>
						<div>Pack #{{ boosterNumber }}, Pick #{{ pickNumber }}</div>
					</div>
					<div v-if="draftLogLive && draftLogLive.sessionID === sessionID" class="draft-watching-live-log">
						<draft-log-live
							:draftlog="draftLogLive"
							:show="['owner', 'everyone'].includes(draftLogRecipients)"
							:language="language"
						></draft-log-live>
					</div>
				</div>
				<div v-if="draftingState == DraftState.Waiting" key="draft-waiting" class="pick-waiting">
					<span class="spinner"></span>
					<span v-show="pickTimer >= 0">
						(
						<i class="fas fa-clock"></i>
						{{ pickTimer }})
					</span>
					Waiting for other players to pick...
				</div>
				<div
					v-if="draftingState == DraftState.Picking"
					key="draft-picking"
					id="booster-container"
					class="container"
				>
					<div id="booster-controls" class="section-title">
						<h2>Your Booster ({{ booster.length }})</h2>
						<div class="controls">
							<span>Pack #{{ boosterNumber }}, Pick #{{ pickNumber }}</span>
							<span v-show="pickTimer >= 0" :class="{ redbg: pickTimer <= 10 }" id="chrono">
								<i class="fas fa-clock"></i>
								{{ pickTimer }}
							</span>
							<input
								type="button"
								@click="pickCard"
								value="Confirm Pick"
								v-if="
									selectedCards.length === cardsToPick && burningCards.length === cardsToBurnThisRound
								"
							/>
							<span v-else>
								<span v-if="cardsToPick === 1">Pick a card</span>
								<span v-else>
									Pick {{ cardsToPick }} cards ({{ selectedCards.length }} / {{ cardsToPick }})
								</span>
								<span v-if="cardsToBurnThisRound > 0">
									and remove {{ cardsToBurnThisRound }} cards from the pool ({{
										burningCards.length
									}}/{{ cardsToBurnThisRound }}).
								</span>
							</span>
						</div>
					</div>
					<div class="booster card-container">
						<booster-card
							v-for="card in booster"
							:key="`card-booster-${card.uniqueID}`"
							:card="card"
							:language="language"
							:canbeburned="burnedCardsPerRound > 0"
							:burned="burningCards.includes(card)"
							:class="{ selected: selectedCards.includes(card) }"
							@click.native="selectCard($event, card)"
							@dblclick.native="doubleClickCard($event, card)"
							@burn="burnCard($event, card)"
							@restore="restoreCard($event, card)"
							draggable
							@dragstart.native="dragBoosterCard($event, card)"
						></booster-card>
					</div>
				</div>
			</transition>
			<!-- Winston Draft -->
			<div
				v-if="draftingState === DraftState.WinstonPicking || draftingState === DraftState.WinstonWaiting"
				class="container"
			>
				<div class="section-title">
					<h2>Winston Draft</h2>
					<div class="controls">
						<span>
							<template v-if="userID === winstonDraftState.currentPlayer"
								>Your turn to pick a pile of cards!</template
							>
							<template v-else>
								Waiting for
								{{
									winstonDraftState.currentPlayer in userByID
										? userByID[winstonDraftState.currentPlayer].userName
										: "(Disconnected)"
								}}...
							</template>
							There are {{ winstonDraftState.remainingCards }} cards left in the main stack.
						</span>
					</div>
				</div>
				<div class="winston-piles">
					<div
						v-for="(pile, index) in winstonDraftState.piles"
						:key="`winston-pile-${index}`"
						class="winston-pile"
						:class="{ 'winston-current-pile': index === winstonDraftState.currentPile }"
					>
						<template
							v-if="userID === winstonDraftState.currentPlayer && index === winstonDraftState.currentPile"
						>
							<div class="card-column winstom-card-column">
								<card
									v-for="card in pile"
									:key="card.uniqueID"
									:card="card"
									:language="language"
								></card>
							</div>
							<div class="winston-current-pile-options">
								<button class="confirm" @click="winstonDraftTakePile">Take Pile</button>
								<button class="stop" @click="winstonDraftSkipPile" v-if="winstonCanSkipPile">
									Skip Pile
									<span v-show="index === 2">and Draw</span>
								</button>
							</div>
						</template>
						<template v-else>
							<div class="card-column winstom-card-column">
								<div v-for="card in pile" :key="card.uniqueID" class="card">
									<card-placeholder></card-placeholder>
								</div>
							</div>
							<div class="winston-pile-status" v-show="index === winstonDraftState.currentPile">
								{{ userByID[winstonDraftState.currentPlayer].userName }} is looking at this pile...
							</div>
						</template>
					</div>
				</div>
			</div>
			<!-- Grid Draft -->
			<div v-if="draftingState === DraftState.GridPicking || draftingState === DraftState.GridWaiting">
				<div class="section-title">
					<h2>Grid Draft</h2>
					<div class="controls">
						<span>
							Pack #{{
								Math.min(Math.floor(gridDraftState.round / 2) + 1, gridDraftState.boosterCount)
							}}/{{ gridDraftState.boosterCount }}
						</span>
						<span>
							<template v-if="userID === gridDraftState.currentPlayer">
								<i class="fas fa-exclamation-circle"></i> It's your turn! Pick a column or a row.
							</template>
							<template v-else-if="gridDraftState.currentPlayer === null">
								<template v-if="Math.floor(gridDraftState.round / 2) + 1 > gridDraftState.boosterCount">
									This was the last booster! Let me push these booster wrappers off the table...
								</template>
								<template v-else>Advancing to the next booster...</template>
							</template>
							<template v-else>
								<i class="fas fa-spinner fa-spin"></i>
								Waiting for
								{{
									gridDraftState.currentPlayer in userByID
										? userByID[gridDraftState.currentPlayer].userName
										: "(Disconnected)"
								}}...
							</template>
						</span>
					</div>
				</div>
				<grid-draft
					:state="gridDraftState"
					:picking="userID === gridDraftState.currentPlayer"
					@pick="gridDraftPick"
				></grid-draft>
			</div>
			<!-- Rochester Draft -->
			<div v-if="draftingState === DraftState.RochesterPicking || draftingState === DraftState.RochesterWaiting">
				<div class="section-title controls">
					<h2>Rochester Draft</h2>
					<div class="controls">
						<span>
							Pack #{{ rochesterDraftState.boosterNumber + 1 }}/{{ rochesterDraftState.boosterCount }},
							Pick #{{ rochesterDraftState.pickNumber + 1 }}
						</span>
						<template v-if="userID === rochesterDraftState.currentPlayer">
							<span><i class="fas fa-exclamation-circle"></i> It's your turn! Pick a card. </span>
							<span>
								<input
									type="button"
									@click="pickCard"
									value="Confirm Pick"
									v-if="selectedCards.length === cardsToPick"
								/>
							</span>
						</template>
						<template v-else>
							<span>
								<i class="fas fa-spinner fa-spin"></i>
								Waiting for
								{{
									rochesterDraftState.currentPlayer in userByID
										? userByID[rochesterDraftState.currentPlayer].userName
										: "(Disconnected)"
								}}...
							</span>
						</template>
					</div>
				</div>
				<transition-group name="fade" tag="div" class="booster card-container">
					<template v-if="userID === rochesterDraftState.currentPlayer">
						<booster-card
							v-for="card in rochesterDraftState.booster"
							:key="`card-booster-${card.uniqueID}`"
							:card="card"
							:language="language"
							:canbeburned="false"
							:class="{ selected: selectedCards.includes(card) }"
							@click.native="selectCard($event, card)"
							@dblclick.native="doubleClickCard($event, card)"
							draggable
							@dragstart.native="dragBoosterCard($event, card)"
						></booster-card>
					</template>
					<template v-else>
						<booster-card
							v-for="card in rochesterDraftState.booster"
							:key="`card-booster-${card.uniqueID}`"
							:card="card"
							:language="language"
						></booster-card>
					</template>
				</transition-group>
			</div>
		</template>

		<!-- Brewing controls (Deck & Sideboard) -->
		<div
			class="container deck-container"
			v-show="
				(deck !== undefined && deck.length > 0) ||
				(drafting && draftingState !== DraftState.Watching) ||
				draftingState == DraftState.Brewing
			"
		>
			<div class="deck">
				<card-pool
					:cards="deck"
					:language="language"
					:click="deckToSideboard"
					ref="deckDisplay"
					group="deck"
					@dragover.native="allowBoosterCardDrop($event)"
					@drop.native="dropBoosterCard($event)"
				>
					<template v-slot:title>
						Deck ({{ deck.length
						}}<span
							v-show="draftingState == DraftState.Brewing && totalLands > 0"
							v-tooltip="'Added basics on export (Not shown in decklist below).'"
						>
							+ {{ totalLands }}</span
						>)
					</template>
					<template v-slot:controls>
						<button
							v-if="deck.length > 0"
							type="button"
							@click="exportDeck"
							v-tooltip="'Export deck and sideboard'"
						>
							<i class="fas fa-clipboard-list"></i> Export Deck to MTGA
						</button>
						<button
							v-if="deck.length > 0"
							type="button"
							@click="exportDeck(false)"
							v-tooltip="'Export without set information'"
						>
							<i class="fas fa-clipboard"></i> Export (Simple)
						</button>
						<button
							v-if="deck.length > 0 && currentDraftLog"
							type="button"
							@click="shareDecklist()"
							v-tooltip="'Share deck, lands, and sideboard with other players in your session.'"
						>
							<i class="fas fa-share-square"></i> Share
						</button>
						<i
							class="fas fa-chart-pie fa-lg clickable"
							@click="displayedModal = 'deckStats'"
							v-tooltip="'Deck Statistics'"
						></i>
						<land-control
							v-show="draftingState == DraftState.Brewing"
							:lands="lands"
							:autoland.sync="autoLand"
							@update:lands="(c, n) => (lands[c] = n)"
						>
						</land-control>
					</template>
					<template v-slot:empty>
						<h3>Your deck is currently empty!</h3>
						<p>Click on cards in your sideboard to move them here.</p>
					</template>
				</card-pool>
			</div>
			<!-- Collapsed Sideboard -->
			<div
				v-if="
					collapseSideboard &&
					((sideboard != undefined && sideboard.length > 0) ||
						(drafting && draftingState !== DraftState.Watching) ||
						draftingState == DraftState.Brewing)
				"
				class="collapsed-sideboard"
			>
				<div class="section-title">
					<h2>Sideboard ({{ sideboard.length }})</h2>
					<div class="controls">
						<i
							class="far fa-window-maximize clickable"
							@click="collapseSideboard = false"
							v-tooltip="'Maximize sideboard'"
						></i>
					</div>
				</div>
				<div
					class="card-container"
					@dragover="allowBoosterCardDrop($event)"
					@drop="dropBoosterCard($event, { toSideboard: true })"
				>
					<draggable
						:key="`${_uid}_col`"
						class="card-column drag-column"
						:list="sideboard"
						group="deck"
						@change="$refs.sideboardDisplay.sync() /* Sync sideboard card-pool */"
						drag-class="drag"
					>
						<card
							v-for="card in sideboard"
							:key="`${_uid}_card_${card.uniqueID}`"
							:card="card"
							:language="language"
							@click="sideboardToDeck($event, card)"
						></card>
					</draggable>
				</div>
			</div>
		</div>
		<!-- Full size Sideboard -->
		<div
			v-show="
				!collapseSideboard &&
				((sideboard != undefined && sideboard.length > 0) ||
					(drafting && draftingState !== DraftState.Watching) ||
					draftingState == DraftState.Brewing)
			"
			class="container"
		>
			<card-pool
				:cards="sideboard"
				:language="language"
				:click="sideboardToDeck"
				ref="sideboardDisplay"
				group="deck"
				@dragover.native="allowBoosterCardDrop($event)"
				@drop.native="dropBoosterCard($event, { toSideboard: true })"
			>
				<template v-slot:title> Sideboard ({{ sideboard.length }}) </template>
				<template v-slot:controls>
					<i
						class="fas fa-columns clickable"
						@click="collapseSideboard = true"
						v-tooltip="'Minimize sideboard'"
					></i>
				</template>
				<template v-slot:empty>
					<h3>Your sideboard is currently empty!</h3>
					<p>Click on cards in your deck to move them here.</p>
				</template>
			</card-pool>
		</div>

		<div class="welcome" v-if="draftingState === undefined">
			<h1>Welcome to MTGADraft!</h1>
			<p class="important">
				Draft with other players and export your resulting deck to Magic: The Gathering Arena to play with them,
				in pod!
			</p>
			<div class="welcome-cols">
				<div class="welcome-col">
					<div class="container" v-if="userID !== sessionOwner && sessionOwner in userByID">
						<div class="section-title">
							<h2>Wait for {{ userByID[sessionOwner].userName }}</h2>
						</div>
						<div class="welcome-section">
							{{ userByID[sessionOwner].userName }} is the session owner
							<i class="fas fa-crown subtle-gold"></i>. Wait for them to select the options and launch a
							game! <br />You can still customize your personal options on top of the page. <br />Or, to
							make a new session that you own, change Session ID in the top left.
						</div>
					</div>
					<div class="container" v-else>
						<div class="section-title">
							<h2>Basic setup</h2>
						</div>
						<div class="welcome-section">
							One player takes the role of owner of the session (designated with
							<i class="fas fa-crown subtle-gold"></i>
							).
							<ol>
								<li>Session owner chooses an arbitrary Session ID.</li>
								<li>
									Other players join the session by entering its ID or by following the
									<a @click="sessionURLToClipboard">
										Session Link
										<i class="fas fa-share-square"></i>
									</a>
									.
								</li>
								<li>
									Owner sets the desired options. (Take a look at
									<a @click="displayedModal = 'sessionOptions'">all of them</a>
									.)
								</li>
								<li>
									Once everyone is ready (use the ready check
									<i class="fas fa-user-check"></i>
									to make sure!), session owner launches the desired game mode.
								</li>
							</ol>
						</div>
					</div>
					<div class="container">
						<div class="section-title">
							<h2>Collection Import</h2>
						</div>
						<div class="welcome-section">
							Each player can import their MTGA collection to restrict the card pool to cards already
							owned by everyone. (Session owner can bypass this feature by enabling "Ignore Collections"):
							<ol>
								<li>
									Enable Detailed logs in game, the toggle can be found in Options > View Account >
									Detailed Logs (Plugin Support), importing your collection won't work without this
									activated.
								</li>
								<li>
									<a onclick="document.querySelector('#file-input').click()">Upload your MTGA log</a>
									file "Player.log" located in
									<tt
										class="clickable"
										@click="logPathToClipboard"
										v-tooltip="'Copy path to clipboard'"
										>C:\Users\%username%\AppData\LocalLow\Wizards Of The Coast\MTGA\</tt
									>
									(Note:
									<a
										href="https://support.microsoft.com/en-us/help/14201/windows-show-hidden-files"
										target="_blank"
									>
										AppData folder is hidden by default
										<i class="fas fa-external-link-alt"></i>
									</a>
									).
								</li>
							</ol>
						</div>
					</div>
					<div class="container">
						<div class="section-title">
							<h2>Help</h2>
						</div>
						<div class="welcome-section">
							Visit the
							<a @click="displayedModal = 'help'">FAQ / Help</a>
							section.
							<br />For any question/bug report/feature request you can email to
							<a href="mailto:mtgadraft@gmail.com">mtgadraft@gmail.com</a>
							or join the
							<a href="https://discord.gg/XscXXNw">MTGADraft Discord</a>.
						</div>
					</div>
				</div>
				<div class="welcome-col">
					<div class="container">
						<div class="section-title">
							<h2>Public Sessions</h2>
						</div>
						<div class="welcome-section">
							<div v-if="userID === sessionOwner" style="display: flex">
								<button @click="isPublic = !isPublic">
									Set session as {{ isPublic ? "Private" : "Public" }}
								</button>
								<delayed-input
									style="flex-grow: 1"
									v-model="description"
									type="text"
									placeholder="Enter a description for your session"
									maxlength="70"
								/>
							</div>

							<p v-if="publicSessions.length === 0" style="text-align: center">No public sessions</p>
							<table v-else class="public-sessions">
								<thead>
									<tr>
										<th>ID</th>
										<th>Set</th>
										<th>Players</th>
										<th>Description</th>
										<th>Join</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="s in publicSessions" :key="s.id">
										<td :title="s.id" class="id">{{ s.id }}</td>
										<td
											v-tooltip="
												s.cube
													? 'Cube'
													: s.sets.map((code) => setsInfos[code].fullName).join(', ')
											"
										>
											<template v-if="s.cube">
												<img src="./assets/img/cube.png" class="set-icon" />
											</template>
											<template v-else-if="s.sets.length === 1">
												<img :src="setsInfos[s.sets[0]].icon" class="set-icon" />
											</template>
											<template v-else-if="s.sets.length === 0">All</template>
											<template v-else>[{{ s.sets.length }}]</template>
										</td>
										<td>{{ s.players }} / {{ s.maxPlayers }}</td>
										<td class="desc">{{ s.description }}</td>
										<td>
											<button v-if="s.id !== sessionID" @click="sessionID = s.id">Join</button>
											<i
												class="fas fa-check green"
												v-tooltip="`You are in this session!`"
												v-else
											></i>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
					<div class="container">
						<div class="section-title">
							<h2>News</h2>
						</div>
						<div class="welcome-section">
							<em>November 06, 2020</em>
							<ul>
								<li>
									Implemented support for cards outside of MtG: Arena! Try drafting some
									<img
										data-v-7f621d22=""
										src="img/sets/mb1.svg"
										class="set-icon"
										style="--invertedness: 100%"
									/>
									Mystery Boosters or any Vintage Cube! This is a massive rewrite, so if you spot any
									problem, please get in touch via email or
									<a href="https://discord.gg/XscXXNw" target="_blank">our Discord</a>.
								</li>
								<li>Added a new setting allowing for multiple picks per pack.</li>
							</ul>
							<em>October 9, 2020</em>
							<ul>
								<li>
									Deck sharing now lets you show your deck to other players and viewers of the
									read-only bracket.
								</li>
							</ul>
						</div>
					</div>
					<div class="container">
						<div class="section-title">
							<h2>Tools</h2>
						</div>
						<div class="welcome-section">
							<ul>
								<li><a @click="displayedModal = 'importdeck'">Import deck list</a></li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>

		<modal v-if="displayedModal === 'help'" @close="displayedModal = ''">
			<h2 slot="header">Help</h2>
			<div slot="body">
				<h2>FAQ</h2>
				<div>
					<strong>Can we play cube?</strong>
					<p>
						Yes! You can import custom list of cards in text format in the options.
						<a href="cubeformat.html" target="_blank">More informations here</a>
						.
					</p>
				</div>
				<h2>Options Description</h2>
				<div class="help-options">
					<div style="width: 50%">
						<strong>Session options</strong>
						(Only accessible to the session owner, shared by everyone in your session)
						<ul>
							<li>
								<span class="option-name">Ignore Collections</span>
								: Draft with all cards of the selected set(s), ignoring player collections and
								preferences.
							</li>
							<li>
								<span class="option-name">Set(s)</span>
								: Select one or multiple sets to draft using only with cards from these sets.
							</li>
							<li>
								<span class="option-name">Bots</span>
								: Adds virtual players to your draft. They are
								<strong>pretty dumb</strong>
								, but they are doing their best :(
							</li>
							<li>
								<span class="option-name">Pick Timer</span>
								: Maximum time in seconds allowed to pick a card in each booster. 0 means the timer is
								disabled.
							</li>
						</ul>
						Click on
						<span @click="displayedModal = 'sessionOptions'" class="clickable">
							More
							<i class="fa-bars fa"></i>
						</span>
						for some additional options:
						<ul>
							<li>
								<span class="option-name">Public</span>
								: Flags your session as public. It will appear in the "Public Sessions" menu so anyone
								can directly join.
							</li>
							<li>
								<span class="option-name">Color Balance</span>
								: If set, the system will attempt to smooth out the color distribution in each pack, as
								opposed to being completely random. (Also affects sealed and cube)
							</li>
							<li>
								<span class="option-name">Custom card list</span>
								: Submit a custom card list (one English card name by line) to draft your own cube.
								(Collections are ignored in this mode)
								<a href="cubeformat.html" target="_blank">More information here</a>
							</li>
							<li>
								<span class="option-name">Foil</span>
								: If enabled, each pack will have a chance to contain a 'foil' card of any rarity in
								place of one common.
							</li>
						</ul>
					</div>
					<div style="width: 50%">
						<strong>Personal options</strong>
						<ul>
							<li>
								<span class="option-name">Language</span>
								: Adjusts the display language of cards. (Only affects cards)
							</li>
							<li>
								<span class="option-name">Restrict to Collection</span>
								: If unchecked, your collection will not limit the cards available in the selected sets.
								If every players unchecks this, you will draft using every cards. (Ignored if "Ignore
								Collections" is enabled in the session, or when using a Custom Card List)
							</li>
							<li>
								<span class="option-name">Pick on Double Click</span>
								: Allows you to double click on booster cards during draft to pick without having to
								confirm.
							</li>
							<li>
								<span class="option-name">Notifications</span>
								: If enabled, you will be notified when a draft is launched.
							</li>
							<li>
								<span class="option-name">Session ID</span>
								: A unique identifier for your session, you can use any name, just make sure to use the
								same as your friends to play with them!
							</li>
						</ul>
					</div>
				</div>
			</div>
		</modal>
		<modal v-if="displayedModal === 'importdeck'" @close="displayedModal = ''">
			<h2 slot="header">Import Deck List</h2>
			<div slot="body">
				<form @submit.prevent="importDeck">
					<div>
						<textarea placeholder="Paste list here..." rows="15" cols="40" id="decklist-text"></textarea>
					</div>
					<div><button type="submit">Import</button></div>
				</form>
			</div>
		</modal>
		<modal v-if="displayedModal === 'setRestriction'" @close="displayedModal = ''">
			<h2 slot="header">Card Pool</h2>
			<set-restriction slot="body" v-model="setRestriction"></set-restriction>
		</modal>
		<modal v-if="displayedModal === 'draftLogs' && draftLogs" @close="displayedModal = ''">
			<h2 slot="header">Draft Logs</h2>
			<draft-log-history
				slot="body"
				:draftLogs="draftLogs"
				:language="language"
				@sharelog="shareSavedDraftLog"
				@storelogs="storeDraftLogs"
			></draft-log-history>
		</modal>
		<modal v-if="displayedModal === 'collection'" @close="displayedModal = ''">
			<h2 slot="header">Collection Statistics</h2>
			<collection slot="body" :collection="collection" :language="language"></collection>
		</modal>
		<modal v-if="displayedModal === 'sessionOptions'" @close="displayedModal = ''">
			<h2 slot="header">Additional Session Options</h2>
			<div slot="body" class="session-options-container" :class="{ disabled: userID != sessionOwner }">
				<div class="option-column option-column-left">
					<div
						class="line"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content: '<p>Share this session ID with everyone.</p>',
						}"
					>
						<label for="is-public">Public</label>
						<div class="right">
							<input type="checkbox" v-model="isPublic" id="is-public" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content:
								'<p>Public description for your session. Ex: Peasant Cube, will launch at 8pm. Matches played on Arena.</p>',
						}"
					>
						<label for="session-desc">Description</label>
						<div class="right">
							<delayed-input
								id="session-desc"
								v-model="description"
								type="text"
								placeholder="Session public description"
								maxlength="70"
								style="width: 90%"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content: '<p>Is the session owner participating?</p>',
						}"
					>
						<label for="is-owner-player">Session owner is playing</label>
						<div class="right">
							<input type="checkbox" v-model="ownerIsPlayer" id="is-owner-player" />
						</div>
					</div>
					<div class="line" v-bind:class="{ disabled: teamDraft }">
						<label for="max-players">Maximum Players</label>
						<div class="right">
							<input
								class="small-number-input"
								type="number"
								id="max-players"
								min="1"
								step="1"
								v-model.number="maxPlayers"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content:
								'<p>If set, the system will attempt to smooth out the color distribution in each pack, as opposed to being completely random.</p>',
						}"
					>
						<label for="color-balance">Color Balance</label>
						<div class="right">
							<input type="checkbox" v-model="colorBalance" id="color-balance" />
						</div>
					</div>
					<div
						class="line"
						v-bind:class="{ disabled: useCustomCardList }"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content:
								'<p>If enabled (default) Rares can be promoted to a Mythic at a 1/8 rate.</p><p>Disabled for Custom Card Lists.</p>',
						}"
					>
						<label for="mythic-promotion">Rare promotion to Mythic</label>
						<div class="right">
							<input type="checkbox" v-model="mythicPromotion" id="mythic-promotion" />
						</div>
					</div>
					<div
						class="option-section"
						v-bind:class="{ disabled: useCustomCardList }"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content:
								'<p>Lets you customize the exact content of your boosters.</p><p>Notes:<ul><li>Zero is a valid value (useful for Pauper or Artisan for example).</li><li>A land slot will be automatically added for some sets.</li><li>Unused when drawing from a custom card list: See the advanced card list syntax to mimic it.</li></ul></p>',
						}"
					>
						<div class="option-column-title">Booster Content</div>
						<div class="line" v-for="r in ['common', 'uncommon', 'rare']" :key="r">
							<label :for="'booster-content-' + r" class="capitalized">{{ r }}s</label>
							<div class="right">
								<input
									class="small-number-input"
									type="number"
									:id="'booster-content-' + r"
									min="0"
									max="16"
									step="1"
									v-model.number="boosterContent[r]"
									@change="if (boosterContent[r] < 0) boosterContent[r] = 0;"
								/>
							</div>
						</div>
					</div>
					<div
						class="option-section"
						v-bind:class="{ disabled: useCustomCardList }"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content:
								'<p>Sets a duplicate limit for each rarity across the entire draft. Only used if no player collection is used to limit the card pool. Default: Off.</p>',
						}"
					>
						<div class="option-column-title">
							<input
								type="checkbox"
								:checked="maxDuplicates !== null"
								@click="toggleLimitDuplicates"
							/><label for="max-duplicate-title">Limit duplicates</label>
						</div>
						<template v-if="maxDuplicates !== null">
							<div class="line" v-for="r in Object.keys(maxDuplicates)" :key="r">
								<label :for="'max-duplicates-' + r" class="capitalized">{{ r }}s</label>
								<div class="right">
									<input
										class="small-number-input"
										type="number"
										:id="'max-duplicates-' + r"
										min="1"
										max="16"
										step="1"
										v-model.number="maxDuplicates[r]"
										@change="if (maxDuplicates[r] < 1) maxDuplicates[r] = 1;"
									/>
								</div>
							</div>
						</template>
					</div>
					<div
						class="line"
						v-bind:class="{ disabled: useCustomCardList }"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content:
								'<p>If enabled, each pack will have a chance to contain a \'foil\' card of any rarity in place of one common.</p>',
						}"
					>
						<label for="option-foil">Foil</label>
						<div class="right">
							<input type="checkbox" v-model="foil" id="option-foil" />
						</div>
					</div>
				</div>
				<div class="option-column option-column-right">
					<h4>Draft Specific Options</h4>
					<div
						class="line"
						v-tooltip.right="{
							classes: 'option-tooltip',
							content:
								'<p>Team Draft, which is a 6-player, 3v3 mode where teams alternate seats.</p><p>This creates a bracket where you face each player on the other team.</p>',
						}"
					>
						<label for="team-draft">Team Draft</label>
						<div class="right">
							<input type="checkbox" id="team-draft" v-model="teamDraft" />
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							classes: 'option-tooltip',
							content: '<p>Draft: Boosters per Player; default is 3.</p>',
						}"
					>
						<label for="boosters-per-player">Boosters per Player</label>
						<div class="right">
							<input
								type="number"
								id="boosters-per-player"
								class="small-number-input"
								min="1"
								max="25"
								step="1"
								v-model.number="boostersPerPlayer"
								@change="if (boostersPerPlayer < 0) boostersPerPlayer = 1;"
							/>
						</div>
					</div>
					<div class="option-section" v-bind:class="{ disabled: useCustomCardList }">
						<div class="option-column-title">Individual Booster Set</div>
						<div
							class="line"
							v-tooltip.right="{
								classes: 'option-tooltip',
								content:
									'<p>Controls how the boosters will be distributed. This setting will have no effect if no individual booster rules are specified below.</p><ul><li>Regular: Every player will receive boosters from the same sets and will open them in the specified order.</li><li>Shuffle Player Boosters: Each player will receive boosters from the same sets but will open them in a random order.</li><li>Shuffle Booster Pool: Boosters will be shuffled all together and randomly handed to each player.</li></ul>',
							}"
						>
							<label for="distribution-mode">Distribution Mode</label>
							<select
								class="right"
								v-model="distributionMode"
								name="distributionMode"
								id="distribution-mode"
							>
								<option value="regular">Regular</option>
								<option value="shufflePlayerBoosters">Shuffle Player Boosters</option>
								<option value="shuffleBoosterPool">Shuffle Booster Pool</option>
							</select>
						</div>
						<div
							v-tooltip.right="{
								classes: 'option-tooltip',
								content:
									'<p>Specify the set of indiviual boosters handed to each player. Useful for classic Chaos Draft or Ixalan/Rivals of Ixalan draft for example.</p><p>Note: Collections are ignored for each booster with any other value than (Default).</p>',
							}"
						>
							<div v-for="(value, index) in customBoosters" class="line" :key="index">
								<label for="customized-booster">Booster #{{ index + 1 }}</label>
								<select class="right" v-model="customBoosters[index]">
									<option value>(Default)</option>
									<option value="random">Random Set from Card Pool</option>
									<option style="color: #888" disabled>————————————————</option>
									<option v-for="code in sets.slice().reverse()" :value="code" :key="code">
										{{ setsInfos[code].fullName }}
									</option>
									<option style="color: #888" disabled>————————————————</option>
									<option
										v-for="code in primarySets.filter((s) => !sets.includes(s))"
										:value="code"
										:key="code"
									>
										{{ setsInfos[code].fullName }}
									</option>
								</select>
							</div>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							classes: 'option-tooltip',
							content:
								'<p>Number of cards to pick from each booster. Useful for Commander Legends for example (2 cards per booster).</p><p>Default is 1.</p>',
						}"
					>
						<label for="picked-cards-per-round">Picked cards per booster</label>
						<div class="right">
							<input
								type="number"
								id="picked-cards-per-round"
								class="small-number-input"
								min="1"
								step="1"
								v-model.number="pickedCardsPerRound"
								@change="if (pickedCardsPerRound < 1) pickedCardsPerRound = 1;"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							classes: 'option-tooltip',
							content:
								'<p>In addition to picking a card, you will also remove this number of cards from the same booster.</p><p>This is typically used in conjunction with a higher count of boosters per player for drafting with 2 to 4 players. Burn or Glimpse Draft is generally 9 boosters per player with 2 cards being burned in addition to a pick.</p><p>Default is 0.</p>',
						}"
					>
						<label for="burned-cards-per-round">Burned cards per booster</label>
						<div class="right">
							<input
								type="number"
								id="burned-cards-per-round"
								class="small-number-input"
								min="0"
								max="24"
								step="1"
								v-model.number="burnedCardsPerRound"
								@change="if (burnedCardsPerRound < 0) burnedCardsPerRound = 0;"
							/>
						</div>
					</div>
					<div
						class="line"
						v-tooltip.right="{
							classes: 'option-tooltip',
							content:
								'<p>Controls who is going to receive the draft logs.</p><p>\'Owner only, delayed\': Owner will choose when to reveal the draft log. Useful for tournaments.</p>',
						}"
					>
						<label for="draft-log-recipients">Send draft logs to</label>
						<div class="right">
							<select v-model="draftLogRecipients" id="draft-log-recipients">
								<option value="everyone">Everyone</option>
								<option value="owner">Owner only</option>
								<option value="delayed">Owner only, delayed</option>
								<option value="none">No-one</option>
							</select>
						</div>
					</div>
				</div>
				<div class="option-section option-custom-card-list">
					<div class="option-column-title">Custom Card List</div>
					<div style="display: flex; justify-content: space-between; align-items: center">
						<div
							v-tooltip.left="{
								classes: 'option-tooltip',
								content: '<p>Use a custom card list (aka Cube).</p>',
							}"
						>
							<input type="checkbox" v-model="useCustomCardList" id="use-custom-card-list" />
							<label for="use-custom-card-list">Use a Custom Card List</label>
						</div>
						<div>
							<button @click="importCubeCobra">
								<img class="set-icon" src="./assets/img/cubecobra-small-logo.png" />
								Import From Cube Cobra
							</button>
						</div>
						<div v-if="customCardList.length > 0">
							<i
								class="fas fa-check green"
								v-if="useCustomCardList"
								v-tooltip="'Card list successfuly loaded!'"
							></i>
							<i
								class="fas fa-check yellow"
								v-else
								v-tooltip="'Card list successfuly loaded, but not used.'"
							></i>
							<span v-if="customCardList.name"
								>Loaded '{{ customCardList.name }}' ({{ customCardList.length }} cards).</span
							>
							<span v-else>Loaded list with {{ customCardList.length }} cards.</span>
							<button @click="displayedModal = 'cardList'">
								<i class="fas fa-file-alt"></i>
								Review.
							</button>
						</div>
					</div>
					<input
						type="file"
						id="card-list-input"
						@change="uploadFile($event, parseCustomCardList)"
						style="display: none"
						accept=".txt"
					/>
					<div
						class="file-drop clickable"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content:
								'<p>Upload any card list from your computer.</p><p>You can use services like Cube Cobra to find cubes or craft your own list and export it to .txt.</p>',
						}"
						@drop="dropCustomList"
						onclick="document.querySelector('#card-list-input').click()"
						@dragover="
							$event.preventDefault();
							$event.target.classList.add('dropzone-highlight');
						"
					>
						Upload a Custom Card List file by dropping it here or by clicking to browse your computer.
					</div>
					<div
						class="option-cube-select"
						v-tooltip.left="{
							classes: 'option-tooltip',
							content: '<p>Load a pre-built cube from a curated list.</p>',
						}"
					>
						<label for="curated-cubes">Load a Pre-Build Cube:</label>
						<select name="featured-cubes" id="curated-cubes" v-model="selectedCube">
							<option v-for="cube in cubeLists" :key="cube.filename" :value="cube">
								{{ cube.name }}
								<span v-if="cube.cubeCobraID" style="font-size: 0.75em">(Cube Cobra)</span>
							</option>
						</select>
						<button @click="selectCube(selectedCube)" style="min-width: auto">
							<img
								v-if="selectedCube.cubeCobraID"
								class="set-icon"
								src="./assets/img/cubecobra-small-logo.png"
							/>
							Load Cube
						</button>
					</div>
					<div class="option-cube-infos" v-if="selectedCube">
						<strong>{{ selectedCube.name }}</strong>
						<div v-if="selectedCube.cubeCobraID">
							<a
								:href="`https://cubecobra.com/cube/overview/${selectedCube.cubeCobraID}`"
								target="_blank"
							>
								<img class="set-icon" src="./assets/img/cubecobra-small-logo.png" />
								Cube Cobra page
							</a>
						</div>
						<div v-if="selectedCube.description" v-html="selectedCube.description"></div>
					</div>
					<div class="option-info">
						You can find more cubes or craft your own on
						<a href="https://www.cubetutor.com/" target="_blank">Cube Tutor</a>
						or
						<a href="https://cubecobra.com/" target="_blank">Cube Cobra</a>
						<br />Customize your list even further by using all features of the
						<a href="cubeformat.html" target="_blank">
							<i class="fas fa-external-link-alt"></i>
							format
						</a>
					</div>
				</div>
			</div>
		</modal>
		<modal v-if="displayedModal === 'bracket'" @close="displayedModal = ''">
			<h2 slot="header">Bracket</h2>
			<bracket
				slot="body"
				:bracket="bracket"
				:teamDraft="teamDraft"
				:editable="userID === sessionOwner || !bracketLocked"
				:locked="bracketLocked"
				:fullcontrol="userID === sessionOwner"
				:sessionID="sessionID"
				:language="language"
				:draftlog="currentDraftLog"
				@updated="updateBracket"
				@generate="generateBracket"
				@generate-swiss="generateSwissBracket"
				@lock="lockBracket"
			></bracket>
		</modal>
		<modal v-if="displayedModal === 'deckStats'" @close="displayedModal = ''">
			<h2 slot="header">Deck Statistics</h2>
			<card-stats slot="body" :cards="deck" :addedbasics="totalLands"></card-stats>
		</modal>
		<modal v-if="displayedModal === 'cardList'" @close="displayedModal = ''">
			<h2 slot="header">Custom Card List Review</h2>
			<card-list slot="body" :cardlist="customCardList" :language="language" :collection="collection"></card-list>
		</modal>
		<modal v-if="displayedModal === 'About'" @close="displayedModal = ''">
			<h2 slot="header">About</h2>
			<div slot="body">
				<p>
					Developped by
					<a href="https://senryoku.github.io/" target="_blank">Senryoku</a>
					(contact in French or English:
					<a href="mailto:mtgadraft@gmail.com">mtgadraft@gmail.com</a>
					) using
					<a href="https://scryfall.com/">Scryfall</a>
					card data and images and loads of open source software.
				</p>
				<p>
					MTGADraft Discord:
					<a href="https://discord.gg/XscXXNw">https://discord.gg/XscXXNw</a>
				</p>
				<h3>Patch Notes</h3>
				<patch-notes></patch-notes>
			</div>
		</modal>
		<modal v-if="displayedModal === 'donation'" @close="displayedModal = ''">
			<h2 slot="header">Support me</h2>
			<div slot="body">
				<div style="max-width: 50vw">
					<p>Hello there!</p>
					<p>
						If you're here I guess you've been enjoing the site! I plan on continuously maintaining it by
						adding support for new cards appearing on MTGA and improving it, both with your and my ideas. If
						that sounds like a good use of my time and you want to help me stay motivated and high on
						cafeine, you can donate here via
						<em>PayPal</em>
						:
					</p>
					<form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank">
						<input type="hidden" name="cmd" value="_s-xclick" />
						<input type="hidden" name="hosted_button_id" value="6L2CUS6DH82DL" />
						<input type="hidden" name="lc" value="en_US" />
						<input
							type="image"
							src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif"
							name="submit"
							title="PayPal - The safer, easier way to pay online!"
							alt="Donate with PayPal button"
						/>
					</form>
					<p>Thank you very much!</p>
					<p>Sen</p>
				</div>
			</div>
		</modal>
		<footer>
			<span @click="displayedModal = 'About'" class="clickable">
				<a>About</a>
			</span>
			<span>
				Made by
				<a href="http://senryoku.github.io/" target="_blank">Senryoku</a>
			</span>
			<span>
				<a @click="displayedModal = 'donation'">
					Buy me a Coffee
					<i class="fa fa-mug-hot" aria-hidden="true"></i>
				</a>
			</span>
			<span>
				<a href="mailto:mtgadraft@gmail.com">Contact</a>
			</span>
			<span>
				Get
				<a href="https://magic.wizards.com/fr/mtgarena" target="_blank">Magic: The Gathering Arena</a>
			</span>
		</footer>
		<div
			class="disconnected-icon"
			v-if="socket && socket.disconnected"
			v-tooltip="
				'You are disconnected from the server, some functionnalities won\'t be available until the connection is re-established.'
			"
		>
			<i class="fas fa-exclamation-triangle"></i>
			Disconnected
		</div>
	</div>
</template>

<script src="./App.js"></script>

<style src="./css/style.css"></style>
<style src="./css/tooltip.css"></style>
<style src="./css/vue-multiselect.min.css"></style>
<style src="./css/app.css"></style>
<style src="./css/chat.css"></style>
