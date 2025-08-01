from html import unescape
import sqlite3
import mmap
import json
import ijson
import requests
import os
import filecmp
import datetime
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
from termcolor import colored
from ordered_enum import OrderedEnum


class Rarity(OrderedEnum):
    mythic: int = 4
    rare: int = 3
    uncommon: int = 2
    common: int = 1


ScryfallSets = "data/scryfall-sets.json"
BulkDataPath = "data/scryfall-all-cards.json"
BulkDataArenaPath = "data/BulkArena.json"
FirstFinalDataPath = "data/MTGCards.0.json"
SetsInfosPath = "src/data/SetsInfos.json"
BasicLandIDsPath = "src/data/BasicLandIDs.json"
RatingSourceFolder = "data/LimitedRatings/"
JumpstartBoostersFolder = "data/JumpstartBoosters"
JumpstartSwaps = "data/JumpstartSwaps.json"
JumpstartBoostersDist = "src/data/JumpstartBoosters.json"
RatingsDest = "data/ratings.json"
ManaSymbolsFile = "src/data/mana_symbols.json"

ArenaRarity = {1: "basic", 2: "common", 3: "uncommon", 4: "rare", 5: "mythic"}  # I guess?

ForceDownload = ForceExtract = ForceCache = ForceRatings = ForceJumpstart = ForceJumpstartHH = ForceSymbology = (
    FetchSet
) = False
SetsToFetch = ""
if len(sys.argv) > 1:
    Arg = sys.argv[1].lower()
    ForceDownload = Arg == "dl"
    ForceCache = ForceDownload or Arg == "cache"
    ForceRatings = Arg == "ratings"
    ForceJumpstart = Arg == "jmp"
    ForceSymbology = Arg == "symb"
    FetchSet = Arg == "set" and len(sys.argv) > 2
    if FetchSet:
        SetsToFetch = sys.argv[2].lower()
        ForceCache = True

MTGAFolder = "H:/SteamLibrary/steamapps/common/MTGA/"
if "--mtga" in sys.argv:
    MTGAFolder = sys.argv[sys.argv.index("--mtga") + 1]

MTGADataFolder = f"{MTGAFolder}MTGA_Data/Downloads/Raw/"
MTGACardDBFiles = glob.glob(f"{MTGADataFolder}Raw_CardDatabase_*.mtga")

if len(MTGACardDBFiles) == 0:
    print(colored(f"No MTGA Card DB files found in {MTGADataFolder}", "red"))
    sys.exit(1)

db_age = min(
    [(datetime.datetime.now() - datetime.datetime.fromtimestamp(os.path.getmtime(x))).days for x in MTGACardDBFiles]
)
print(
    colored(f"\n  Don't forget to update Arena itself!", "yellow"),
    colored(f" (Last update {db_age} days ago)\n", "blue"),
)

CardsCollectorNumberAndSet = {}
CardNameToArenaIDForJumpstart = {}
AKRCards = {}
KLRCards = {}
J21MTGACollectorNumbers = {}

# Links oracle_ids to draft effects
DraftEffects = {
    "19047c4b-0106-455d-ab71-68cabfae7404": ["FaceUp", "AgentOfAcquisitions"],
    "70ff487d-96b3-4322-9975-59bf3c6b517f": ["FaceUp", "RemoveDraftCard", "TrackRemovedCardsNames"],
    "6ca0078f-d6b5-4643-b801-e7a98706f21c": ["FaceUp", "ArchdemonOfPaliano"],
    "bb6bda0d-ddb8-47fa-be07-bbcd73a52830": ["FaceUp", "CanalDredger"],
    "f10898a5-87ec-4a30-a383-9f9bcba3e4d0": ["FaceUp", "RemoveDraftCard", "CogworkGrinder"],
    "ec0d964e-ca2c-4252-8551-cf1916576653": ["FaceUp", "CogworkLibrarian"],
    "1269f7dc-a5d6-48e9-8887-b581ce38c204": ["FaceUp"],
    "5e8c6894-c9ad-4a50-af13-c2d95395c71e": ["FaceUp"],
    "8fedb2c2-fb13-4af1-b85e-714832562da7": ["FaceUp", "LeovoldsOperative"],
    "96d88811-d0d8-4c64-b7f2-8304d81c8cfa": ["FaceUp", "NoteCreatureName"],
    "6dd3be81-b6dc-42ee-9e0a-2e39e3f4e793": ["FaceUp", "NoteCreatureTypes"],
    "dc90b4aa-ba5e-4188-939d-b3920bd9ab0d": ["FaceUp", "NoteCardName"],
    "e40daee2-f9e6-489f-b3dd-274e5a6b8604": ["FaceUp"],
    "80ea63fd-691a-45ba-a4bf-862e5ec2922d": ["Reveal", "AetherSearcher"],
    "adfd33cb-086c-48f4-b443-ba971ff43684": ["Reveal", "CogworkSpy"],
    "c60ba5e9-dbfa-441b-a96f-9cc7fdfd2d76": ["Reveal", "NotePassingPlayer"],
    "abd78909-72dc-4d36-8990-39995fd071da": ["Reveal", "NoteDraftedCards"],
    "8ddbb63c-7f52-431b-bb82-e020b1c3749a": ["Reveal", "NoteDraftedCards"],
    "19a3c505-b180-47cc-bef3-9e807a8a4a3d": ["Reveal", "LoreSeeker"],
    "412fbf73-a471-42ad-83fe-14f19e4e9595": ["Reveal", "NoteDraftedCards"],
    "cf682012-de36-4ab4-ad94-c3c0fd7bce3f": ["Reveal", "ChooseColors"],
    "6ea507d3-2b8d-4f08-824c-0de0ae214da5": ["Reveal", "NoteDraftedCards"],
    "db8e3c05-12d6-41f6-8cc7-e64c863fca58": ["Reveal", "ChooseColors"],
    "d5fc017a-7517-4737-ad5b-cc45f1e139ea": ["Reveal"],
}

