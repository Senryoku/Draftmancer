import os
import requests
import re 
import json
import urllib.parse
import html
import time

PacketListURL = "https://magic.wizards.com/en/news/announcements/foundations-jumpstart-booster-themes"

TitleRegex = r"<deck-list.* deck-title=\"(.*)\" format=\".*\">"
CardRegex = r"(?:(\d+) )?(.+)"

ImageNameRegex = re.compile("[^a-z]")

Packets = []
CardsByName = {}

def addCard(card):
    if card["name"] not in CardsByName:
        CardsByName[card["name"]] = card
        return
    prev = CardsByName[card["name"]]
    if card["set"] == "j25":
        if prev["set"] != "j25":
            CardsByName[card["name"]] = card
        elif prev["set"] == "j25" and int(prev["collector_number"]) > int(card["collector_number"]):
            CardsByName[card["name"]] = card
        return
    else:
        if prev["set"] == "j25":
            return
        if card["set"] == "fdn" and prev["set"] == "fdn" and int(prev["collector_number"]) > int(card["collector_number"]):
            CardsByName[card["name"]] = card
        return

def requestCards(s):
    res = requests.get(f"https://api.scryfall.com/cards/search?include_extras=true&include_variations=true&order=set&q=e%3A{s}&unique=prints").json()
    for card in res["data"]:
        addCard(card)
    while res["has_more"]:
        res = requests.get(res["next_page"]).json()
        for card in res["data"]:
            addCard(card)

requestCards("j25")
requestCards("fdn")

OutputFile = f'src/data/JumpstartFDN.json'
if not os.path.isfile(OutputFile):
    def getCardFromName(name):
        if name in CardsByName:
            return CardsByName[name]
        name = html.unescape(name)
        name = urllib.parse.quote(name)
        #r = requests.get(f"https://api.scryfall.com/cards/named?exact={name}&set=j25")
        #time.sleep(0.1)
        #if r.status_code != 200:
        #    r = requests.get(f"https://api.scryfall.com/cards/named?exact={name}&set=fdn")
        #    time.sleep(0.1)
        #    if r.status_code != 200:
        r = requests.get(f"https://api.scryfall.com/cards/named?exact={name}")
        time.sleep(0.1)
        if r.status_code != 200:
            print(f"Card not found: {name}")
            exit()
        CardsByName[name] = r.json()
        return r.json()
        
        
    NameFixes = {
    }

    def fix_cardname(n):
        r = n.split(" //")[0].strip()
        if (r in NameFixes):
            return NameFixes[r]
        return r

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
        pack_cards = []
        for c in cards_matches:
            count = int(c[0]) if c[0] else 1
            cardname = fix_cardname(c[1])
            print(f"  {count} {cardname:<50}", end="")
            card = getCardFromName(cardname)
            for color in filter(lambda a: a in "WUBRG", card["color_identity"]):
                colors.add(color)
            for i in range(count):  # Add the card c[0] times
                pack_cards.append(card["id"])
            print(f" ({card['id']}, {card['set']})")
        if len(pack_cards) == 0:
            print("Error: Not cards?")
            exit()

        Packets.append({"name": deck_name, "image": ImageNameRegex.sub("", deck_name.lower()), "cards": pack_cards})
        
    with open(OutputFile, 'w', encoding="utf8") as outfile:
        json.dump(Packets, outfile, indent=4, ensure_ascii=False,)
    print("Dumped to disk.")