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
import functools

ScryfallSets = 'data/scryfall-sets.json'
BulkDataPath = 'data/scryfall-all-cards.json'
BulkDataArenaPath = 'data/BulkArena.json'
FinalDataPath = 'data/MTGCards.json'
SetsInfosPath = 'client/public/data/SetsInfos.json'
BasicLandIDsPath = 'client/public/data/BasicLandIDs.json'
RatingSourceFolder = 'data/LimitedRatings/'
JumpstartBoostersFolder = 'data/JumpstartBoosters'
JumpstartSwaps = "data/JumpstartSwaps.json"
JumpstartBoostersDist = 'data/JumpstartBoosters.json'
RatingsDest = 'data/ratings.json'

ArenaRarity = {
    1: "basic",  # I guess?
    2: "common",
    3: "uncommon",
    4: "rare",
    5: "mythic"
}

ForceDownload = ForceExtract = ForceCache = ForceRatings = ForceJumpstart = ForceSymbology = False
if len(sys.argv) > 1:
    Arg = sys.argv[1].lower()
    ForceDownload = Arg == "dl"
    ForceExtract = ForceDownload or Arg == "extract"
    ForceCache = ForceExtract or Arg == "cache"
    ForceRatings = Arg == "ratings"
    ForceJumpstart = Arg == "jmp"
    ForceSymbology = Arg == "symb"

MTGADataFolder = "H:\MtGA\MTGA_Data\Downloads\Data"
MTGALocFiles = glob.glob('{}\data_loc_*.mtga'.format(MTGADataFolder))
MTGACardsFiles = glob.glob('{}\data_cards_*.mtga'.format(MTGADataFolder))
MTGALocalization = {}
for path in MTGALocFiles:
    with open(path, 'r', encoding="utf8") as file:
        locdata = json.load(file)
        for lang in locdata:
            langcode = lang['isoCode'][:2]
            if langcode not in MTGALocalization:
                MTGALocalization[langcode] = {}
            for o in lang['keys']:
                MTGALocalization[langcode][o['id']] = o['text']

# Get mana symbols info from Scryfall
SymbologyFile = "./data/symbology.json"
ManaSymbolsFile = "./client/src/data/mana_symbols.json"
if not os.path.isfile(ManaSymbolsFile) or ForceSymbology:
    if not os.path.isfile(SymbologyFile):
        urllib.request.urlretrieve(
            "https://api.scryfall.com/symbology", SymbologyFile)
    mana_symbols = {}
    with open(SymbologyFile, 'r', encoding="utf8") as file:
        symbols = json.load(file)
        for s in symbols["data"]:
            mana_symbols[s['symbol']] = {
                "cmc": s["cmc"],
                "colors": s["colors"]
            }
    with open(ManaSymbolsFile, 'w', encoding="utf8") as outfile:
        json.dump(mana_symbols, outfile)

MTGATranslations = {"en": {},
                    "es": {},
                    "fr": {},
                    "de": {},
                    "it": {},
                    "pt": {},
                    "ja": {},
                    "ko": {},
                    "ru": {},
                    "zhs": {},
                    "zht": {},
                    "ph": {}}
