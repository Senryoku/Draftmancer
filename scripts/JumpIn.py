###############################################################################
# Retreive JumpIn pack information directly from Wizards' site
import os
import requests
import re 
import json
import urllib.parse
import html

Sets = [
    {"set": "dsk", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-in-packets-update-for-duskmourn-house-of-horror"},
    {"set": "blb", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-in-packets-update-for-bloomburrow"},
    {"set": "otj", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-in-packets-update-for-outlaws-of-thunder-junction"},
    {"set": "mkm", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-in-packets-update-for-murders-at-karlov-manor"},
    {"set": "lci", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-in-packets-update-for-the-lost-caverns-of-ixalan"},
    {"set": "woe", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-in-update-for-wilds-of-eldraine"},
    {"set": "ltr", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-into-middle-earth-on-mtg-arena"},
    {"set": "one", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-in-packets-update-for-phyrexia-all-will-be-one"},
    {"set": "bro", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-in-packets-update-for-the-brothers-war"},
    #{"set": "dmu", "url": "https://magic.wizards.com/en/news/mtg-arena/jump-packets-update-dominaria-united-2022-08-31"},
]

TitleRegex = r"<deck-list.* deck-title=\"(.*)\" format=\".*\">"
CardRegex = r"(\d+) (.*)"
AlternateLinesRegex = r"<tr[\s\S]*?<\/tr>"
AlternateCardsRegex = r"<td>(?:(?:<auto-card.*>|<a class=\"autocard-link\".*>))([^<]+)(?:<\/auto-card>|<\/a>)?<\/td>\s*\n\s*<td>(\d+)%<\/td>"

for entry in Sets:
    Set = entry["set"]
    PacketListURL = entry["url"]

    CardsByName = {}
    CardsByID = {}

    OutputFile = f'src/data/JumpInBoosters_{Set}.json'
    if not os.path.isfile(OutputFile):
        def getCardFromName(name):
            if name in CardsByName:
                return CardsByName[name]
            name = html.unescape(name)
            name = urllib.parse.quote(name)
            r = requests.get(f"https://api.scryfall.com/cards/named?exact={name}&set={Set}")
            if r.status_code != 200:
                r = requests.get(f"https://api.scryfall.com/cards/named?exact={name}")
                if r.status_code != 200:
                    print(f"Card not found: {name}")
                    exit()
            CardsByName[name] = r.json()
            CardsByID[r.json()["id"]] = r.json()
            return r.json()

        NameFixes = {
        }

        def fix_cardname(n):
            r = n.split(" //")[0].strip()
            if (r in NameFixes):
                return NameFixes[r]
            return r

        print(f"Extracting boosters for set {Set}...")
        jumpInBoosters = []
        page = requests.get(PacketListURL).text
        matches = re.finditer(TitleRegex, page, re.MULTILINE)
        matches_arr = []
        for m in matches:
            matches_arr.append(m)
            
        for idx in range(len(matches_arr)):
            deck_name = matches_arr[idx].group(1)
            print(f"Deck: {deck_name}")

            # find next occurrence of "<main-deck>"
            start = page.find("<main-deck>", matches_arr[idx].span()[1]) + len("<main-deck>")
            end = page.find("</main-deck>", start)
            deck = page[start:end]
            
            colors = set()

            cards_matches = re.findall(CardRegex, deck)
            set_cards = []
            for c in cards_matches:
                count = int(c[0])
                cardname = fix_cardname(c[1])
                card = getCardFromName(cardname)
                for color in filter(lambda a: a in "WUBRG", card["color_identity"]):
                    colors.add(color)
                for i in range(count):  # Add the card c[0] times
                    set_cards.append(card["id"])
                print(f"  {count} {card['name']:<50} ({card['id']})")
            if len(set_cards) == 0:
                print("Error: Not cards?")
                exit()
           
            start = page.find("<tbody>", matches_arr[idx].span()[1]) + len("<tbody>")
            end = page.find("</tbody>", start)

            altcards = []
            altline_matches = re.findall(AlternateLinesRegex, page[start:end])
            for l in altline_matches:
                alt_matches = re.findall(AlternateCardsRegex, l)
                altslot = []
                for altidx, alt in enumerate(alt_matches):
                    cardname = fix_cardname(alt[0])
                    percentage = int(alt[1])
                    card = getCardFromName(cardname)
                    altslot.append({"name": card["name"], "id": card["id"], "weight": percentage})
                    print(f"  [{percentage:>2}%] {card['name']:<50} ({card['id']})")
                    if altidx == 0 and card["id"] in set_cards:
                        set_cards.remove(card["id"])
                if len(altslot) > 0:
                    altcards.append(altslot)
                else:
                    print("Boosters: Empty Alt Slot.")
                    print(alt_matches)
            if len(altcards) == 0:
                print("Error: Not alts?")
                exit()
            print(f"Added Pack '{deck_name}', {len(set_cards)} + {len(altcards)} cards.")

            image = None
            image_rarity = None
            rarity_values = {"common":0, "uncommon":1, "rare":2, "mythic":3, "special":4}
            for cid in set_cards:
                c = CardsByID[cid]
                if image == None or c["rarity"] > image_rarity and "image_uris" in c:
                    image = c["image_uris"]["border_crop"]
                    image_rarity = c["rarity"]

            if image == None:
                image = "/img/cardback.webp"
                
            if os.path.isfile(f"client/public/img/jumpin/{deck_name.lower()}.png"):
                image = f"/img/jumpin/{deck_name.lower()}.png"

            jumpInBoosters.append({
                "name": deck_name, 
                "colors": list(colors), 
                "cycling_land": False,
                "image":  image, 
                "cards": set_cards, 
                "alts": altcards
            })
        print(f"JumpIn Boosters: {len(jumpInBoosters)}")
        for c in jumpInBoosters:
            print(f"{c['name']:<30}: {len(c['cards'])} + {len(c['alts'])} = {len(c['cards']) + len(c['alts'])} cards - {c['image']}")
        if len(jumpInBoosters) > 0:
            with open(OutputFile, 'w', encoding="utf8") as outfile:
                json.dump(jumpInBoosters, outfile, indent=4, ensure_ascii=False,)
            print("Dumped to disk.")