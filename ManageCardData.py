import mmap
import json
import requests
import ijson
import os
import gzip
import urllib
import sys
import re
import glob
import decimal
from itertools import groupby

BulkDataPath = 'data/scryfall-all-cards.json'
BulkDataArenaPath = 'data/BulkArena.json'
FinalDataPath = 'client/public/data/MTGACards.json'
SetsInfosPath = 'client/public/data/SetsInfos.json'
BasicLandIDsPath = 'client/public/data/BasicLandIDs.json'
RatingSourceFolder = 'data/LimitedRatings/'
RatingsDest = 'data/ratings.json'

ForceDownload = ForceExtract = ForceCache = ForceRatings = False
if len(sys.argv) > 1:
    Arg = sys.argv[1].lower()
    ForceDownload = Arg == "dl"
    ForceExtract = ForceDownload or Arg == "extract"
    ForceCache = ForceExtract or Arg == "cache"
    ForceRatings = Arg == "ratings"

MTGADataFolder = "S:\MtGA\MTGA_Data\Downloads\Data"
MTGALocFiles = glob.glob('{}\data_loc_*.mtga'.format(MTGADataFolder))
MTGACardsFiles = glob.glob('{}\data_cards_*.mtga'.format(MTGADataFolder))
MTGALocalization = {}
for path in MTGALocFiles:
    with open(path, 'r', encoding="utf8") as file:
        locdata = json.load(file)
        for o in locdata[0]['keys']:
            MTGALocalization[o['id']] = o['text']

MTGADataDebug = {}
CardsCollectorNumberAndSet = {}
for path in MTGACardsFiles:
    with open(path, 'r', encoding="utf8") as file:
        carddata = json.load(file)
        for o in carddata:
            if o['isPrimaryCard']:
                o['set'] = o['set'].lower()
                if o['set'] == 'conf':
                    o['set'] = 'con'
                if o['set'] == 'dar':
                    o['set'] = 'dom'
                MTGADataDebug[(MTGALocalization[o['titleId']],
                               o['CollectorNumber'], o['set'].lower())] = o['grpid']
                CardsCollectorNumberAndSet[(
                    o['CollectorNumber'], o['set'].lower())] = o['grpid']

with open('data/MTGADataDebug.json', 'w') as outfile:
    MTGADataDebugToJSON = {}
    for key in MTGADataDebug.keys():
        MTGADataDebugToJSON[str(key)] = MTGADataDebug[key]
    json.dump(MTGADataDebugToJSON, outfile, sort_keys=True, indent=4)

if not os.path.isfile(BulkDataPath) or ForceDownload:
    # Get Bulk Data URL
    response = requests.get("https://api.scryfall.com/bulk-data")
    bulkdata = json.loads(response.content)
    allcardURL = next(x for x in bulkdata['data'] if x['type'] == "all_cards")[
        'download_uri']
    print("Downloading {}...".format(allcardURL))
    urllib.request.urlretrieve(allcardURL, BulkDataPath)


# Handle decimals from Scryfall data? (Prices?)
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)


if not os.path.isfile(BulkDataArenaPath) or ForceExtract:
    print("Extracting arena card to {}...".format(BulkDataArenaPath))
    with open(BulkDataPath, 'r', encoding="utf8") as file:
        objects = ijson.items(file, 'item')
        arena_cards = (o for o in objects if (
            o['collector_number'], o['set'].lower()) in CardsCollectorNumberAndSet)
        cards = []

        sys.stdout.write("Processing... ")
        sys.stdout.flush()
        copied = 0
        for c in arena_cards:
            c['arena_id'] = CardsCollectorNumberAndSet[(
                c['collector_number'], c['set'].lower())]
            cards.append(c)
            copied += 1
            sys.stdout.write("\b" * 100)  # return to start of line
            sys.stdout.write("Processing... " +
                             str(copied) + " cards added...")
        sys.stdout.write("\b" * 100)
        sys.stdout.write(" " + str(copied) + " cards added.")

        with open(BulkDataArenaPath, 'w') as outfile:
            json.dump(cards, outfile, cls=DecimalEncoder)

        print("\nDone!")

