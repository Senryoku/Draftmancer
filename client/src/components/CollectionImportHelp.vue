<template>
	<div style="font-size: 1.1em" class="collection-import-help">
		<p>
			Each player can import their MTGA collection to restrict the card pool to cards they own. (Session owners
			can bypass this feature by enabling "Ignore Collections").
		</p>
		<p>
			With the August 2021 update, WotC disabled native collection export via their logs, requiring the use of an
			external service to generate your collection file. Vote for
			<a
				href="https://feedback.wizards.com/forums/918667-mtg-arena-bugs-product-suggestions/suggestions/44050746-broken-logs-in-2021-8-0-3855"
				target="_blank"
				rel="noopener nofollow"
			>
				this issue on Wizards' bug tracker
				<font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon>
			</a>
			if you want this to change.
		</p>
		<h3>Supported File Formats</h3>
		<ul>
			<li>
				Player.log MTGA log file
				<strong
					>with
					<a href="https://mtgarena.pro/mtga-pro-tracker/" target="_blank">MTGA Pro Tracker</a>
					installed</strong
				>
				(see instructions below)
			</li>
			<li>.txt card list in the MTGA format</li>
			<li>
				.csv file following the
				<a href="https://www.mtggoldfish.com/help/import_formats#mtggoldfish" target="_blank"
					>MTGGoldFish CSV format</a
				>
				(the
				<a href="https://mtgarena.pro/mtga-pro-tracker/" target="_blank">MTGA Pro Tracker</a> website exports to
				this format)
			</li>
		</ul>
		<h3>
			Player.log and
			<a href="https://mtgarena.pro/mtga-pro-tracker/" target="_blank">MTGA Pro Tracker</a>
		</h3>
		<ol>
			<li>
				Install
				<a href="https://mtgarena.pro/mtga-pro-tracker/" target="_blank">MTGA Pro Tracker</a> and launch it.
			</li>
			<li>
				Launch MTG Arena and enable "Detailed Logs". The toggle can be found in
				<em>Options > Account > Detailed Logs (Plugin Support)</em>.
			</li>
			<li>
				<a @click="$emit('uploadlogs')">Upload</a>
				your MTGA log file "Player.log". Its location is OS-specific: (Note on hidden system folders in
				<a
					href="https://support.microsoft.com/en-us/help/14201/windows-show-hidden-files"
					target="_blank"
					rel="noopener nofollow"
				>
					Windows <font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon>
				</a>
				and
				<a
					href="https://appletoolbox.com/how-to-show-your-user-library-in-macos-high-sierra-and-sierra/"
					target="_blank"
					rel="noopener nofollow"
				>
					macOS <font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon>
				</a>
				)
				<ul>
					<li>
						<font-awesome-icon icon="fa-brands fa-windows"></font-awesome-icon>
						<tt
							class="clickable"
							@click="
								$emit(
									'clipboard',
									'%userprofile%\\AppData\\LocalLow\\Wizards Of The Coast\\MTGA\\',
									'Default log path copied to clipboard! (Windows)'
								)
							"
							v-tooltip="'Copy Windows path to clipboard'"
						>
							C:\Users\%username%\AppData\LocalLow\Wizards Of The Coast\MTGA\</tt
						>
					</li>
					<li>
						<font-awesome-icon icon="fa-brands fa-apple"></font-awesome-icon>
						<tt
							class="clickable"
							@click="
								$emit(
									'clipboard',
									'~/Library/Logs/Wizards Of The Coast/MTGA/',
									'Default log path copied to clipboard! (macOS)'
								)
							"
							v-tooltip="'Copy macOS path to clipboard'"
						>
							Home/Library/Logs/Wizards Of The Coast/MTGA/
						</tt>
					</li>
				</ul>
				Copy the path and paste it in the file selection pop up with the help of a shortcut! (<font-awesome-icon
					icon="fa-brands fa-windows"
				></font-awesome-icon>
				<kbd> CTRL+L</kbd> / <font-awesome-icon icon="fa-brands fa-apple"></font-awesome-icon> <kbd>⇧⌘G</kbd>)
			</li>
		</ol>
	</div>
</template>
