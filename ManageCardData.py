from html import unescape
import sqlite3
import mmap
import json
import requests
import os
import gzip
import urllib
import sys
import re
import glob
import decimal
from itertools import groupby
import functools
from pprint import pprint
import math as m1
from ordered_enum import OrderedEnum


class Rarity(OrderedEnum):
    mythic: int = 4
    rare: int = 3
    uncommon: int = 2
    common: int = 1


ScryfallSets = 'data/scryfall-sets.json'
BulkDataPath = 'data/scryfall-all-cards.json'
BulkDataArenaPath = 'data/BulkArena.json'
FirstFinalDataPath = 'data/MTGCards.0.json'
SetsInfosPath = 'client/src/data/SetsInfos.json'
BasicLandIDsPath = 'src/data/BasicLandIDs.json'
RatingSourceFolder = 'data/LimitedRatings/'
JumpstartBoostersFolder = 'data/JumpstartBoosters'
JumpstartSwaps = "data/JumpstartSwaps.json"
JumpstartBoostersDist = 'src/data/JumpstartBoosters.json'
RatingsDest = 'data/ratings.json'
ManaSymbolsFile = "src/data/mana_symbols.json"

ArenaRarity = {
    1: "basic",  # I guess?
    2: "common",
    3: "uncommon",
    4: "rare",
    5: "mythic"
}

ForceDownload = ForceExtract = ForceCache = ForceRatings = ForceJumpstart = ForceJumpstartHH = ForceSymbology = FetchSet = False
SetToFetch = ""
if len(sys.argv) > 1:
    Arg = sys.argv[1].lower()
    ForceDownload = Arg == "dl"
    ForceCache = ForceDownload or Arg == "cache"
    ForceRatings = Arg == "ratings"
    ForceJumpstart = Arg == "jmp"
    ForceSymbology = Arg == "symb"
    FetchSet = Arg == "set" and len(sys.argv) > 2
    if (FetchSet):
        SetToFetch = sys.argv[2].lower()
        ForceCache = True

print("Don't forget to update Arena itself!")
MTGAFolder = "H:\\MtGA\\"
MTGADataFolder = f"{MTGAFolder}MTGA_Data\\Downloads\\Raw\\"
MTGACardDBFiles = glob.glob(f"{MTGADataFolder}Raw_CardDatabase_*.mtga")

CardsCollectorNumberAndSet = {}
CardNameToArenaIDForJumpstart = {}
J21MTGACollectorNumbers = {}

# Links oracle_ids to draft effects
DraftEffects = {'19047c4b-0106-455d-ab71-68cabfae7404': ['FaceUp', 'AgentOfAcquisitions'], '70ff487d-96b3-4322-9975-59bf3c6b517f': ['FaceUp', 'RemoveDraftCard', 'AnimusOfPredation'], '6ca0078f-d6b5-4643-b801-e7a98706f21c': ['FaceUp', 'ArchdemonOfPaliano'], 'bb6bda0d-ddb8-47fa-be07-bbcd73a52830': ['FaceUp', 'CanalDredger'], 'f10898a5-87ec-4a30-a383-9f9bcba3e4d0': ['FaceUp', 'RemoveDraftCard', 'CogworkGrinder'], 'ec0d964e-ca2c-4252-8551-cf1916576653': ['FaceUp', 'CogworkLibrarian'], '1269f7dc-a5d6-48e9-8887-b581ce38c204': ['FaceUp'], '5e8c6894-c9ad-4a50-af13-c2d95395c71e': ['FaceUp'], '8fedb2c2-fb13-4af1-b85e-714832562da7': ['FaceUp', 'LeovoldsOperative'], '96d88811-d0d8-4c64-b7f2-8304d81c8cfa': ['FaceUp', 'NoteCreatureName'], '6dd3be81-b6dc-42ee-9e0a-2e39e3f4e793': ['FaceUp', 'NoteCreatureTypes'], 'dc90b4aa-ba5e-4188-939d-b3920bd9ab0d': ['FaceUp', 'NoteCardName'], 'e40daee2-f9e6-489f-b3dd-274e5a6b8604': ['FaceUp'], '80ea63fd-691a-45ba-a4bf-862e5ec2922d': ['Reveal', 'AetherSearcher'], 'adfd33cb-086c-48f4-b443-ba971ff43684': ['Reveal', 'CogworkSpy'], 'c60ba5e9-dbfa-441b-a96f-9cc7fdfd2d76': ['Reveal', 'NotePassingPlayer'], 'abd78909-72dc-4d36-8990-39995fd071da': ['Reveal', 'NoteDraftedCards'], '8ddbb63c-7f52-431b-bb82-e020b1c3749a': ['Reveal', 'NoteDraftedCards'], '19a3c505-b180-47cc-bef3-9e807a8a4a3d': ['Reveal', 'LoreSeeker'], '412fbf73-a471-42ad-83fe-14f19e4e9595': ['Reveal', 'NoteDraftedCards'], 'cf682012-de36-4ab4-ad94-c3c0fd7bce3f': ['Reveal', 'ChooseColors'], '6ea507d3-2b8d-4f08-824c-0de0ae214da5': ['Reveal', 'NoteDraftedCards'], 'db8e3c05-12d6-41f6-8cc7-e64c863fca58': ['Reveal', 'ChooseColors'], 'd5fc017a-7517-4737-ad5b-cc45f1e139ea': ['Reveal']}