CardRatings = {}
with open('data/ratings_base.json', 'r', encoding="utf8") as file:
    CardRatings = dict(CardRatings, **json.loads(file.read()))
if not os.path.isfile(RatingsDest) or ForceRatings:
    for path in glob.glob('{}/*.html'.format(RatingSourceFolder)):
        with open(path, 'r', encoding="utf8") as file:
            text = file.read()
            matches = re.findall(
                r'<[^>]*?data-name="([^"]+)"[^>]*?data-rating="([^"]+)">', text)
            print("Extracting ratings from ", path,
                  ": Found ", len(matches), " matches.")
            for m in matches:
                try:
                    rating = float(m[1])
                except ValueError:
                    vals = m[1].split("//")
                    rating = (float(vals[0]) + float(vals[1]))/2
                # print(m[0], " ", rating)
                CardRatings[m[0]] = rating

    with open(RatingsDest, 'w') as outfile:
        json.dump(CardRatings, outfile)
else:
    with open(RatingsDest, 'r', encoding="utf8") as file:
        CardRatings = dict(CardRatings, **json.loads(file.read()))

if not os.path.isfile(FinalDataPath) or ForceCache:
    # Tag non booster card as such
    print("Requesting non-booster cards list...")
    NonBoosterCards = []
    response = requests.get("https://api.scryfall.com/cards/search?{}".format(
        urllib.parse.urlencode({'q': 'game:arena -in:booster'})))
    data = json.loads(response.content)
    for c in data['data']:
        if('arena_id' in c):
            NonBoosterCards.append(c['arena_id'])
        elif (c['collector_number'], c['set'].lower()) in CardsCollectorNumberAndSet:
            NonBoosterCards.append(CardsCollectorNumberAndSet[(
                c['collector_number'], c['set'].lower())])
    while(data["has_more"]):
        response = requests.get(data["next_page"])
        data = json.loads(response.content)
        for c in data['data']:
            if('arena_id' in c):
                NonBoosterCards.append(c['arena_id'])
            elif (c['collector_number'], c['set'].lower()) in CardsCollectorNumberAndSet:
                NonBoosterCards.append(CardsCollectorNumberAndSet[(
                    c['collector_number'], c['set'].lower())])

    print("Generating card data cache...")
    translations = {"en": {},
                    "es": {},
                    "fr": {},
                    "de": {},
                    "it": {},
                    "pt": {},
                    "ja": {},
                    "ko": {},
                    "ru": {},
                    "zhs": {},
                    "zht": {}}
    with open(BulkDataArenaPath, 'r', encoding="utf8") as file:
        cards = {}
        arena_cards = json.loads(file.read())
        for c in arena_cards:
            translation = {}
            if 'printed_name' in c:
                translation['printed_name'] = c['printed_name']
            elif 'card_faces' in c and 'printed_name' in c['card_faces'][0]:
                translation['printed_name'] = c['card_faces'][0]['printed_name']
            if 'image_uris' in c and 'border_crop' in c['image_uris']:
                translation['image_uris'] = c['image_uris']['border_crop']
            elif 'card_faces' in c and 'image_uris' in c['card_faces'][0] and 'border_crop' in c['card_faces'][0]['image_uris']:
                translation['image_uris'] = c['card_faces'][0]['image_uris']['border_crop']
            translations[c['lang']][c['arena_id']] = translation
            if c['lang'] != 'en':
                continue
            if c['arena_id'] not in cards:
                cards[c['arena_id']] = {}
            if c['lang'] == 'en':
                selection = {key: value for key, value in c.items() if key in {
                    'name', 'set', 'cmc', 'rarity', 'collector_number', 'color_identity'}}
                if selection['name'] in CardRatings:
                    selection['rating'] = CardRatings[selection['name']]
                else:
                    selection['rating'] = 0.5
                if c['arena_id'] in NonBoosterCards or not c['booster'] or 'Basic Land' in c['type_line']:
                    selection['in_booster'] = False
                    selection['rating'] = 0
                cards[c['arena_id']].update(selection)

        # Removes URL prefix
        allURIs = []
        for lang in translations:
            for c in translations[lang]:
                allURIs.append(translations[lang][c]['image_uris'])
        URLPrefix = os.path.commonprefix(allURIs)
        print("Scryfall Image URLPrefix: ", URLPrefix)
        for lang in translations:
            for c in translations[lang]:
                translations[lang][c]['image_uris'] = translations[lang][c]['image_uris'][len(
                    URLPrefix):]

        for lang in translations:
            with open("client/public/data/MTGACards.{}.json".format(lang), 'w', encoding="utf8") as outfile:
                json.dump(translations[lang], outfile, ensure_ascii=False)

        with open(FinalDataPath, 'w', encoding="utf8") as outfile:
            json.dump(cards, outfile, ensure_ascii=False)

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