CardsCollectorNumberAndSet = {}
CardNameToID = {}
AKRCards = {}
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
                collectorNumber = o['CollectorNumber'] if "CollectorNumber" in o else o['collectorNumber']
                # Process AKR cards separately (except basics)
                if o["set"] == "akr":
                    if o['rarity'] != 1:
                        AKRCards[MTGALocalization['en'][o['titleId']].replace(" /// ", " // ")] = (
                            o['grpid'], collectorNumber, ArenaRarity[o['rarity']])
                else:
                    # Jumpstart introduced duplicate (CollectorNumbet, Set), thanks Wizard! :D
                    # Adding name to disambiguate.
                    CardsCollectorNumberAndSet[(
                        MTGALocalization['en'][o['titleId']], collectorNumber, o['set'])] = o['grpid']

                # Also look of the Arena only version (ajmp) of the card on Scryfall
                if o['set'] == 'jmp':
                    CardsCollectorNumberAndSet[(
                        MTGALocalization['en'][o['titleId']], collectorNumber, 'ajmp')] = o['grpid']

                for lang in MTGALocalization:
                    MTGATranslations[lang][o['grpid']] = {
                        'printed_name': MTGALocalization[lang][o['titleId']]}

                # From Jumpstart: Prioritizing cards from JMP and M21
                if MTGALocalization['en'][o['titleId']] not in CardNameToID or o['set'] in ['jmp', 'm21']:
                    CardNameToID[MTGALocalization['en']
                                 [o['titleId']]] = o['grpid']


print("AKRCards length: {}".format(len(AKRCards.keys())))

with open('data/MTGADataDebug.json', 'w') as outfile:
    MTGADataDebugToJSON = {}
    for key in CardsCollectorNumberAndSet.keys():
        MTGADataDebugToJSON[str(key)] = CardsCollectorNumberAndSet[key]
    json.dump(MTGADataDebugToJSON, outfile, sort_keys=True, indent=4)

if not os.path.isfile(BulkDataPath) or ForceDownload:
    # Get Bulk Data URL
    response = requests.get("https://api.scryfall.com/bulk-data")
    bulkdata = json.loads(response.content)
    allcardURL = next(x for x in bulkdata['data'] if x['type'] == "all_cards")[
        'download_uri']
    print("Downloading {}...".format(allcardURL))
    urllib.request.urlretrieve(allcardURL, BulkDataPath)

if not os.path.isfile(ScryfallSets) or ForceDownload:
    urllib.request.urlretrieve("https://api.scryfall.com/sets", ScryfallSets)
SetsInfos = json.load(open(ScryfallSets, 'r', encoding="utf8"))['data']
PrimarySets = [s['code'] for s in SetsInfos if s['set_type']
               in ['core', 'expansion', 'masters', 'draft_innovation']]

# Handle decimals from Scryfall data? (Prices?)


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)


