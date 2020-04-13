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
				'data/LimitedRatings/LimitedCardRatingsDOM_RIX_XLN7.html',
				'data/LimitedRatings/Limited Card Ratings_THB.html'
]
RatingsDest = 'data/ratings.json'

ForceDownload = len(sys.argv) > 1 and sys.argv[1].lower() == "dl"
ForceExtract = len(sys.argv) > 1 and sys.argv[1].lower() == "extract"
ForceCache = len(sys.argv) > 1 and sys.argv[1].lower() == "cache"
ForceRatings = len(sys.argv) > 1 and sys.argv[1].lower() == "ratings"

MTGALocFile = "S:\MtGA\MTGA_Data\Downloads\Data\data_loc_d7ec9d0fe5c0df6cdc1bc55ab8d24f60.mtga"
MTGACardsFile = "S:\MtGA\MTGA_Data\Downloads\Data\data_cards_8389ad05decfccb69a89b895d062f4a2.mtga"
MTGALocalization = {}
with open(MTGALocFile, 'r', encoding="utf8") as file:
	locdata = json.load(file)
	for o in locdata[0]['keys']:
		MTGALocalization[o['id']] = o['text']

MTGADataDebug = {}
CardsCollectorNumberAndSet = {}
with open(MTGACardsFile, 'r', encoding="utf8") as file:
	carddata = json.load(file)
	for o in carddata:
		if o['isPrimaryCard']:
			o['set'] = o['set'].lower()
			if o['set'] == 'conf':
				o['set'] = 'con'
			if o['set'] == 'dar':
				o['set'] = 'dom'
			MTGADataDebug[(MTGALocalization[o['titleId']], o['CollectorNumber'], o['set'].lower())] = o['grpid']
			CardsCollectorNumberAndSet[(o['CollectorNumber'], o['set'].lower())]  = o['grpid']
		
with open('data/MTGADataDebug.json', 'w') as outfile:
	MTGADataDebugToJSON = {}
	for key in MTGADataDebug.keys():
		MTGADataDebugToJSON[str(key)] = MTGADataDebug[key]
	json.dump(MTGADataDebugToJSON, outfile, sort_keys=True, indent=4)

if not os.path.isfile(BulkDataPath) or ForceDownload:
	print("Downloading {}...".format(BulkDataURL))
	urllib.request.urlretrieve(BulkDataURL, BulkDataPath) 

if not os.path.isfile(BulkDataArenaPath) or ForceExtract:
	print("Extracting arena card to {}...".format(BulkDataArenaPath))
	with open(BulkDataPath, 'r', encoding="utf8") as file:
		objects = ijson.items(file, 'item')
		arena_cards = (o for o in objects if (o['collector_number'], o['set'].lower()) in CardsCollectorNumberAndSet)
		cards = []
		
		sys.stdout.write("Processing... ")
		sys.stdout.flush()
		copied = 0
		for c in arena_cards:
			c['arena_id'] = CardsCollectorNumberAndSet[(c['collector_number'], c['set'].lower())]
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
					if len(vals) != 2:
						vals = matches[i+1].split(" //")
					matches[i+1] = (float(vals[0]) + float(vals[1]))/2
				#print(matches[i] + " " + matches[i+1])
				CardRatings[matches[i]] = matches[i+1]
	with open(RatingsDest, 'w') as outfile:
		json.dump(CardRatings, outfile)
else:
	with open(RatingsDest, 'r', encoding="utf8") as file:
		CardRatings = json.loads(file.read())

