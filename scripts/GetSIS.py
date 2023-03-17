import json
import requests

# Retrieve Shadow of the Past (Shadow over Innistrad Remastered bonus list) cards IDs from Scryfall

ShadowOfPastLists = [
    {"name": "Creature Type Terror!",
     "card_names": [
         "Angel of Flight Alabaster",
         "Avacyn's Collar",
         "Battleground Geist",
         "Bloodline Keeper",
         "Butcher's Cleaver",
         "Diregraf Captain",
         "Drogskol Captain",
         "Elder Cathar",
         "Ghoulraiser",
         "Haunted Fengraf",
         "Havengul Runebinder",
         "Immerwolf",
         "Kruin Outlaw",
         "Mayor of Avabruck",
         "Moonmist",
         "Stromkirk Captain",
         "Traveler's Amulet",
         "Vampiric Fury"
     ]
     },
    {
        "name": "Fatal Flashback!",
        "card_names": [
            "Bump in the Night",
            "Cackling Counterpart",
            "Devil's Play",
            "Divine Reckoning",
            "Faithless Looting",
            "Feeling of Dread",
            "Forbidden Alchemy",
            "Gnaw to the Bone",
            "Increasing Ambition",
            "Lingering Souls",
            "Mystic Retrieval",
            "Past in Flames",
            "Rally the Peasants",
            "Sever the Bloodline",
            "Silent Departure",
            "Spider Spawning",
            "Travel Preparations",
            "Unburial Rites"
        ]
    },
    {
        "name": "Morbid and Macabre!",
        "card_names": [
            "Bloodflow Connoisseur",
            "Demonmail Hauberk",
            "Doomed Traveler",
            "Falkenrath Aristocrat",
            "Falkenrath Noble",
            "Galvanic Juggernaut",
            "Gutter Grime",
            "Hollowhenge Scavenger",
            "Murder of Crows",
            "Requiem Angel",
            "Séance",
            "Selhoff Occultist",
            "Skirsdag Cultist",
            "Skirsdag High Priest",
            "Stitcher's Apprentice",
            "Traitorous Blood",
            "Young Wolf",
            "Zealous Conscripts"
        ]
    },
    {
        "name": "Abominable All Stars!",
        "card_names": [
            "Avacyn, Angel of Hope",
            "Avacyn's Pilgrim",
            "Balefire Dragon",
            "Barter in Blood",
            "Blazing Torch",
            "Bonds of Faith",
            "Brimstone Volley",
            "Evolving Wilds",
            "Fiend Hunter",
            "Forge Devil",
            "Garruk Relentless",
            "Geist of Saint Traft",
            "Griselbrand",
            "Havengul Lich",
            "Huntmaster of the Fells",
            "Invisible Stalker",
            "Mist Raven",
            "Sigarda, Host of Herons",
            "Snapcaster Mage",
            "Somberwald Sage",
            "Tragic Slip",
            "Vessel of Endless Rest"
        ]
    }
]

for l in ShadowOfPastLists:
    print(l["name"])
    l["card_ids"] = []
    for card in l["card_names"]:
        r = requests.get(f"https://api.scryfall.com/cards/named?exact={card}&set=sis")
        d = r.json()
        if d["object"] != "card":
            print("Failed to find card: ", card)
            continue
        l["card_ids"].append(d["id"])

with open("./src/data/shadow_of_the_past.json", 'w', encoding="utf8") as f:
    json.dump(ShadowOfPastLists, f, ensure_ascii=False, indent=4)