if not os.path.isfile(BulkDataArenaPath) or ForceExtract:
    print("Extracting arena card to {}...".format(BulkDataArenaPath))
    cards = []
    with open(BulkDataPath, 'r', encoding="utf8") as file:
        objects = ijson.items(file, 'item')
        allcards = (o for o in objects)

        sys.stdout.write("Processing... ")
        sys.stdout.flush()
        copied = 0
        for c in allcards:
            # or c['set'] == 'akr':
            if c['oversized'] or c['layout'] in ["token", "double_faced_token", "emblem", "artseries"]:
                continue
            if ((c['name'], c['collector_number'], c['set'].lower()) in CardsCollectorNumberAndSet):
                c['arena_id'] = CardsCollectorNumberAndSet[(c['name'],
                                                            c['collector_number'], c['set'].lower())]

            # Includes only cards available on Arena or MTGO, with the exception of the un-sets, Conspiracy, Battlebond, Mystery Booster and some older sets
            if('arena_id' not in c and 'mtgo_id' not in c and c['set'] not in ['ugl', 'unh', 'ust', 'und', 'cns', 'bbd', 'mb1'] and c['set'] not in ['tsb', 'all', 'ice', '2ed', 'leb', 'lea']):
                continue

            cards.append(c)
            copied += 1
            sys.stdout.write("\b" * 100)  # return to start of line
            sys.stdout.write("Processing... " +
                             str(copied) + " cards added...")
        sys.stdout.write("\b" * 100)
        sys.stdout.write(" " + str(copied) + " cards added.")

    # TODO: Get rid of that, instead just replace the art without messing the rest of the card data.
    # Arena version of splits cards doesn't have any text, getting AKH/HOU cards by name instead
    with open(BulkDataPath, 'r', encoding="utf8") as file:
        print("\nExtracting AKR card data...")
        objects = ijson.items(file, 'item')
        akr_cards = (o for o in objects if o['name'] in AKRCards)
        akr_candidates = {}
        # Prioritize version of cards from Amonkhet (AKH) of Hour of Devastation (HOU)
        for c in akr_cards:
            if c["lang"] not in akr_candidates:
                akr_candidates[c["lang"]] = {}
            if (c['set'].lower() in ['akh', 'hou']) or c['name'] not in akr_candidates[c['lang']] or (akr_candidates[c['lang']][c['name']]['set'] not in ['akh', 'hou'] and c['released_at'] > akr_candidates[c["lang"]][c['name']]['released_at']):
                c['arena_id'] = AKRCards[c["name"]][0]
                c['collector_number'] = AKRCards[c["name"]][1]
                # Force AKR cards to appear in boosters, excluding Regal Caracal (Buy-a-Box) and basics.
                c['booster'] = c['collector_number'] != "339" and 'Basic Land' not in c['type_line']
                c['rarity'] = AKRCards[c["name"]][2]  # Fix rarity shifts
                akr_candidates[c["lang"]][c["name"]] = c
        for l in akr_candidates.keys():
            for c in akr_candidates[l].values():
                c['set'] = "akr"
                cards.append(c)

        MissingAKRCards = AKRCards
        for name in akr_candidates["en"]:
            del MissingAKRCards[name]
        if len(MissingAKRCards) > 0:
            print("MissingAKRCards: ", MissingAKRCards)

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
    print("Generating card data cache...")
    with open(BulkDataArenaPath, 'r', encoding="utf8") as file:
        cards = {}
        cardsByName = {}
        all_cards = json.loads(file.read())
        Translations = {}
        for c in all_cards:
            if c['id'] not in cards:
                cards[c['id']] = {'id': c['id']}

            key = (c['name'], c['set'], c['collector_number'])
            if key not in Translations:
                Translations[key] = {
                    'printed_names': {}, 'image_uris': {}}

            if 'printed_name' in c:
                Translations[key
                             ]['printed_names'][c['lang']] = c['printed_name']
            elif 'card_faces' in c and 'printed_name' in c['card_faces'][0]:
                Translations[key]['printed_names'][c['lang']
                                                   ] = c['card_faces'][0]['printed_name']

            if 'image_uris' in c and 'border_crop' in c['image_uris']:
                Translations[key]['image_uris'][c['lang']
                                                ] = c['image_uris']['border_crop']
            elif 'card_faces' in c and 'image_uris' in c['card_faces'][0] and 'border_crop' in c['card_faces'][0]['image_uris']:
                Translations[key]['image_uris'][c['lang']
                                                ] = c['card_faces'][0]['image_uris']['border_crop']

            if c['layout'] == 'transform' or c['layout'] == 'modal_dfc':
                if 'back' not in Translations[key]:
                    Translations[key]['back'] = {
                        'printed_names': {}, 'image_uris': {}}
                Translations[key]['back']['printed_names'][c['lang']
                                                           ] = c['card_faces'][1]['printed_name'] if 'printed_name' in c['card_faces'][1] else c['card_faces'][1]['name']
                Translations[key]['back']['image_uris'][c['lang']
                                                        ] = c['card_faces'][1]['image_uris']['border_crop']

            if c['lang'] == 'en':
                if c['name'] in cardsByName:
                    cardsByName[c['name']].append(c)
                else:
                    cardsByName[c['name']] = [c]

                selection = {key: value for key, value in c.items() if key in {
                    'arena_id', 'name', 'set', 'mana_cost', 'rarity', 'collector_number'}}
                if 'mana_cost' not in selection and "card_faces" in c:
                    selection["mana_cost"] = c["card_faces"][0]["mana_cost"]
                typeLine = c['type_line'].split(' — ')
                selection['type'] = typeLine[0]
                subtypes = []  # Unused for now
                if len(typeLine) > 1:
                    subtypes = typeLine[1].split()
                # selection['subtypes'] = subtypes
                if selection['name'] in CardRatings:
                    selection['rating'] = CardRatings[selection['name']]
                elif selection['name'].split(" //")[0] in CardRatings:
                    selection['rating'] = CardRatings[selection['name'].split(
                        " //")[0]]
                else:
                    selection['rating'] = 0.5
                selection['in_booster'] = True
                if c['set'] == 'akr':
                    selection['in_booster'] = c['booster'] and 'Basic Land' not in c['type_line']
                elif not c['booster'] or 'Basic Land' in c['type_line']:
                    selection['in_booster'] = False
                    selection['rating'] = 0
                cards[c['id']].update(selection)

        MTGACards = {}
        for cid in list(cards):
            c = cards[cid]
            if 'name' in c:
                key = (c['name'], c['set'], c['collector_number'])
                if key in Translations:
                    c.update(Translations[key])
            else:
                del cards[cid]
            if 'arena_id' in c:
                MTGACards[c['arena_id']] = c

        # Select the "best" (most recent, non special) printing of each card
        def selectCard(a, b):
            if 'arena_id' in a and 'arena_id' not in b:
                return a
            if 'arena_id' in b and 'arena_id' not in a:
                return b
            if a['set'] in PrimarySets and not b['set'] in PrimarySets:
                return a
            if a['set'] not in PrimarySets and b['set'] in PrimarySets:
                return b
            return a if a['released_at'] > b['released_at'] or (a['released_at'] == a['released_at'] and (a['collector_number'] < b['collector_number'] if not (a['collector_number'].isdigit() and b['collector_number'].isdigit()) else int(a['collector_number']) < int(b['collector_number']))) else b

        for name in cardsByName:
            cardsByName[name] = functools.reduce(
                selectCard, cardsByName[name])['id']

        with open(FinalDataPath, 'w', encoding="utf8") as outfile:
            json.dump(cards, outfile, ensure_ascii=False)

        with open("data/CardsByName.json", 'w', encoding="utf8") as outfile:
            json.dump(cardsByName, outfile, ensure_ascii=False)

        with open("client/public/data/MTGACards.json", 'w', encoding="utf8") as outfile:
            json.dump(MTGACards, outfile, ensure_ascii=False)