LangCodes = ["enUS", "frFR", "deDE", "itIT", "esES", "ptBR", "ruRU", "jaJP", "koKR", "zhCN", "zhTW"]
MTGALocalization = {key: {} for key in LangCodes}
for path in MTGACardDBFiles:
    MTGACardDB = sqlite3.connect(path)
    MTGACardDB.row_factory = sqlite3.Row
    for row in MTGACardDB.execute(f'SELECT LocId, {", ".join(LangCodes)} FROM Localizations').fetchall():
        for key in MTGALocalization:
            MTGALocalization[key][row["LocId"]] = row[key]
    for o in MTGACardDB.execute(f'SELECT * FROM Cards').fetchall():
        # Ignore... Wildcards?! (TitleId 0)
        if o['TitleId'] not in MTGALocalization['enUS']:
            continue
        fixed_name = MTGALocalization['enUS'][o['TitleId']].replace(" /// ", " // ")
        fixed_name = re.sub(r'<[^>]*>', '', fixed_name)
        setCode = o['ExpansionCode'].lower()
        if o['IsPrimaryCard'] == 1:
            if setCode == 'conf':
                setCode = 'con'
            if setCode == 'dar':
                setCode = 'dom'
            collectorNumber = o['CollectorNumber'] if "CollectorNumber" in o else o['CollectorNumber']

            # Jumpstart introduced duplicate (CollectorNumbet, Set), thanks Wizard! :D
            # Adding name to disambiguate.
            CardsCollectorNumberAndSet[(
                fixed_name, collectorNumber, setCode)] = o['GrpId']

            # Also look of the Arena only version (ajmp) of the card on Scryfall
            if setCode == 'jmp':
                CardsCollectorNumberAndSet[(
                    fixed_name, collectorNumber, 'ajmp')] = o['GrpId']

            # From Jumpstart: Prioritizing cards from JMP and M21
            if fixed_name not in CardNameToArenaIDForJumpstart or setCode in ['jmp', 'm21']:
                CardNameToArenaIDForJumpstart[fixed_name] = o['GrpId']

            if "IsRebalanced" in o and o["IsRebalanced"]:
                CardsCollectorNumberAndSet[(
                    "A-"+fixed_name, "A-"+collectorNumber, setCode)] = o['GrpId']
                CardNameToArenaIDForJumpstart["A-"+fixed_name] = o['GrpId']
            # FIXME: J21 collector number differs between Scryfall and MTGA, record them to translate when exporting
            #        (Also for secondary cards as there's some created cards in this set.)
            if setCode == 'j21':
                J21MTGACollectorNumbers[fixed_name] = collectorNumber

opener = urllib.request.build_opener()
opener.addheaders = [('User-agent', 'Mozilla/5.0'), ('Accept', '*/*')]
urllib.request.install_opener(opener)

# Get mana symbols info from Scryfall
SymbologyFile = "./data/symbology.json"
if not os.path.isfile(ManaSymbolsFile) or ForceSymbology:
    urllib.request.urlretrieve("https://api.scryfall.com/symbology", SymbologyFile)
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

ManaSymbols = json.load(open(ManaSymbolsFile, 'r'))