def overrideViewbox(svgPath, expectedViewbox, correctedViewbox):
    with open(svgPath, 'r') as inputFile:
        inputFile.seek(0)
        content = inputFile.read()
        if 'viewBox="%s"' % expectedViewbox not in content:
            print("svg did not have expected viewbox: %s" % svgPath)
            return
        content = content.replace(
            'viewBox="%s"' % expectedViewbox, 'viewBox="%s"' % correctedViewbox)
    with open(svgPath, 'w') as outputFile:
        outputFile.write(content)


with open(FinalDataPath, 'r', encoding="utf8") as file:
    data = json.loads(file.read())
    array = []
    for key, value in data.items():
        array.append(value)

    print("Cards in database: ", len(array))
    array.sort(key=lambda c: c['set'])
    groups = groupby(array, lambda c: c['set'])
    setinfos = {}
    for set, group in groups:
        cardList = list(group)
        setinfos[set] = {}
        # Get set icon
        icon_path = "img/sets/{}.svg".format(set)
        # con is a reserved keyword on windows; we don't need it anyway.
        if not os.path.isfile("client/public/" + icon_path) and set != "con":
            response = requests.get(
                "https://api.scryfall.com/sets/{}".format(set))
            scryfall_set_data = json.loads(response.content)
            if scryfall_set_data and 'icon_svg_uri' in scryfall_set_data:
                urllib.request.urlretrieve(
                    scryfall_set_data['icon_svg_uri'], "client/public/" + icon_path)
                if set == "rna":
                    overrideViewbox(icon_path, "0 0 32 32", "0 6 32 20")
                setinfos[set]["icon"] = icon_path
        else:
            setinfos[set]["icon"] = icon_path
        if set in setFullNames:
            setinfos[set]["fullName"] = setFullNames[set]
        else:
            setinfos[set]["fullName"] = set
        setinfos[set]["cardCount"] = len(cardList)
        print('\t', set, ": ", len(cardList))
        cardList.sort(key=lambda c: c['rarity'])
        for rarity, rarityGroup in groupby(cardList, lambda c: c['rarity']):
            rarityGroupList = list(rarityGroup)
            setinfos[set][rarity + "Count"] = len(rarityGroupList)
            # print('\t\t {}: {}'.format(rarity, len(rarityGroupList)))
    with open(SetsInfosPath, 'w+', encoding="utf8") as setinfosfile:
        json.dump(setinfos, setinfosfile, ensure_ascii=False)

        # Retrieve basic land ids for each set
    BasicLandIDs = {}
    for cid in data:
        if data[cid]["name"] in ["Plains", "Island", "Swamp", "Mountain", "Forest"]:
            if(data[cid]["set"] not in BasicLandIDs):
                BasicLandIDs[data[cid]["set"]] = []
            BasicLandIDs[data[cid]["set"]].append(cid)
        for set in BasicLandIDs:
            BasicLandIDs[set].sort()
    with open(BasicLandIDsPath, 'w+', encoding="utf8") as basiclandidsfile:
        json.dump(BasicLandIDs, basiclandidsfile, ensure_ascii=False)