cards = {}
with open(FinalDataPath, 'r', encoding="utf8") as file:
    cards = json.loads(file.read())

# Retrieve basic land ids for each set
BasicLandIDs = {}
for cid in cards:
    if cards[cid]["name"] in ["Plains", "Island", "Swamp", "Mountain", "Forest"]:
        if(cards[cid]["set"] not in BasicLandIDs):
            BasicLandIDs[cards[cid]["set"]] = []
        BasicLandIDs[cards[cid]["set"]].append(cid)
    for set in BasicLandIDs:
        BasicLandIDs[set].sort()
with open(BasicLandIDsPath, 'w+', encoding="utf8") as basiclandidsfile:
    json.dump(BasicLandIDs, basiclandidsfile, ensure_ascii=False)

if not os.path.isfile(JumpstartBoostersDist) or ForceJumpstart:
    print("Extracting Jumpstart Boosters...")
    jumpstartBoosters = []

    regex = re.compile("(\d+) (.*)")
    swaps = {}
    with open(JumpstartSwaps, 'r', encoding="utf8") as file:
        swaps = json.loads(file.read())
    for path in glob.glob('{}/*.txt'.format(JumpstartBoostersFolder)):
        with open(path, 'r', encoding="utf8") as file:
            lines = file.readlines()
            booster = {"name": lines[0].strip(), "cards": []}
            for line in lines[1:]:
                m = regex.match(line.strip())
                if m:
                    count = int(m.group(1))
                    name = m.group(2)
                    if name in swaps:
                        name = swaps[name]
                    if name in CardNameToID:
                        cid = None
                        for c in cards:
                            if 'arena_id' in cards[c] and cards[c]['arena_id'] == CardNameToID[name]:
                                cid = cards[c]['id']
                                break
                        # Some cards are labeled as JMP in Arena but not on Scryfall (Swaped cards). We can search for an alternative version.
                        if cid == None:
                            print("{} ({}) not found in cards...".format(name, cid))
                            candidates = [
                                key for key, val in cards.items() if val['name'] == name and val['set'] != 'jmp']
                            if len(candidates) == 0:
                                print(
                                    " > Cannot find a good candidate ID for {} !!".format(name))
                            else:
                                cid = max(candidates)
                                print("> Using {}".format(cid))
                        booster["cards"] += [cid] * count
                    else:
                        print("Jumpstart Boosters: Card '{}' not found.".format(name))
            jumpstartBoosters.append(booster)
    print("Jumpstart Boosters: ", len(jumpstartBoosters))
    with open(JumpstartBoostersDist, 'w', encoding="utf8") as outfile:
        json.dump(jumpstartBoosters, outfile, ensure_ascii=False)
    print("Jumpstart booster dumped to disk.")


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


