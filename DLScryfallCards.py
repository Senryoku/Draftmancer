import mmap
import json
import requests
import ijson
import os
import gzip
import urllib
import requests
import sys
from itertools import groupby

BulkDataURL = 'https://archive.scryfall.com/json/scryfall-all-cards.json'
BulkDataPath = 'data/scryfall-all-cards.json'
BulkDataArenaPath = 'data/BulkArena.json'
FinalDataPath = 'public/data/MTGACards.json'
SetsInfosPath = 'public/data/SetsInfos.json'

ForceDownload = len(sys.argv) > 1 and sys.argv[1].lower() == "dl"
ForceParse = len(sys.argv) > 1 and sys.argv[1].lower() == "parse"

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
			if c['arena_id'] not in cards:
				cards[c['arena_id']] = {}
			if c['lang'] == 'en':
				selection = {key:value for key,value in c.items() if key in {'name', 'set', 'cmc', 'rarity', 'collector_number', 'color_identity'}}
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
		