LangCodes = ["enUS", "frFR", "deDE", "itIT", "esES", "ptBR", "jaJP", "koKR"]
MTGALocalization = {key: {} for key in LangCodes}
for path in MTGACardDBFiles:
    MTGACardDB = sqlite3.connect(path)
    MTGACardDB.row_factory = sqlite3.Row
    for lang in LangCodes:
        for row in MTGACardDB.execute(f"SELECT LocId, Loc FROM Localizations_{lang}").fetchall():
            MTGALocalization[lang][row["LocId"]] = row["Loc"]
    for o in MTGACardDB.execute(f"SELECT * FROM Cards").fetchall():
        # Ignore... Wildcards?! (TitleId 0)
        if o["TitleId"] not in MTGALocalization["enUS"]:
            continue
        fixed_name = MTGALocalization["enUS"][o["TitleId"]].replace(" /// ", " // ")
        fixed_name = re.sub(r"<[^>]*>", "", fixed_name)
        setCode = o["ExpansionCode"].lower()
        if o["IsPrimaryCard"] == 1:
            if setCode == "conf":
                setCode = "con"
            if setCode == "dar":
                setCode = "dom"
            collectorNumber = o["CollectorNumber"] if "CollectorNumber" in o else o["CollectorNumber"]
            # Process AKR cards separately (except basics)
            if setCode == "akr":
                if o["Rarity"] != 1:
                    AKRCards[fixed_name] = (o["GrpId"], collectorNumber, ArenaRarity[o["Rarity"]])
            if setCode == "klr":
                if o["Rarity"] != 1:
                    KLRCards[fixed_name] = (o["GrpId"], collectorNumber, ArenaRarity[o["Rarity"]])
            else:
                # Jumpstart introduced duplicate (CollectorNumbet, Set), thanks Wizard! :D
                # Adding name to disambiguate.
                CardsCollectorNumberAndSet[(fixed_name, collectorNumber, setCode)] = o["GrpId"]

            # Also look of the Arena only version (ajmp) of the card on Scryfall
            if setCode == "jmp":
                CardsCollectorNumberAndSet[(fixed_name, collectorNumber, "ajmp")] = o["GrpId"]

            # From Jumpstart: Prioritizing cards from JMP and M21
            if fixed_name not in CardNameToArenaIDForJumpstart or setCode in ["jmp", "m21"]:
                CardNameToArenaIDForJumpstart[fixed_name] = o["GrpId"]

            if "IsRebalanced" in o and o["IsRebalanced"]:
                CardsCollectorNumberAndSet[("A-" + fixed_name, "A-" + collectorNumber, setCode)] = o["GrpId"]
                CardNameToArenaIDForJumpstart["A-" + fixed_name] = o["GrpId"]
            # FIXME: J21 collector number differs between Scryfall and MTGA, record them to translate when exporting
            #        (Also for secondary cards as there's some created cards in this set.)
            if setCode == "j21":
                J21MTGACollectorNumbers[fixed_name] = collectorNumber

print("AKRCards length: {}".format(len(AKRCards.keys())))
print("KLRCards length: {}".format(len(KLRCards.keys())))

opener = urllib.request.build_opener()
opener.addheaders = [("User-agent", "Mozilla/5.0"), ("Accept", "*/*")]
urllib.request.install_opener(opener)

# Get mana symbols info from Scryfall
SymbologyFile = "./data/symbology.json"
if not os.path.isfile(ManaSymbolsFile) or ForceSymbology:
    urllib.request.urlretrieve("https://api.scryfall.com/symbology", SymbologyFile)
    mana_symbols = {}
    with open(SymbologyFile, "r", encoding="utf8") as file:
        symbols = json.load(file)
        for s in symbols["data"]:
            mana_symbols[s["symbol"]] = {"cmc": s["cmc"], "colors": s["colors"]}
    with open(ManaSymbolsFile, "w", encoding="utf8") as outfile:
        json.dump(mana_symbols, outfile, indent=4)

ManaSymbols = json.load(open(ManaSymbolsFile, "r"))


def parseCost(mana_cost: str) -> [int, list[str]]:
    if "//" in mana_cost:
        mana_cost = mana_cost.split("//")[0].strip()
    matches = re.findall(r"({[^}]+})", mana_cost)
    cmc = 0
    colors = set()
    for symbol in matches:
        if symbol in ManaSymbols:
            cmc += ManaSymbols[symbol]["cmc"]
            colors = colors.union(set(ManaSymbols[symbol]["colors"]))
    lcolors = list(colors)
    lcolors.sort(key=lambda val: {"W": 0, "U": 1, "B": 2, "R": 3, "G": 4}[val])
    return [int(cmc), lcolors]


with open("data/MTGADataDebug.json", "w") as outfile:
    MTGADataDebugToJSON = {}
    for key in CardsCollectorNumberAndSet.keys():
        MTGADataDebugToJSON[str(key)] = CardsCollectorNumberAndSet[key]
    json.dump(MTGADataDebugToJSON, outfile, sort_keys=True, indent=4)
with open("data/J21MTGACollectorNumbers.json", "w") as outfile:
    json.dump(J21MTGACollectorNumbers, outfile, sort_keys=True, indent=4)

if not os.path.isfile(BulkDataPath) or ForceDownload:
    # Get Bulk Data URL
    response = requests.get("https://api.scryfall.com/bulk-data")
    bulkdata = json.loads(response.content)
    allcardObject = next(x for x in bulkdata["data"] if x["type"] == "all_cards")
    if allcardObject is None:
        raise Exception("Could not find all_cards bulk data")
    skip = False

    if os.path.isfile(BulkDataPath):
        updateTime = datetime.datetime.fromisoformat(allcardObject["updated_at"])
        localFileTimestamp = os.path.getmtime(BulkDataPath)
        localFileTime = datetime.datetime.fromtimestamp(localFileTimestamp, tz=datetime.timezone.utc)
        if updateTime < localFileTime:
            print(
                f"Bulk data is already up-to-date (local: {localFileTime}, online: {allcardObject['updated_at']}, {updateTime})."
            )
            skip = True
    if not skip:
        allcardURL = allcardObject["download_uri"]
        print("Downloading {}...".format(allcardURL))
        urllib.request.urlretrieve(allcardURL, BulkDataPath)