def parseCost(mana_cost):
    if "//" in mana_cost:
        mana_cost = mana_cost.split("//")[0].strip()
    matches = re.findall(r'({[^}]+})', mana_cost)
    cmc = 0
    colors = set()
    for symbol in matches:
        if symbol in ManaSymbols:
            cmc += ManaSymbols[symbol]["cmc"]
            colors = colors.union(set(ManaSymbols[symbol]["colors"]))
    lcolors = list(colors)
    lcolors.sort(key=lambda val: {"W": 0, "U": 1, "B": 2, "R": 3, "G": 4}[val])
    return [int(cmc), lcolors]


with open('data/MTGADataDebug.json', 'w') as outfile:
    MTGADataDebugToJSON = {}
    for key in CardsCollectorNumberAndSet.keys():
        MTGADataDebugToJSON[str(key)] = CardsCollectorNumberAndSet[key]
    json.dump(MTGADataDebugToJSON, outfile, sort_keys=True, indent=4)
with open('data/J21MTGACollectorNumbers.json', 'w') as outfile:
    json.dump(J21MTGACollectorNumbers, outfile, sort_keys=True, indent=4)

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
    os.system(f"npx prettier --write {ScryfallSets}")
SetsInfos = json.load(open(ScryfallSets, 'r', encoding="utf8"))['data']
PrimarySets = [s['code'] for s in SetsInfos if s['set_type']
               in ['core', 'expansion', 'masters', 'draft_innovation']]
PrimarySets.extend(['unf', 'ugl', 'unh', 'ust', 'und'])  # Add Un-Sets as primary.
PrimarySets.extend(['hbg', 'planeshifted_snc', 'ydmu'])
PrimarySets.append("mat") # Support mat as a draftable set (mom + mat cards)

def append_set_cards(allcards, results):
    print(f"Processing {len(results['data'])} cards...")
    for c in results["data"]:
        try:
            idx = next(i for i, card in enumerate(allcards) if c["id"] == card["id"])
            allcards[idx] = c
            print(f"Updated: {c['name']}")
        except StopIteration:
            allcards.append(c)
            print(f"Added: {c['name']}")


# Manually fetch up-to-date data for a specific set (really unoptimized)
if FetchSet:
    print("Fetching cards from {}...".format(SetToFetch))
    setcards = requests.get(json.loads(requests.get(f"https://api.scryfall.com/sets/{SetToFetch}").content)["search_uri"]).json()
    allcards = []
    with open(BulkDataPath, 'r', encoding="utf8") as file:
        allcards = json.load(file)
    print(f"All cards: {setcards['total_cards']}")
    append_set_cards(allcards, setcards)
    while setcards["has_more"]:
        setcards = requests.get(setcards["next_page"]).json()
        append_set_cards(allcards, setcards)
    with open(BulkDataPath, 'w', encoding="utf8") as file:
        json.dump(allcards, file)


def handleTypeLine(typeLine):
    arr = typeLine.split(' — ')
    types = arr[0]
    subtypes = []  # Unused for now
    if len(arr) > 1:
        subtypes = arr[1].split()
    return types, subtypes


CardRatings = {}
with open('data/ratings_base.json', 'r', encoding="utf8") as file:
    CardRatings = dict(CardRatings, **json.loads(file.read()))
if not os.path.isfile(RatingsDest) or ForceRatings:
    for path in glob.glob('{}/*.htm*'.format(RatingSourceFolder)):
        with open(path, 'r', encoding="utf8") as file:
            text = file.read()
            matches = re.findall(
                r"([^\s][^\n]+)\n\n.*\n?\*Pro Rating: ([0-9]*\.?[0-9]*( // ([0-9]*\.?[0-9]*))?)\*", text)
            print("Extracting ratings from ", path,
                  ": Found ", len(matches), " matches.")
            for m in matches:
                if (m[1] == ''):
                    continue
                else:
                    try:
                        rating = float(m[1])
                    except ValueError:
                        vals = m[1].split("//")
                        rating = (float(vals[0]) + float(vals[1]))/2
                print(unescape(m[0]), " ", rating)
                CardRatings[unescape(m[0])] = rating

    with open(RatingsDest, 'w') as outfile:
        json.dump(CardRatings, outfile, indent=2)
else:
    with open(RatingsDest, 'r', encoding="utf8") as file:
        CardRatings = dict(CardRatings, **json.loads(file.read()))