array = []
for key, value in cards.items():
    array.append(value)

print("Cards in database: ", len(array))
array.sort(key=lambda c: c['set'])
groups = groupby(array, lambda c: c['set'])
setinfos = {}


def getIcon(set, icon_path):
    # con is a reserved keyword on windows; we don't need it anyway.
    if not os.path.isfile("client/public/" + icon_path):
        response = requests.get(
            "https://api.scryfall.com/sets/{}".format(set))
        scryfall_set_data = json.loads(response.content)
        if scryfall_set_data and 'icon_svg_uri' in scryfall_set_data:
            urllib.request.urlretrieve(
                scryfall_set_data['icon_svg_uri'], "client/public/" + icon_path)
            if set == "rna":
                overrideViewbox(icon_path, "0 0 32 32", "0 6 32 20")
            return icon_path
    else:
        return icon_path
    return None


for set, group in groups:
    cardList = list(group)
    setinfos[set] = {"code": set,
                     "fullName": next(x for x in SetsInfos if x['code'] == set)['name'],
                     "cardCount": len(cardList),
                     "isPrimary": set in PrimarySets
                     }
    icon_path = "img/sets/{}.svg".format(set if set != 'con' else 'conf')
    if getIcon(set, icon_path) != None:
        setinfos[set]['icon'] = icon_path
    print('\t', set, ": ", len(cardList))
    cardList.sort(key=lambda c: c['rarity'])
    for rarity, rarityGroup in groupby(cardList, lambda c: c['rarity']):
        rarityGroupList = list(rarityGroup)
        setinfos[set][rarity + "Count"] = len(rarityGroupList)
# for s in PrimarySets:
#    if s not in setinfos:
#        infos = next(x for x in SetsInfos if x['code'] == s)
#        setinfos[s] = {
#            "code": s,
#            "fullName": infos['name'],
#            "cardCount": infos['card_count'],
#            "isPrimary": True
#        }
#    icon_path = "img/sets/{}.svg".format(s if s != 'con' else 'conf')
#    if getIcon(s, icon_path) != None:
#        setinfos[s]['icon'] = icon_path
with open(SetsInfosPath, 'w+', encoding="utf8") as setinfosfile:
    json.dump(setinfos, setinfosfile, ensure_ascii=False)

constants = {}
with open("client/src/data/constants.json", 'r', encoding="utf8") as constantsFile:
    constants = json.loads(constantsFile.read())
constants['PrimarySets'] = [
    s for s in PrimarySets if s in setinfos and s != 'tsb']
with open("client/src/data/constants.json", 'w', encoding="utf8") as constantsFile:
    json.dump(constants, constantsFile, ensure_ascii=False, indent=4)