if not os.path.isfile(ScryfallSets) or ForceDownload:
    urllib.request.urlretrieve("https://api.scryfall.com/sets", ScryfallSets)
    os.system(f"npx prettier --write {ScryfallSets}")
SetsInfos = json.load(open(ScryfallSets, "r", encoding="utf8"))["data"]
PrimarySets = [s["code"] for s in SetsInfos if s["set_type"] in ["core", "expansion", "masters", "draft_innovation"]]
PrimarySets.extend(["unf", "ugl", "unh", "ust", "und"])  # Add Un-Sets as primary.
PrimarySets.extend(["hbg", "planeshifted_snc", "ydmu"])
PrimarySets.append("mat")  # Support mat as a draftable set (mom + mat cards)


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


import decimal


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            # choose float() or str() here; float is usual if you want numbers
            return float(o)
        return super().default(o)


# Manually fetch up-to-date data for a specific set (really unoptimized)
if FetchSet:
    updatedcards = []
    for setCode in SetsToFetch.split(","):
        print("Fetching cards from {}...".format(setCode))
        req_result = requests.get(
            f"https://api.scryfall.com/cards/search?include_extras=true&include_variations=true&order=set&unique=prints&q=e%3A{setCode}"
        ).json()

        print(f"  Expected cards: {req_result['total_cards']}")
        setcards = req_result["data"]
        while req_result["has_more"]:
            req_result = requests.get(req_result["next_page"]).json()
            setcards = setcards + req_result["data"]
        print(f"  Got {len(setcards)} cards from Scryfall for {setCode}.")
        updatedcards = updatedcards + setcards
    print(f"Total cards: {len(updatedcards)}")

    tmpFilePath = BulkDataPath + ".tmp"
    with open(BulkDataPath, "r", encoding="utf-8") as infile, open(tmpFilePath, "w", encoding="utf-8") as outfile:
        outfile.write("[\n")
        first = True

        setcards_by_ids = {card["id"]: card for card in updatedcards}

        print(f"Checking {len(setcards_by_ids)} cards...")

        for obj in ijson.items(infile, "item"):
            if not first:
                outfile.write(",\n")
            first = False
            if obj["id"] in setcards_by_ids:
                print(f"  Updating {obj['name']}")
                json.dump(setcards_by_ids.pop(obj["id"]), outfile, cls=DecimalEncoder)
            else:
                json.dump(obj, outfile, cls=DecimalEncoder)

        print(f"Writing {len(setcards_by_ids)} new cards...")

        for card in setcards_by_ids.values():
            if not first:
                outfile.write(",\n")
            first = False
            print(f"  Adding {card['name']}")
            json.dump(card, outfile, cls=DecimalEncoder)

        outfile.write("]")

    if os.path.isfile(BulkDataPath + ".bak"):
        os.remove(BulkDataPath + ".bak")
    os.rename(BulkDataPath, BulkDataPath + ".bak")
    os.rename(tmpFilePath, BulkDataPath)

    ForceCache = True


def handleTypeLine(typeLine: str) -> [str, list[str]]:
    arr = typeLine.split(" — ")
    types = arr[0]
    subtypes = []  # Unused for now
    if len(arr) > 1:
        subtypes = arr[1].split()
    return types, subtypes


CardRatings = {}
with open("data/ratings_base.json", "r", encoding="utf8") as file:
    CardRatings = dict(CardRatings, **json.loads(file.read()))
if not os.path.isfile(RatingsDest) or ForceRatings:
    for path in glob.glob("{}/*.htm*".format(RatingSourceFolder)):
        with open(path, "r", encoding="utf8") as file:
            text = file.read()
            matches = re.findall(
                r"([^\s][^\n]+)\n\n.*\n?\*Pro Rating: ([0-9]*\.?[0-9]*( // ([0-9]*\.?[0-9]*))?)\*", text
            )
            print("Extracting ratings from ", path, ": Found ", len(matches), " matches.")
            for m in matches:
                if m[1] == "":
                    continue
                else:
                    try:
                        rating = float(m[1])
                    except ValueError:
                        vals = m[1].split("//")
                        rating = (float(vals[0]) + float(vals[1])) / 2
                print(unescape(m[0]), " ", rating)
                CardRatings[unescape(m[0])] = rating

    with open(RatingsDest, "w") as outfile:
        json.dump(CardRatings, outfile, indent=2)
else:
    with open(RatingsDest, "r", encoding="utf8") as file:
        CardRatings = dict(CardRatings, **json.loads(file.read()))


def safeInBoosterCheck(card: dict, max: int) -> bool:
    try:
        number = int(card["collector_number"])
        return number > 0 and number <= max
    except:
        return False