if not os.path.isfile(FirstFinalDataPath) or ForceCache or FetchSet:
    all_cards = []
    with open(BulkDataPath, 'r', encoding="utf8") as file:
        # objects = ijson.items(file, 'item')
        # ScryfallCards = (o for o in objects if not(o['oversized'] or o['layout'] in ["token", "double_faced_token", "emblem", "art_series"]))
        ScryfallCards = json.load(file)

        sys.stdout.write("PreProcessing... ")
        sys.stdout.flush()
        copied = 0
        handled = 0
        for c in ScryfallCards:
            handled += 1

            if c['oversized'] or c['layout'] in ["token", "double_faced_token", "emblem", "art_series"]:
                continue

            frontName = c['name']
            if ' //' in frontName:
                frontName = frontName.split(' //')[0]
            if ((c['name'], c['collector_number'], c['set'].lower()) in CardsCollectorNumberAndSet):
                c['arena_id'] = CardsCollectorNumberAndSet[(c['name'],
                                                            c['collector_number'], c['set'].lower())]
            elif ((frontName, c['collector_number'], c['set'].lower()) in CardsCollectorNumberAndSet):
                c['arena_id'] = CardsCollectorNumberAndSet[(frontName,
                                                            c['collector_number'], c['set'].lower())]

            # Workaround for Teferi, Master of Time (M21) variations (exclude all except the first one from boosters)
            if (c['set'] == 'm21' and c['collector_number'] in ['275', '276', '277']):
                c['booster'] = False
            # Workaround for premium version of some afr cards
            cnAsInt = 0
            try:
                cnAsInt = int(c['collector_number'])
                if (c['set'] == 'afr' and ('★' in c['collector_number'] or cnAsInt > 281)):
                    c['booster'] = False
            except ValueError:
                pass

            all_cards.append(c)
            copied += 1
            if handled % 1000 == 0:
                sys.stdout.write("\b" * 100)  # return to start of line
                sys.stdout.write(
                    f"PreProcessing...    {copied}/{handled} cards added...")
        sys.stdout.write("\b" * 100)
        sys.stdout.write(
            f"PreProcessing done! {copied}/{handled} cards added.\n")

        sys.stdout.write(" Done!\n")
    cards = {}
    cardsByName = {}
    Translations = {}
    NonProcessedCards = {} # Keep track of cards that were not added to the database (by (name, set, collector number))). After the first pass this will contain cards never printed in English. 
    print("Generating card data cache...")

    def addCard(c):
        if c['name'] in cardsByName:
            cardsByName[c['name']].append(c)
        else:
            cardsByName[c['name']] = [c]

        selection = {key: value for key, value in c.items() if key in {
            'arena_id', 'name', 'set', 'mana_cost', 'rarity', 'collector_number'}}
        if 'mana_cost' not in selection and "card_faces" in c:
            selection["mana_cost"] = c["card_faces"][0]["mana_cost"]
        if 'mana_cost' not in selection:
            print(f"/!\ {c['name']}: Missing mana cost.")
            selection['mana_cost'] = "{0}"
        selection['type'], selection['subtypes'] = handleTypeLine(c['type_line'].split(" //")[0])
        if selection['name'] in CardRatings:
            selection['rating'] = CardRatings[selection['name']]
        elif selection['name'].split(" //")[0] in CardRatings:
            selection['rating'] = CardRatings[selection['name'].split(
                " //")[0]]
        else:
            selection['rating'] = 0.5
        selection['in_booster'] = (c['booster'] and (c['layout'] != 'meld' or not selection['collector_number'].endswith("b")))  # Exclude melded cards from boosters

        cmc, colors = parseCost(selection["mana_cost"])
        selection["cmc"] = cmc
        selection["colors"] = colors

        # Conspiracy Draft Effects
        if c['oracle_id'] in DraftEffects:
            selection['draft_effects'] = DraftEffects[c['oracle_id']]

        if c['set'] == 'war':
            if 'promo_types' in c and 'jpwalker' in c['promo_types']:
                selection['in_booster'] = False

        if c['set'] == 'akr' or c['set'] == 'klr':
            selection['in_booster'] = c['booster'] and not c['type_line'].startswith("Basic")
        elif not c['booster'] or c['type_line'].startswith("Basic"):
            selection['in_booster'] = False
            selection['rating'] = 0
        if c['set'] in ['sta']:  # Force STA in booster
            selection['in_booster'] = not selection['collector_number'].endswith("e")

        # Commanders from CLB commanders deck are incorrectly marked as in_booster by scryfall
        if c['set'] == "clb" and int(c['collector_number']) >= 646 and int(c["collector_number"]) <= 649:
            selection['in_booster'] = False
        # Manually remove special printing from Double Masters 2022 packs
        if c['set'] == "2x2" and int(c['collector_number']) >= 332:
            selection['in_booster'] = False

        # Make sure retro cards from DMR are marked as in_booster
        if c['set'] == "dmr" and (int(c['collector_number']) >= 262 and int(c['collector_number']) <= 401):
            selection['in_booster'] = True

        # Cards from SIR are not marked as in_booster for some reason
        if c['set'] == "sir" and not c['type_line'].startswith("Basic") and not c['collector_number'].endswith("b"):
            selection['in_booster'] = True

        # Workaround: Not sure why this printing is marked as in booster, but it causes a doubled entry in stx rares
        if c['id'] == "0826e210-2002-43fe-942d-41922dfd7bc2":
            selection['in_booster'] = False

        # Workaround: Remove cards from HBG that received a rebalanced version from packs
        if c['id'] in ["057c66a8-9424-4c88-9707-5d8ef9170119", "e07d5fd5-d513-46d4-8812-6e6e55a6dfda", "a5cbda07-53a0-4526-9955-36f902073cf1", "ea4f1d5d-7991-4a2d-b907-3522e951ad4c", "884565bb-ed33-4372-8c81-487c2ee2f73c"]:
            selection['in_booster'] = False

        if c['set'] == "ltr":
            # Workaround: Remove alternate printings and Jumpstart cards from LTR draft boosters (and the 20 basics)
            selection['in_booster'] = int(c['collector_number']) > 0 and int(c['collector_number']) <= 261
            if "Ring tempts you" in c['oracle_text'] and ("all_parts" not in c or next((x for x in c["all_parts"] if x["id"] == "7215460e-8c06-47d0-94e5-d1832d0218af"), None) == None):
                if "related_cards" not in selection:
                    selection["related_cards"] = []
                selection["related_cards"].append("7215460e-8c06-47d0-94e5-d1832d0218af")
                
        if c['set'] == "cmm":
            selection['in_booster'] = int(c['collector_number']) > 0 and int(c['collector_number']) <= 436

        if c['set'] == "woe":
            selection['in_booster'] = int(c['collector_number']) > 0 and int(c['collector_number']) <= 261

        if c['layout'] == "split":
            if 'Aftermath' in c['keywords']:
                selection['layout'] = 'split-left'
            elif not (c['layout'] == 'split' and c['set'] == 'cmb1'):  # Mystery booster play-test split cards use the 'normal' layout
                selection['layout'] = 'split'
        elif c['layout'] == "flip":
            selection['layout'] = 'flip'

        cards[c['id']].update(selection)
        
    for c in all_cards:
        # Some dual faced Secret Lair cards have some key information hidden in the card_faces array. Extract it.
        def copyFromFaces(prop):
            if prop not in c:
                if 'card_faces' in c and len(c['card_faces']) > 1 and prop in c['card_faces'][0] and prop in c['card_faces'][1] and c['card_faces'][0][prop] == c['card_faces'][1][prop]:
                    c[prop] = c['card_faces'][0][prop]
                else:
                    print(f"Warning: Missing '{prop}' for card '{c['name']}'.")
                    return False
            return True

        if copyFromFaces("type_line") == False:
            continue

        if c['id'] not in cards:
            if copyFromFaces("oracle_id") == False:
                continue
            cards[c['id']] = {'id': c['id'], 'oracle_id': c['oracle_id']}

        key = (c['name'], c['set'], c['collector_number'])
        if key not in Translations:
            NonProcessedCards[key] = c
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

        # Handle back side of double sided cards
        if c['layout'] == 'transform' or c['layout'] == 'modal_dfc':
            if 'card_faces' not in c:
                print(f"/!\ {c['name']}: Missing card faces with layout {c['layout']}.")
            else:
                if 'back' not in Translations[key]:
                    Translations[key]['back'] = {'name': c['card_faces'][1]['name'], 'printed_names': {}, 'image_uris': {}}
                    if ('type_line' not in c['card_faces'][1]):
                        print(f"/!\ {c['name']}: Missing back side type line.")
                    else:
                        Translations[key]['back']['type'], Translations[key]['back']['subtypes'] = handleTypeLine(c['card_faces'][1]['type_line'])
                Translations[key]['back']['printed_names'][c['lang']
                                                           ] = c['card_faces'][1]['printed_name'] if 'printed_name' in c['card_faces'][1] else c['card_faces'][1]['name']
                if 'image_uris' not in c['card_faces'][1]:  # Temp workaround while STX data is still incomplete
                    print(f"/!\ {c['name']}: Missing back side image.")
                else:
                    Translations[key]['back']['image_uris'][c['lang']
                                                            ] = c['card_faces'][1]['image_uris']['border_crop']

        if c['lang'] == 'en':
            if key in NonProcessedCards:
                del NonProcessedCards[key]
            addCard(c)

    # Handle cards with no English translation
    print(f"{len(NonProcessedCards)} cards with no English translation.")
    for key, c in NonProcessedCards.items():
        if c['set'] == "khm" or c['set'] == "neo" or c['set'] == "one":
            print(f" -> Non-english card: {c['name']} ({c['set']}), {c['lang']} {c['booster']}")
            #c['image_uris'][c['lang']] = Translations[key]['image_uris'][c['lang']]
            #c['image_uris']['en'] = Translations[key]['image_uris'][c['lang']]
            Translations[key]['image_uris']['en'] = Translations[key]['image_uris'][c['lang']]
            addCard(c)

    MTGACards = {}
    MTGACardsAlternates = {}
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
            if c['name'] not in MTGACardsAlternates:
                MTGACardsAlternates[c['name']] = []
            MTGACardsAlternates[c['name']].append(c['arena_id'])

    with open("client/src/data/MTGACards.json", 'w', encoding="utf8") as outfile:
        json.dump(MTGACards, outfile, ensure_ascii=False, indent=4)
    with open("client/src/data/MTGAAlternates.json", 'w', encoding="utf8") as outfile:
        json.dump(MTGACardsAlternates, outfile, ensure_ascii=False, indent=4)
    

    # Select the "best" (most recent, non special) printing of each card
    def selectCard(a, b):
        # Special case for conjure-only cards from J21 that should be avoided.
        if a['set'] == 'j21' and int(a['collector_number']) >= 777:
            return b
        if b['set'] == 'j21' and int(b['collector_number']) >= 777:
            return a
        # Vintage Masters: Not importable in Arena.
        if a['set'] == 'vma' and b['set'] != 'vma':
            return b
        if a['set'] != 'vma' and b['set'] == 'vma':
            return a
        # Only one of them is marked as a Primary card in Arena
        if (a['name'], a['collector_number'], a['set'].lower()) in CardsCollectorNumberAndSet and (b['name'], b['collector_number'], b['set'].lower()) not in CardsCollectorNumberAndSet:
            return a
        if (a['name'], a['collector_number'], a['set'].lower()) not in CardsCollectorNumberAndSet and (b['name'], b['collector_number'], b['set'].lower()) in CardsCollectorNumberAndSet:
            return b
        # Prefer a card with an Arena ID
        if 'arena_id' in a and 'arena_id' not in b:
            return a
        if 'arena_id' not in a and 'arena_id' in b:
            return b
        # Avoid special frame effects
        if ('frame_effects' in a and any(i in ["showcase","extendedart","etched"] for i in a['frame_effects'])) and (('frame_effects' not in b) or (not any(i in ["showcase","extendedart","etched"] for i in b['frame_effects']))):
            return b
        if ('frame_effects' in b and any(i in ["showcase","extendedart","etched"] for i in b['frame_effects'])) and (('frame_effects' not in a) or (not any(i in ["showcase","extendedart","etched"] for i in a['frame_effects']))):
            return a
        if a['image_status'] != "highres_scan" and b['image_status'] == "highres_scan":
            return b
        if a['image_status'] == "highres_scan" and b['image_status'] != "highres_scan":
            return a
        if a['set'] in PrimarySets and not b['set'] in PrimarySets:
            return a
        if a['set'] not in PrimarySets and b['set'] in PrimarySets:
            return b
        if not a['promo'] and b['promo']:
            return a
        if a['promo'] and not b['promo']:
            return b
        return a if a['released_at'] > b['released_at'] or (a['released_at'] == a['released_at'] and (a['collector_number'] < b['collector_number'] if not (a['collector_number'].isdigit() and b['collector_number'].isdigit()) else int(a['collector_number']) < int(b['collector_number']))) else b

    for name in cardsByName:
        cardsByName[name] = functools.reduce(
            selectCard, cardsByName[name])['id']
    # Handle both references to the full names for just the front face
    for name in list(cardsByName):
        if " // " in name and name.split(" //")[0] not in cardsByName:
            cardsByName[name.split(" //")[0]] = cardsByName[name]

    cards_items = list(cards.items())
    print(f"Split DB, starting with {len(cards)} cards")
    total = 0
    for i in range(4):
        part = dict(cards_items[i*len(cards)//4:(i+1)*len(cards)//4])
        print(f"  Adding {len(part)} cards to MTGCards.{i}.json")
        total += len(part)
        with open(f"data/MTGCards.{i}.json", 'w', encoding="utf8") as outfile:
            json.dump(part, outfile, ensure_ascii=False, indent=4)
    if total != len(cards):
        print("Error: Some cards were not written to the split DB")

    with open("data/CardsByName.json", 'w', encoding="utf8") as outfile:
        json.dump(cardsByName, outfile, ensure_ascii=False, indent=4)

cards = {}
DBFiles = glob.glob("data/MTGCards.*.json")
for f in DBFiles:
    with open(f, 'r', encoding="utf8") as file:
        cards.update(json.loads(file.read()))

# Retrieve basic land ids for each set
BasicLandIDs = {}
for cid in cards:
    if cards[cid]["type"].startswith("Basic"):
        if (cards[cid]["set"] not in BasicLandIDs):
            BasicLandIDs[cards[cid]["set"]] = []
        BasicLandIDs[cards[cid]["set"]].append(cid)
    for mtgset in BasicLandIDs:
        BasicLandIDs[mtgset].sort()
with open(BasicLandIDsPath, 'w+', encoding="utf8") as basiclandidsfile:
    json.dump(BasicLandIDs, basiclandidsfile, ensure_ascii=False)

###############################################################################
# Generate Jumpstart pack data

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
                    if name in CardNameToArenaIDForJumpstart:
                        cid = None
                        for c in cards:
                            if 'arena_id' in cards[c] and cards[c]['arena_id'] == CardNameToArenaIDForJumpstart[name]:
                                cid = cards[c]['id']
                                break
                        # Some cards are labeled as JMP in Arena but not on Scryfall (Swaped cards). We can search for an alternative version.
                        if cid == None:
                            print("{} ({}) not found in cards...".format(name, cid))
                            candidates = [
                                key for key, val in cards.items() if val['name'] == name and val['set'] != 'jmp']
                            if len(candidates) == 0:
                                print(
                                    f" > Cannot find a good candidate ID for {name} !!")
                            else:
                                cid = max(candidates)
                                print(f"> Using {cid}")
                        booster["cards"] += [cid] * count
                    else:
                        print("Jumpstart Boosters: Card '{}' not found.".format(name))
            jumpstartBoosters.append(booster)
    print("Jumpstart Boosters: ", len(jumpstartBoosters))
    with open(JumpstartBoostersDist, 'w', encoding="utf8") as outfile:
        json.dump(jumpstartBoosters, outfile, ensure_ascii=False)
    print("Jumpstart boosters dumped to disk.")

###############################################################################


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


def getIcon(mtgset, icon_path):
    if not os.path.isfile("client/public/" + icon_path):
        try:
            response = requests.get(
                "https://api.scryfall.com/sets/{}".format(mtgset))
            scryfall_set_data = json.loads(response.content)
            if scryfall_set_data and 'icon_svg_uri' in scryfall_set_data:
                urllib.request.urlretrieve(
                    scryfall_set_data['icon_svg_uri'], "client/public/" + icon_path)
                if set == "rna":
                    overrideViewbox(icon_path, "0 0 32 32", "0 6 32 20")
                return icon_path
        except:
            print("Error getting set '{}' icon:".format(mtgset), sys.exc_info()[0])
    else:
        return icon_path
    return None


nth = 1
set_per_line = m1.floor(os.get_terminal_size().columns / 14)
subsets = []  # List of sub-sets associated to a larger, standard set.
for mtgset, group in groups:
    cardList = list(group)
    candidates = [x for x in SetsInfos if x['code'] == mtgset]
    if len(candidates) == 0:
        print("\nWarning: Set '{}' not found in SetsInfos.\n".format(mtgset))
        continue
    setdata = candidates[0]
    if ("parent_set_code" in setdata and mtgset != "ydmu"):
        subsets.append(mtgset)
    setinfos[mtgset] = {"code": mtgset,
                        "fullName": setdata['name'],
                        "cardCount": len(cardList),
                        "isPrimary": mtgset in PrimarySets
                        }
    if 'block' in setdata:
        setinfos[mtgset]["block"] = setdata['block']
    # con is a reserved keyword on windows
    icon_path = "img/sets/{}.svg".format(mtgset if mtgset != 'con' else 'conf')
    if getIcon(mtgset, icon_path) != None:
        setinfos[mtgset]['icon'] = icon_path
    print(' | {:6s} {:4d}'.format(mtgset, len(cardList)), end=(' |\n' if nth % set_per_line == 0 else ''))
    nth += 1
    cardList.sort(key=lambda c: c['rarity'])
    for rarity, rarityGroup in groupby(cardList, lambda c: c['rarity']):
        rarityGroupList = list(rarityGroup)
        setinfos[mtgset][rarity + "Count"] = len(rarityGroupList)

setinfos["planeshifted_snc"] = {}
setinfos["planeshifted_snc"].update(setinfos["snc"])
setinfos["planeshifted_snc"].update({"code": "planeshifted_snc",
                                     "fullName": "Planeshifted New Capenna",
                                     "isPrimary": True,
                                     })

setinfos["mb1_convention_2019"] = {}
setinfos["mb1_convention_2019"].update(setinfos["mb1"])
setinfos["mb1_convention_2019"].update({"code": "mb1_convention_2019",
                                     "fullName": "Mystery Booster Convention 2019",
                                     "isPrimary": True,
                                     })
PrimarySets.append("mb1_convention_2019")
setinfos["mb1_convention_2021"] = {}
setinfos["mb1_convention_2021"].update(setinfos["mb1"])
setinfos["mb1_convention_2021"].update({"code": "mb1_convention_2021",
                                     "fullName": "Mystery Booster Convention 2021",
                                     "isPrimary": True,
                                     })
PrimarySets.append("mb1_convention_2021")

# Add Portal sets as draftable (They're not meant to be drafted, but some users want to try anyway!) 
PrimarySets.append("por")
PrimarySets.append("p02")
PrimarySets.append("ptk")

# Create fake primary sets for each version of the Shadows over Innistrad Remastered bonus sheet, so users can choose rather than rely on the auto rotation.
with open("src/data/shadow_of_the_past.json", "r") as bonusSheetsFile:
    bonusSheets = json.loads(bonusSheetsFile.read())
    bonusSheetsIndex = 0
    for bonusSheet in bonusSheets:
        code = f"sir{bonusSheetsIndex}"
        PrimarySets.append(code)
        setinfos[code] = {}
        setinfos[code].update(setinfos["sir"])
        setinfos[code].update({"code": code,
                               "block": "Shadows over Innistrad Remastered",
                               "fullName": f"SIR: {bonusSheet['name']}",
                               "isPrimary": True,
                               })
        bonusSheetsIndex += 1

with open(SetsInfosPath, 'w+', encoding="utf8") as setinfosfile:
    json.dump(setinfos, setinfosfile, ensure_ascii=False, indent=4)

constants = {}
with open("src/data/constants.json", 'r', encoding="utf8") as constantsFile:
    constants = json.loads(constantsFile.read())
constants['PrimarySets'] = [
    s for s in PrimarySets if s in setinfos and s not in subsets and s not in ["ren", "rin", "a22", "y22", "j22", "sis", "ltc", "who", "wot", "rvr"]]  # Exclude some codes that are actually part of larger sets (tsb, fmb1, h1r... see subsets), or aren't out yet
with open("src/data/constants.json", 'w', encoding="utf8") as constantsFile:
    json.dump(constants, constantsFile, ensure_ascii=False, indent=4)