if not os.path.isfile(FinalDataPath) or ForceExtract or ForceCache:
	# Tag non booster card as such
	print("Requesting non-booster cards list...")
	NonBoosterCards = []
	response = requests.get("https://api.scryfall.com/cards/search?{}".format(urllib.parse.urlencode({'q': 'game:arena -in:booster'})))
	data = json.loads(response.content)
	for c in data['data']:
		if('arena_id' in c):
			NonBoosterCards.append(c['arena_id'])
		else:
			NonBoosterCards.append(CardsCollectorNumberAndSet[(c['collector_number'], c['set'].lower())])
	while(data["has_more"]):
		response = requests.get(data["next_page"])
		data = json.loads(response.content)
		for c in data['data']:
			if('arena_id' in c):
				NonBoosterCards.append(c['arena_id'])
			else:
				NonBoosterCards.append(CardsCollectorNumberAndSet[(c['collector_number'], c['set'].lower())])

	print("Generating card data cache...")
	with open(BulkDataArenaPath, 'r', encoding="utf8") as file:
		cards = {}
		translations = {}
		translations_img = {}
		arena_cards = json.loads(file.read())
		for c in arena_cards:
			if c['arena_id'] not in translations:
				translations[c['arena_id']] = {}
			if c['arena_id'] not in translations_img:
				translations_img[c['arena_id']] = {}
			if c['lang'] != 'en':
				if 'printed_name' in c:
					translations[c['arena_id']][c['lang']] = c['printed_name']
				elif 'card_faces' in c and 'printed_name' in c['card_faces'][0]:
					translations[c['arena_id']][c['lang']] = c['card_faces'][0]['printed_name']
				if 'image_uris' in c and 'border_crop' in c['image_uris']:
					translations_img[c['arena_id']][c['lang']] = c['image_uris']['border_crop']
				elif 'card_faces' in c and 'image_uris' in c['card_faces'][0] and 'border_crop' in c['card_faces'][0]['image_uris']:
					translations_img[c['arena_id']][c['lang']] = c['card_faces'][0]['image_uris']['border_crop']
				continue
			if c['arena_id'] not in cards:
				cards[c['arena_id']] = {}
			if c['lang'] == 'en':
				selection = {key:value for key,value in c.items() if key in {'name', 'set', 'cmc', 'rarity', 'collector_number', 'color_identity'}}
				if selection['name'] in CardRatings:
					selection['rating'] = CardRatings[selection['name']]
				else:
					selection['rating'] = 0.5
				if c['arena_id'] in NonBoosterCards or not c['booster'] or 'Basic Land' in c['type_line']:
					selection['in_booster'] = False
					selection['rating'] = 0
				if 'image_uris' in c and 'border_crop' in c['image_uris']:
					translations_img[c['arena_id']][c['lang']] = c['image_uris']['border_crop']
				elif 'card_faces' in c and 'image_uris' in c['card_faces'][0] and 'border_crop' in c['card_faces'][0]['image_uris']:
					translations_img[c['arena_id']][c['lang']] = c['card_faces'][0]['image_uris']['border_crop']
				translations[c['arena_id']][c['lang']] = c['name']
				cards[c['arena_id']].update(selection)
		
		for k in cards:
			cards[k]['printed_name'] = translations[k]
			cards[k]['image_uris'] = translations_img[k]
		
		with open(FinalDataPath, 'w', encoding="utf8") as outfile:
			json.dump(cards, outfile, ensure_ascii=False)
		# with gzip.open(FinalDataPath+'.gzip', 'wt', encoding="utf8") as outfile:
			# json.dump(cards, outfile, ensure_ascii=False)

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
	"iko": "Ikoria: Lair of Behemoths"
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
		# Get set icon
		icon_path = "img/sets/{}.svg".format(set)
		if not os.path.isfile("public/" + icon_path):
			response = requests.get("https://api.scryfall.com/sets/{}".format(set))
			scryfall_set_data = json.loads(response.content)
			if scryfall_set_data and 'icon_svg_uri' in scryfall_set_data:
				urllib.request.urlretrieve(scryfall_set_data['icon_svg_uri'], "public/" + icon_path)
				setinfos[set]["icon"] = icon_path
		else:
			setinfos[set]["icon"] = icon_path
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
		