# Keep track of cards that were not added to the database (by (name, set, collector number))). After the first pass this will contain cards never printed in English.
NonProcessedCards = {}
if not os.path.isfile(FirstFinalDataPath) or ForceCache or FetchSet:
    all_cards = []
    with open(BulkDataPath, "r", encoding="utf8") as file:
        objects = ijson.items(file, "item")
        ScryfallCards = (o for o in objects if not (o["layout"] in ["token", "double_faced_token", "art_series"]))
        # print("Loading Scryfall bulk data... ")
        # ScryfallCards = json.load(file)

        akr_candidates = {}
        klr_candidates = {}
        print("\rPreProcessing... ", end="", flush=True)
        copied = 0
        handled = 0
        for c in ScryfallCards:
            handled += 1

            if c["layout"] in ["token", "double_faced_token", "emblem", "art_series"]:
                # Essence of Ajani is an playtest emblem that can played as a normal card.
                if c["name"] not in ["Essence of Ajani"]:
                    continue

            # Tag this card as a candidate for AKR card images (to avoid using MTGA images)
            if c["name"] in AKRCards:
                if c["name"] not in akr_candidates:
                    akr_candidates[c["name"]] = {}
                # Prioritize version of cards from Amonkhet (AKH) or Hour of Devastation (HOU)
                if (
                    (c["set"].lower() in ["akh", "hou"])
                    or c["lang"] not in akr_candidates[c["name"]]
                    or (
                        akr_candidates[c["name"]][c["lang"]]["set"] not in ["akh", "hou"]
                        and (
                            c["released_at"] > akr_candidates[c["name"]][c["lang"]]["released_at"]
                            or (c["frame"] == "2015" and akr_candidates[c["name"]][c["lang"]]["frame"] == "1997")
                        )
                    )
                ):
                    akr_candidates[c["name"]][c["lang"]] = c
            if c["name"] in KLRCards:
                if c["name"] not in klr_candidates:
                    klr_candidates[c["name"]] = {}
                # Prioritize version of cards from Kaladesh (KLD) or Aether Revolt (AER)
                if (
                    (c["set"].lower() in ["kld", "aer"])
                    or c["lang"] not in klr_candidates[c["name"]]
                    or (
                        klr_candidates[c["name"]][c["lang"]]["set"] not in ["kld", "aer"]
                        and (
                            c["released_at"] > klr_candidates[c["name"]][c["lang"]]["released_at"]
                            or (c["frame"] == "2015" and klr_candidates[c["name"]][c["lang"]]["frame"] == "1997")
                        )
                    )
                ):
                    klr_candidates[c["name"]][c["lang"]] = c

            frontName = c["name"]
            if " //" in frontName:
                faceNames = frontName.split(" //")
                frontName = faceNames[0]
                # Reversible cards (both sides are the same, just with a different art) special case: There's some inconsistency in the Scryfall data, sometimes the name is repeated, sometimes not. Never repeat it.
                if faceNames[0] == faceNames[1].strip():
                    c["name"] = frontName
                # And some reversible cards also have an adventure... e.g. Bloomvine Regent, becomes "Bloomvine Regent // Claim Territory // Bloomvine Regent"
                if len(faceNames) == 3 and faceNames[0] == faceNames[2].strip():
                    c["name"] = f"{faceNames[0]} //{faceNames[1]}"
            if (c["name"], c["collector_number"], c["set"].lower()) in CardsCollectorNumberAndSet:
                c["arena_id"] = CardsCollectorNumberAndSet[(c["name"], c["collector_number"], c["set"].lower())]
            elif (frontName, c["collector_number"], c["set"].lower()) in CardsCollectorNumberAndSet:
                c["arena_id"] = CardsCollectorNumberAndSet[(frontName, c["collector_number"], c["set"].lower())]

            # Workaround for Teferi, Master of Time (M21) variations (exclude all except the first one from boosters)
            if c["set"] == "m21" and c["collector_number"] in ["275", "276", "277"]:
                c["booster"] = False
            # Workaround for premium version of some afr cards
            cnAsInt = 0
            try:
                cnAsInt = int(c["collector_number"])
                if c["set"] == "afr" and ("★" in c["collector_number"] or cnAsInt > 281):
                    c["booster"] = False
            except ValueError:
                pass

            all_cards.append(c)
            copied += 1
            if handled % 1000 == 0:
                print(f"\rPreProcessing...    {copied}/{handled} cards added...", end="", flush=True)
        print(f"\rPreProcessing done! {copied}/{handled} cards added.")

        print("Fixing AKR images...", end="", flush=True)
        MissingAKRCards = AKRCards.copy()
        for name in akr_candidates:
            del MissingAKRCards[name]
        if len(MissingAKRCards) > 0:
            print("MissingAKRCards: ", MissingAKRCards)
        MissingKLRCards = KLRCards.copy()
        for name in klr_candidates:
            del MissingKLRCards[name]
        if len(MissingKLRCards) > 0:
            print("MissingKLRCards: ", MissingKLRCards)

        for c in all_cards:
            if c["set"] == "akr" and c["name"] in akr_candidates and c["lang"] in akr_candidates[c["name"]]:
                c["image_uris"]["border_crop"] = akr_candidates[c["name"]][c["lang"]]["image_uris"]["border_crop"]
            if c["set"] == "klr" and c["name"] in klr_candidates and c["lang"] in klr_candidates[c["name"]]:
                c["image_uris"]["border_crop"] = klr_candidates[c["name"]][c["lang"]]["image_uris"]["border_crop"]

        print(" Done!\n")
    cards = {}
    cardsByName = {}
    Translations = {}
    print("Generating card data cache...")

    def addCard(c: dict):
        if c["name"] in cardsByName:
            cardsByName[c["name"]].append(c)
        else:
            cardsByName[c["name"]] = [c]

        selection = {
            key: value
            for key, value in c.items()
            if key in {"arena_id", "name", "set", "mana_cost", "rarity", "collector_number"}
        }
        if "mana_cost" not in selection and "card_faces" in c:
            selection["mana_cost"] = c["card_faces"][0]["mana_cost"]
        if "mana_cost" not in selection:
            print(f"/!\\ {c['name']}: Missing mana cost.")
            selection["mana_cost"] = "{0}"
        selection["type"], selection["subtypes"] = handleTypeLine(c["type_line"].split(" //")[0])

        if selection["name"] in CardRatings:
            selection["rating"] = CardRatings[selection["name"]]
        elif selection["name"].split(" //")[0] in CardRatings:
            selection["rating"] = CardRatings[selection["name"].split(" //")[0]]
        else:
            match selection["rarity"]:
                case "mythic":
                    selection["rating"] = 1.0
                case "rare":
                    selection["rating"] = 0.8
                case "uncommon":
                    selection["rating"] = 0.7
                case "common":
                    selection["rating"] = 0.5
                case _:
                    selection["rating"] = 0.5

        selection["in_booster"] = c["booster"] and (
            c["layout"] != "meld" or not selection["collector_number"].endswith("b")
        )  # Exclude melded cards from boosters

        if not c["booster"]:
            selection["in_booster"] = False

        if c["type_line"].startswith("Basic"):
            selection["in_booster"] = False
            selection["rating"] = 0

        cmc, colors = parseCost(selection["mana_cost"])
        selection["cmc"] = cmc
        selection["colors"] = colors

        # Conspiracy Draft Effects
        if c["oracle_id"] in DraftEffects:
            selection["draft_effects"] = [{"type": t} for t in DraftEffects[c["oracle_id"]]]

        # Workaround: Not sure why this printing is marked as in booster, but it causes a doubled entry in stx rares
        if c["id"] == "0826e210-2002-43fe-942d-41922dfd7bc2":
            selection["in_booster"] = False

        # Workaround: Remove cards from HBG that received a rebalanced version from packs
        if c["id"] in [
            "057c66a8-9424-4c88-9707-5d8ef9170119",
            "e07d5fd5-d513-46d4-8812-6e6e55a6dfda",
            "a5cbda07-53a0-4526-9955-36f902073cf1",
            "ea4f1d5d-7991-4a2d-b907-3522e951ad4c",
            "884565bb-ed33-4372-8c81-487c2ee2f73c",
        ]:
            selection["in_booster"] = False

        match c["set"]:
            case "sta":
                selection["in_booster"] = not selection["collector_number"].endswith("e")
            case "akr" | "klr":
                selection["in_booster"] = c["booster"] and not c["type_line"].startswith("Basic")
            case "war":
                if "promo_types" in c and "jpwalker" in c["promo_types"]:
                    selection["in_booster"] = False
            # Commanders from CLB commanders deck are incorrectly marked as in_booster by scryfall
            case "clb":
                if int(c["collector_number"]) >= 646 and int(c["collector_number"]) <= 649:
                    selection["in_booster"] = False
            # Manually remove special printing from Double Masters 2022 packs
            case "2x2":
                if int(c["collector_number"]) >= 332:
                    selection["in_booster"] = False
            # Make sure retro cards from DMR are marked as in_booster
            case "dmr":
                if int(c["collector_number"]) >= 262 and int(c["collector_number"]) <= 401:
                    selection["in_booster"] = True
            # Cards from SIR are not marked as in_booster for some reason
            case "sir":
                if not c["type_line"].startswith("Basic") and not c["collector_number"].endswith("b"):
                    selection["in_booster"] = True
            case "ltr":
                # Workaround: Remove alternate printings and Jumpstart cards from LTR draft boosters (and the 20 basics)
                selection["in_booster"] = safeInBoosterCheck(c, 261)
                if "Ring tempts you" in c["oracle_text"] and (
                    "all_parts" not in c
                    or next((x for x in c["all_parts"] if x["id"] == "7215460e-8c06-47d0-94e5-d1832d0218af"), None)
                    == None
                ):
                    if "related_cards" not in selection:
                        selection["related_cards"] = []
                    selection["related_cards"].append("7215460e-8c06-47d0-94e5-d1832d0218af")

            case "cmm":
                selection["in_booster"] = safeInBoosterCheck(c, 436)
            case "woe":
                selection["in_booster"] = safeInBoosterCheck(c, 261)
            case "lci":
                selection["in_booster"] = safeInBoosterCheck(c, 286)
            case "ktk":
                # Duplicates; These versions from Arena should not be in boosters
                if c["collector_number"].endswith("y"):
                    selection["in_booster"] = False
            case "rvr":
                selection["in_booster"] = safeInBoosterCheck(c, 291)
            case "mkm":
                selection["in_booster"] = safeInBoosterCheck(c, 271)
            case "otj":
                selection["in_booster"] = safeInBoosterCheck(c, 271)
            case "otp":
                selection["in_booster"] = safeInBoosterCheck(c, 65)
            case "big":
                selection["in_booster"] = safeInBoosterCheck(c, 30)
            case "mh3":
                selection["in_booster"] = safeInBoosterCheck(c, 261)
            case "blb":
                selection["in_booster"] = safeInBoosterCheck(c, 261)
            case "dsk":
                selection["in_booster"] = safeInBoosterCheck(c, 271)
            case "usg" | "5ed" | "6ed" | "7ed" | "8ed":
                if c["collector_number"].endswith("s"):
                    selection["in_booster"] = False
            case "mb2":
                selection["in_booster"] = True
            case "fdn":
                selection["in_booster"] = (
                    (int(c["collector_number"]) > 0 and int(c["collector_number"]) < 259)
                    or int(c["collector_number"]) == 262
                    or int(c["collector_number"]) == 264
                    or int(c["collector_number"]) == 267
                )
            case "pio":
                selection["in_booster"] = int(c["collector_number"]) < 279
            case "inr":
                try:
                    if c["collector_number"].endswith("a"):
                        selection["in_booster"] = int(c["collector_number"][:-1]) < 288
                    else:
                        selection["in_booster"] = int(c["collector_number"]) < 288
                except:
                    selection["in_booster"] = False
            case "dft":
                selection["in_booster"] = safeInBoosterCheck(c, 271)
            case "tdm":
                selection["in_booster"] = safeInBoosterCheck(c, 271)
            case "fin":
                selection["in_booster"] = safeInBoosterCheck(c, 293)
                if selection["collector_number"].endswith("b"):
                    selection["in_booster"] = False
            case "eoe":
                selection["in_booster"] = safeInBoosterCheck(c, 261)

        if c["collector_number"].endswith("†"):
            selection["in_booster"] = False

        if c["layout"] == "split":
            if "Aftermath" in c["keywords"]:
                selection["layout"] = "split-left"
            elif not (
                c["layout"] == "split" and c["set"] == "cmb1"
            ):  # Mystery booster play-test split cards use the 'normal' layout
                selection["layout"] = "split"
        elif c["layout"] == "flip":
            selection["layout"] = "flip"

        cards[c["id"]].update(selection)

    for c in all_cards:
        # Some dual faced Secret Lair cards have some key information hidden in the card_faces array. Extract it.
        def copyFromFaces(prop: str) -> bool:
            if prop not in c:
                if (
                    "card_faces" in c
                    and len(c["card_faces"]) > 1
                    and prop in c["card_faces"][0]
                    and prop in c["card_faces"][1]
                    and c["card_faces"][0][prop] == c["card_faces"][1][prop]
                ):
                    c[prop] = c["card_faces"][0][prop]
                elif (
                    # Very special case for TDM reversible cards with adventures (e.g. Bloomvine Regent)
                    c["layout"] == "reversible_card"
                    and "card_faces" in c
                    and prop in c["card_faces"][0]
                ):
                    c[prop] = c["card_faces"][0][prop]
                else:
                    print(f"Warning: Missing '{prop}' for card '{c['name']}'.")
                    return False
            return True

        if copyFromFaces("type_line") == False:
            continue

        if c["id"] not in cards:
            if copyFromFaces("oracle_id") == False:
                continue
            cards[c["id"]] = {"id": c["id"], "oracle_id": c["oracle_id"]}

        key = (c["name"], c["set"], c["collector_number"])
        if key not in Translations:
            NonProcessedCards[key] = c
            Translations[key] = {"printed_names": {}, "image_uris": {}}

        if "printed_name" in c:
            Translations[key]["printed_names"][c["lang"]] = c["printed_name"]
        elif "card_faces" in c and "printed_name" in c["card_faces"][0]:
            Translations[key]["printed_names"][c["lang"]] = c["card_faces"][0]["printed_name"]

        if "image_uris" in c and "border_crop" in c["image_uris"]:
            Translations[key]["image_uris"][c["lang"]] = c["image_uris"]["border_crop"]
        elif (
            "card_faces" in c
            and "image_uris" in c["card_faces"][0]
            and "border_crop" in c["card_faces"][0]["image_uris"]
        ):
            Translations[key]["image_uris"][c["lang"]] = c["card_faces"][0]["image_uris"]["border_crop"]

        # Handle back side of double sided cards
        if c["layout"] == "transform" or c["layout"] == "modal_dfc" or c["layout"] == "reversible_card":
            if "card_faces" not in c:
                print(f"/!\\ {c['name']}: Missing card faces with layout {c['layout']}.")
            else:
                if "back" not in Translations[key]:
                    Translations[key]["back"] = {
                        "name": c["card_faces"][1]["name"],
                        "printed_names": {},
                        "image_uris": {},
                    }
                    if "type_line" not in c["card_faces"][1]:
                        print(f"/!\\ {c['name']}: Missing back side type line.")
                    else:
                        Translations[key]["back"]["type"], Translations[key]["back"]["subtypes"] = handleTypeLine(
                            c["card_faces"][1]["type_line"]
                        )
                Translations[key]["back"]["printed_names"][c["lang"]] = (
                    c["card_faces"][1]["printed_name"]
                    if "printed_name" in c["card_faces"][1]
                    else c["card_faces"][1]["name"]
                )
                if "image_uris" not in c["card_faces"][1]:  # Temp workaround while STX data is still incomplete
                    print(f"/!\\ {c['name']}: Missing back side image.")
                else:
                    Translations[key]["back"]["image_uris"][c["lang"]] = c["card_faces"][1]["image_uris"]["border_crop"]

        if c["lang"] == "en":
            if key in NonProcessedCards:
                del NonProcessedCards[key]
            addCard(c)

    # Handle cards with no English translation
    print(f"{len(NonProcessedCards)} cards with no English translation.")
    for key, c in NonProcessedCards.items():
        print(f" -> Non-english card: {c['name']} ({c['set']}), {c['lang']} {c['booster']}")
        # c['image_uris'][c['lang']] = Translations[key]['image_uris'][c['lang']]
        # c['image_uris']['en'] = Translations[key]['image_uris'][c['lang']]
        Translations[key]["image_uris"]["en"] = Translations[key]["image_uris"][c["lang"]]
        addCard(c)

    MTGACards = {}
    MTGACardsAlternates = {}
    for cid in list(cards):
        c = cards[cid]
        if "name" in c:
            key = (c["name"], c["set"], c["collector_number"])
            if key in Translations:
                c.update(Translations[key])
        else:
            del cards[cid]
        if "arena_id" in c:
            MTGACards[c["arena_id"]] = c
            if c["name"] not in MTGACardsAlternates:
                MTGACardsAlternates[c["name"]] = []
            MTGACardsAlternates[c["name"]].append(c["arena_id"])

    with open("client/src/data/MTGACards.json", "w", encoding="utf8") as outfile:
        json.dump(MTGACards, outfile, ensure_ascii=False, indent=4)
    with open("client/src/data/MTGAAlternates.json", "w", encoding="utf8") as outfile:
        json.dump(MTGACardsAlternates, outfile, ensure_ascii=False, indent=4)

    # Select the "best" (most recent, non special) printing of each card
    def selectCard(a, b):
        # Avoid non-english cards
        if (a["name"], a["set"], a["collector_number"]) in NonProcessedCards and (
            b["name"],
            b["set"],
            b["collector_number"],
        ) not in NonProcessedCards:
            return b
        if (a["name"], a["set"], a["collector_number"]) not in NonProcessedCards and (
            b["name"],
            b["set"],
            b["collector_number"],
        ) in NonProcessedCards:
            return a
        # Special case for conjure-only cards from J21 that should be avoided.
        if a["set"] == "j21" and int(a["collector_number"]) >= 777:
            return b
        if b["set"] == "j21" and int(b["collector_number"]) >= 777:
            return a
        # Vintage Masters: Not importable in Arena.
        if a["set"] == "vma" and b["set"] != "vma":
            return b
        if a["set"] != "vma" and b["set"] == "vma":
            return a
        # Only one of them is marked as a Primary card in Arena
        if (a["name"], a["collector_number"], a["set"].lower()) in CardsCollectorNumberAndSet and (
            b["name"],
            b["collector_number"],
            b["set"].lower(),
        ) not in CardsCollectorNumberAndSet:
            return a
        if (a["name"], a["collector_number"], a["set"].lower()) not in CardsCollectorNumberAndSet and (
            b["name"],
            b["collector_number"],
            b["set"].lower(),
        ) in CardsCollectorNumberAndSet:
            return b
        # Prefer a card with an Arena ID
        if "arena_id" in a and "arena_id" not in b:
            return a
        if "arena_id" not in a and "arena_id" in b:
            return b
        # Avoid special frame effects
        if ("finishes" in a and any(i in ["etched"] for i in a["finishes"])) and (
            ("finishes" not in b) or (not any(i in ["etched"] for i in b["finishes"]))
        ):
            return b
        if ("finishes" in b and any(i in ["etched"] for i in b["finishes"])) and (
            ("finishes" not in a) or (not any(i in ["etched"] for i in a["finishes"]))
        ):
            return a
        if ("frame_effects" in a and any(i in ["showcase", "extendedart", "etched"] for i in a["frame_effects"])) and (
            ("frame_effects" not in b)
            or (not any(i in ["showcase", "extendedart", "etched"] for i in b["frame_effects"]))
        ):
            return b
        if ("frame_effects" in b and any(i in ["showcase", "extendedart", "etched"] for i in b["frame_effects"])) and (
            ("frame_effects" not in a)
            or (not any(i in ["showcase", "extendedart", "etched"] for i in a["frame_effects"]))
        ):
            return a
        if a["image_status"] != "highres_scan" and b["image_status"] == "highres_scan":
            return b
        if a["image_status"] == "highres_scan" and b["image_status"] != "highres_scan":
            return a
        if a["set"] in PrimarySets and not b["set"] in PrimarySets:
            return a
        if a["set"] not in PrimarySets and b["set"] in PrimarySets:
            return b
        if not a["promo"] and b["promo"]:
            return a
        if a["promo"] and not b["promo"]:
            return b
        return (
            a
            if a["released_at"] > b["released_at"]
            or (
                a["released_at"] == a["released_at"]
                and (
                    a["collector_number"] < b["collector_number"]
                    if not (a["collector_number"].isdigit() and b["collector_number"].isdigit())
                    else int(a["collector_number"]) < int(b["collector_number"])
                )
            )
            else b
        )

    for name in cardsByName:
        cardsByName[name] = functools.reduce(selectCard, cardsByName[name])["id"]
    # Handle both references to the full names for just the front face
    for name in list(cardsByName):
        if " // " in name and name.split(" //")[0] not in cardsByName:
            cardsByName[name.split(" //")[0]] = cardsByName[name]

    cards_items = list(cards.items())
    print(f"Split DB, starting with {len(cards)} cards")
    total = 0
    for i in range(4):
        part = dict(cards_items[i * len(cards) // 4 : (i + 1) * len(cards) // 4])
        print(f"  Adding {len(part)} cards to MTGCards.{i}.json")
        total += len(part)
        with open(f"data/MTGCards.{i}.json", "w", encoding="utf8") as outfile:
            json.dump(part, outfile, ensure_ascii=False, indent=4)
    if total != len(cards):
        print("Error: Some cards were not written to the split DB")

    with open("data/CardsByName.json", "w", encoding="utf8") as outfile:
        json.dump(cardsByName, outfile, ensure_ascii=False, indent=4)

cards = {}
DBFiles = glob.glob("data/MTGCards.*.json")
for f in DBFiles:
    with open(f, "r", encoding="utf8") as file:
        cards.update(json.loads(file.read()))

# Retrieve basic land ids for each set
BasicLandIDs = {}
for cid in cards:
    if (
        cards[cid]["type"].startswith("Basic")
        and (cards[cid]["name"], cards[cid]["set"], cards[cid]["collector_number"]) not in NonProcessedCards
    ):
        if cards[cid]["set"] not in BasicLandIDs:
            BasicLandIDs[cards[cid]["set"]] = []
        BasicLandIDs[cards[cid]["set"]].append(cid)
    for mtgset in BasicLandIDs:
        BasicLandIDs[mtgset].sort()
with open(BasicLandIDsPath, "w+", encoding="utf8") as basiclandidsfile:
    json.dump(BasicLandIDs, basiclandidsfile, ensure_ascii=False, indent=4)

###############################################################################
# Generate Jumpstart pack data

if not os.path.isfile(JumpstartBoostersDist) or ForceJumpstart:
    print("Extracting Jumpstart Boosters...")
    jumpstartBoosters = []

    regex = re.compile(r"(\d+) (.*)")
    swaps = {}
    with open(JumpstartSwaps, "r", encoding="utf8") as file:
        swaps = json.loads(file.read())
    for path in glob.glob("{}/*.txt".format(JumpstartBoostersFolder)):
        with open(path, "r", encoding="utf8") as file:
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
                            if "arena_id" in cards[c] and cards[c]["arena_id"] == CardNameToArenaIDForJumpstart[name]:
                                cid = cards[c]["id"]
                                break
                        # Some cards are labeled as JMP in Arena but not on Scryfall (Swaped cards). We can search for an alternative version.
                        if cid == None:
                            print("{} ({}) not found in cards...".format(name, cid))
                            candidates = [
                                key for key, val in cards.items() if val["name"] == name and val["set"] != "jmp"
                            ]
                            if len(candidates) == 0:
                                print(f" > Cannot find a good candidate ID for {name} !!")
                            else:
                                cid = max(candidates)
                                print(f"> Using {cid}")
                        booster["cards"] += [cid] * count
                    else:
                        print("Jumpstart Boosters: Card '{}' not found.".format(name))
            jumpstartBoosters.append(booster)
    print("Jumpstart Boosters: ", len(jumpstartBoosters))
    with open(JumpstartBoostersDist, "w", encoding="utf8") as outfile:
        json.dump(jumpstartBoosters, outfile, ensure_ascii=False)
    print("Jumpstart boosters dumped to disk.")

###############################################################################


def overrideViewbox(svgPath, expectedViewbox, correctedViewbox):
    with open(svgPath, "r") as inputFile:
        inputFile.seek(0)
        content = inputFile.read()
        if 'viewBox="%s"' % expectedViewbox not in content:
            print("svg did not have expected viewbox: %s" % svgPath)
            return
        content = content.replace('viewBox="%s"' % expectedViewbox, 'viewBox="%s"' % correctedViewbox)
    with open(svgPath, "w") as outputFile:
        outputFile.write(content)


array = []
for key, value in cards.items():
    array.append(value)

print("Cards in database: ", len(array))
array.sort(key=lambda c: c["set"])
groups = groupby(array, lambda c: c["set"])
setinfos = {}

# Convert The List card names files to their corresponding IDs. Prefer plst version if available.
# This is extremely ineficient, I don't care right now.
for the_list_file in glob.glob("src/data/TheList/*.txt"):
    the_list_cards = {}
    with open(the_list_file, "r", encoding="utf8") as file:
        print("Processing: ", the_list_file)
        for line in file:
            name = line.strip().split("(")[0].strip()
            cset = line.strip().split("(")[1].split(")")[0].strip().lower()

            # Search for the plst version
            candidates = [
                v for k, v in cards.items() if v["name"] == name and (v["set"] == "plist" or v["set"] == "plst")
            ]
            if len(candidates) > 0:
                c = candidates[0]
                # Multiple possibiliies, search for the best match
                if len(candidates) > 1:
                    for card in candidates:
                        # Scryfall includes the code of the original set into the collector number
                        if cset in card["collector_number"].lower():
                            c = card
                            break
            else:
                # Revert to the original if not available
                c = next(v for k, v in cards.items() if v["name"] == name and v["set"] == cset)
            if c["rarity"] not in the_list_cards:
                the_list_cards[c["rarity"]] = []
            the_list_cards[c["rarity"]].append(c["id"])
    json.dump(the_list_cards, open(the_list_file.replace(".txt", ".json"), "w", encoding="utf8"), indent=2)


def getIcon(mtgset, icon_path):
    if not os.path.isfile(
        "client/public/" + icon_path
    ):  # or filecmp.cmp("client/public/" + icon_path, "client/public/img/sets/default.svg", shallow=False):
        try:
            response = requests.get("https://api.scryfall.com/sets/{}".format(mtgset))
            scryfall_set_data = json.loads(response.content)
            if scryfall_set_data and "icon_svg_uri" in scryfall_set_data:
                urllib.request.urlretrieve(scryfall_set_data["icon_svg_uri"], "client/public/" + icon_path)
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
    candidates = [x for x in SetsInfos if x["code"] == mtgset]
    if len(candidates) == 0:
        print("\nWarning: Set '{}' not found in SetsInfos.\n".format(mtgset))
        continue
    setdata = candidates[0]
    if "parent_set_code" in setdata and mtgset != "ydmu":
        subsets.append(mtgset)
    setinfos[mtgset] = {
        "code": mtgset,
        "fullName": setdata["name"],
        "cardCount": len(cardList),
        "isPrimary": mtgset in PrimarySets,
    }
    if "block" in setdata:
        setinfos[mtgset]["block"] = setdata["block"]
    # con is a reserved keyword on windows
    icon_path = "img/sets/{}.svg".format(mtgset if mtgset != "con" else "conf")
    if getIcon(mtgset, icon_path) != None:
        setinfos[mtgset]["icon"] = icon_path
    print(" | {:6s} {:4d}".format(mtgset, len(cardList)), end=(" |\n" if nth % set_per_line == 0 else ""))
    nth += 1
    cardList.sort(key=lambda c: c["rarity"])
    for rarity, rarityGroup in groupby(cardList, lambda c: c["rarity"]):
        rarityGroupList = list(rarityGroup)
        setinfos[mtgset][rarity + "Count"] = len(rarityGroupList)

setinfos["planeshifted_snc"] = {}
setinfos["planeshifted_snc"].update(setinfos["snc"])
setinfos["planeshifted_snc"].update(
    {
        "code": "planeshifted_snc",
        "fullName": "Planeshifted New Capenna",
        "isPrimary": True,
    }
)

setinfos["mb1"] = {
    "code": "mb1",
    "fullName": "Mystery Booster",
    "icon": "img/sets/mb1.svg",
    "isPrimary": True,
}
PrimarySets.append("mb1")
setinfos["mb1_convention_2019"] = {
    "code": "mb1_convention_2019",
    "fullName": "Mystery Booster Convention 2019",
    "icon": "img/sets/mb1.svg",
    "isPrimary": True,
}
PrimarySets.append("mb1_convention_2019")
setinfos["mb1_convention_2021"] = {
    "code": "mb1_convention_2021",
    "fullName": "Mystery Booster Convention 2021",
    "icon": "img/sets/mb1.svg",
    "isPrimary": True,
}
PrimarySets.append("mb1_convention_2021")
PrimarySets.append("mb2")

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
        setinfos[code].update(
            {
                "code": code,
                "block": "Shadows over Innistrad Remastered",
                "fullName": f"SIR: {bonusSheet['name']}",
                "isPrimary": True,
            }
        )
        bonusSheetsIndex += 1

# Pioneer Masters
PrimarySets.append("pio")
for i in range(0, 3):
    code = f"pio{i}"
    PrimarySets.append(code)
    setinfos[code] = {}
    setinfos[code].update(setinfos["pio"])
    setinfos[code].update(
        {
            "code": code,
            "block": "Pioneer Masters",
            "isPrimary": True,
        }
    )
setinfos["pio0"]["fullName"] = "Pioneer Masters: Devotion"
setinfos["pio1"]["fullName"] = "Pioneer Masters: Planeswalkers"
setinfos["pio2"]["fullName"] = "Pioneer Masters: Spells"

with open(SetsInfosPath, "w+", encoding="utf8") as setinfosfile:
    setinfos_disk = {}
    for set_code in setinfos:
        setinfos_disk[set_code] = {
            k: setinfos[set_code][k]
            for k in filter(lambda k: k in setinfos[set_code], ["code", "fullName", "block", "icon"])
        }
    json.dump(setinfos_disk, setinfosfile, ensure_ascii=False, indent=4)

constants = {}
with open("src/data/constants.json", "r", encoding="utf8") as constantsFile:
    constants = json.loads(constantsFile.read())
constants["PrimarySets"] = [
    s
    for s in PrimarySets
    if s in setinfos
    and s not in subsets
    and s not in ["ren", "rin", "a22", "y22", "j22", "sis", "ltc", "who", "wot", "acr", "tla", "spe", "spm"]
]  # Exclude some codes that are actually part of larger sets (tsb, fmb1, h1r... see subsets), or aren't out yet
with open("src/data/constants.json", "w", encoding="utf8") as constantsFile:
    json.dump(constants, constantsFile, ensure_ascii=False, indent=4)
