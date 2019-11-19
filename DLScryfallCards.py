import mmap
import json
import requests
import ijson
import os
import gzip
import urllib
import requests
import sys
import re
from itertools import groupby

BulkDataURL = 'https://archive.scryfall.com/json/scryfall-all-cards.json'
BulkDataPath = 'data/scryfall-all-cards.json'
BulkDataArenaPath = 'data/BulkArena.json'
CardDataPath = 'data/data_cards.json' # Card data directly from the devs
FinalDataPath = 'public/data/MTGACards.json'
SetsInfosPath = 'public/data/SetsInfos.json'
RatingsSources = [
				'data/LimitedRatings/LimitedCardRatingsELD_M20_WAR.html',
				'data/LimitedRatings/LimitedCardRatingsELD_M20_WAR2.html',
				'data/LimitedRatings/LimitedCardRatingsELD_M20_WAR3.html',
				'data/LimitedRatings/LimitedCardRatingsELD_M20_WAR4.html',
				'data/LimitedRatings/LimitedCardRatingsELD_M20_WAR5.html',
				'data/LimitedRatings/LimitedCardRatingsELD_M20_WAR6.html',
				'data/LimitedRatings/LimitedCardRatingsELD_M20_WAR7.html',
				'data/LimitedRatings/LimitedCardRatingsELD_M20_WAR8.html',
				'data/LimitedRatings/LimitedCardRatingsRNA_GRN_M19.html',
				'data/LimitedRatings/LimitedCardRatingsRNA_GRN_M192.html',
				'data/LimitedRatings/LimitedCardRatingsRNA_GRN_M193.html',
				'data/LimitedRatings/LimitedCardRatingsRNA_GRN_M194.html',
				'data/LimitedRatings/LimitedCardRatingsRNA_GRN_M195.html',
				'data/LimitedRatings/LimitedCardRatingsRNA_GRN_M196.html',
				'data/LimitedRatings/LimitedCardRatingsRNA_GRN_M197.html',
				'data/LimitedRatings/LimitedCardRatingsRNA_GRN_M198.html',
				'data/LimitedRatings/LimitedCardRatingsDOM_RIX_XLN.html',
				'data/LimitedRatings/LimitedCardRatingsDOM_RIX_XLN2.html',
				'data/LimitedRatings/LimitedCardRatingsDOM_RIX_XLN3.html',
				'data/LimitedRatings/LimitedCardRatingsDOM_RIX_XLN4.html',
				'data/LimitedRatings/LimitedCardRatingsDOM_RIX_XLN5.html',
				'data/LimitedRatings/LimitedCardRatingsDOM_RIX_XLN6.html',
				'data/LimitedRatings/LimitedCardRatingsDOM_RIX_XLN7.html'
]
RatingsDest = 'data/ratings.json'

ForceDownload = len(sys.argv) > 1 and sys.argv[1].lower() == "dl"
ForceParse = len(sys.argv) > 1 and sys.argv[1].lower() == "parse"
ForceRatings = len(sys.argv) > 1 and sys.argv[1].lower() == "ratings"

if not os.path.isfile(BulkDataPath) or ForceDownload:
	print("Downloading {}...".format(BulkDataURL))
	urllib.request.urlretrieve(BulkDataURL, BulkDataPath) 

if not os.path.isfile(BulkDataArenaPath) or ForceDownload:
	print("Extracting arena card to {}...".format(BulkDataArenaPath))
	with open(BulkDataPath, 'r', encoding="utf8") as file:
		objects = ijson.items(file, 'item')
		arena_cards = (o for o in objects if 'arena' in o['games'])
		cards = []
		
		sys.stdout.write("Processing... ")
		sys.stdout.flush()
		copied = 0
		for c in arena_cards:
			cards.append(c)
			copied += 1
			sys.stdout.write("\b" * 100) # return to start of line
			sys.stdout.write("Processing... " + str(copied) + " cards added...")
		sys.stdout.write("\b" * 100)
		sys.stdout.write(" " + str(copied) + " cards added.")
		
		with open(BulkDataArenaPath, 'w') as outfile:
			json.dump(cards, outfile)

CardRatings = {}
if not os.path.isfile(RatingsDest) or ForceRatings:
	for path in RatingsSources:
		with open(path, 'r', encoding="utf8") as file:
			text = file.read()
			text = text[text.find("table_card_rating_wrapper"):text.find("table_card_rating_previous")]
			matches = re.findall("<b>([^<]*)<\/b>", text)
			for i in range(0, len(matches), 2):
				try:
					matches[i+1] = float(matches[i+1])
				except ValueError:
					vals = matches[i+1].split(" // ")
					matches[i+1] = (float(vals[0]) + float(vals[1]))/2
				#print(matches[i] + " " + matches[i+1])
				CardRatings[matches[i]] = matches[i+1]
				
	with open(RatingsDest, 'w') as outfile:
		json.dump(CardRatings, outfile)
else:
	with open(RatingsDest, 'r', encoding="utf8") as file:
		CardRatings = json.loads(file.read())

if not os.path.isfile(FinalDataPath) or ForceDownload or ForceParse:
	# Tag non booster card as such
	print("Requesting non-booster cards list...")
	NonBoosterCards = []
	response = requests.get("https://api.scryfall.com/cards/search?{}".format(urllib.parse.urlencode({'q': 'game:arena -in:booster'})))
	data = json.loads(response.content)
	for c in data['data']:
		if('arena_id' in c):
			NonBoosterCards.append(c['arena_id'])
	while(data["has_more"]):
		response = requests.get(data["next_page"])
		data = json.loads(response.content)
		for c in data['data']:
			if('arena_id' in c):
				NonBoosterCards.append(c['arena_id'])

	print("Generating card data cache...")
	with open(CardDataPath, 'r', encoding="utf8") as devCardData:
		# List adventures to fix their IDs
		adventures = list(filter(lambda c : "frameDetails" in c and "adventure" in c["frameDetails"], json.loads(devCardData.read())))
		adventuresIds = {}
		for c in adventures:
			adventuresIds[c["grpid"]] = c["linkedFaces"][0]
		with open(BulkDataArenaPath, 'r', encoding="utf8") as file:
			cards = {}
			translations = {}
			translations_img = {}
			arena_cards = json.loads(file.read())
			for c in arena_cards:
				if c['name'] not in translations:
					translations[c['name']] = {}
				if c['name'] not in translations_img:
					translations_img[c['name']] = {}
				if 'arena_id' not in c:
					if 'printed_name' in c:
						translations[c['name']][c['lang']] = c['printed_name']
					elif 'card_faces' in c and 'printed_name' in c['card_faces'][0]:
						translations[c['name']][c['lang']] = c['card_faces'][0]['printed_name']
					if 'image_uris' in c and 'border_crop' in c['image_uris']:
						translations_img[c['name']][c['lang']] = c['image_uris']['border_crop']
					elif 'card_faces' in c and 'image_uris' in c['card_faces'][0] and 'border_crop' in c['card_faces'][0]['image_uris']:
						translations_img[c['name']][c['lang']] = c['card_faces'][0]['image_uris']['border_crop']
					continue
				if c['arena_id'] in adventuresIds:
					print(str(c['arena_id']) + " " + c['name'] + " in an adventure, fixing it.")
					c['arena_id'] = adventuresIds[c['arena_id']]
				if c['arena_id'] not in cards:
					cards[c['arena_id']] = {}
				if c['lang'] == 'en':
					selection = {key:value for key,value in c.items() if key in {'name', 'set', 'cmc', 'rarity', 'collector_number', 'color_identity'}}
					if selection['name'] in CardRatings:
						selection['rating'] = CardRatings[selection['name']]
					else:
						selection['rating'] = 0
					if c['arena_id'] in NonBoosterCards or 'Basic Land' in c['type_line']:
						selection['in_booster'] = False;
					if 'image_uris' in c and 'border_crop' in c['image_uris']:
						translations_img[c['name']][c['lang']] = c['image_uris']['border_crop']
					elif 'card_faces' in c and 'image_uris' in c['card_faces'][0] and 'border_crop' in c['card_faces'][0]['image_uris']:
						translations_img[c['name']][c['lang']] = c['card_faces'][0]['image_uris']['border_crop']
					translations[c['name']][c['lang']] = c['name']
					cards[c['arena_id']].update(selection)
			
			for k in cards:
				cards[k]['printed_name'] = translations[cards[k]['name']]
				cards[k]['image_uris'] = translations_img[cards[k]['name']]

			with open(FinalDataPath, 'w', encoding="utf8") as outfile:
				json.dump(cards, outfile, ensure_ascii=False)
			#with gzip.open(FinalDataPath+'.gzip', 'wt', encoding="utf8") as outfile:
			#	json.dump(cards, outfile, ensure_ascii=False)

setFullNames = {
	"ana": "Arena",
	"akh": "Amonkhet",
	"hou": "Hour of Devastation",
	"m19": "Core Set 2019",
	"xln": "Ixalan",
	"rix": "Rivals of Ixalan",
	"dom": "Dominaria",
	"grn": "Guilds of Ravnica",
	"rna": "Ravnica Allegiance",
	"war": "War of the Spark",
	"m20": "Core Set 2020",
	"eld": "Throne of Eldraine",
	"thb": "Theros: Beyond Death",
	"m21": "Core Set 2021",
}

print("Cards in database:")
with open(FinalDataPath, 'r', encoding="utf8") as file:
	data = json.loads(file.read())
	array = []
	for key, value in data.items():
		array.append(value)
	array.sort(key = lambda c: c['set'])
	groups = groupby(array, lambda c: c['set'])
	setinfos = {}
	for set, group in groups:
		cardList = list(group)
		setinfos[set] = {}
		if set in setFullNames:
			setinfos[set]["fullName"] = setFullNames[set]
		else:
			setinfos[set]["fullName"] = set
		setinfos[set]["cardCount"] = len(cardList)
		print('\t', set, ": ", len(cardList))
		cardList.sort(key = lambda c: c['rarity'])
		for rarity, rarityGroup in groupby(cardList, lambda c: c['rarity']):
			rarityGroupList = list(rarityGroup)
			setinfos[set][rarity + "Count"] = len(rarityGroupList)
			#print('\t\t {}: {}'.format(rarity, len(rarityGroupList)))
	with open(SetsInfosPath, 'w+', encoding="utf8") as setinfosfile:
		json.dump(setinfos, setinfosfile, ensure_ascii=False)
		