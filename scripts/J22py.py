###############################################################################
# Retrieve Jumpstart 2022 pack information directly from Wizards' site

import requests
import re 
import json

Jumpstart22BoostersDist = 'src/data/Jumpstart2022Boosters.json'
PacketListURL = "https://magic.wizards.com/en/news/feature/jumpstart-2022-booster-themes-and-card-lists"
TitleRegex = r"<deck-list data-id=\"[^\"]+\" deck-title=\"([^\"\(]+)( \(\d\))?\" format=\"Limited\">"
CardsRegex = r"<main-deck>\n([^<]+)\n</main-deck>"
CardLineRegex = r"^(\d) (.*)$"

def fix_cardname(n):
    r = n.split(" //")[0].strip()
    r = r.replace("’", "'")
    return r

J22Cards = {}
print("Fetching J22 cards...")
result = requests.get(json.loads(requests.get(f"https://api.scryfall.com/sets/j22").content)["search_uri"]).json()
for c in result["data"]:
    J22Cards[c["name"]] = c["id"]
while result["has_more"]:
    result = requests.get(result["next_page"]).json()
    for c in result["data"]:
        J22Cards[c["name"]] = c["id"]

print("Extracting Jumpstart 2022 Boosters...")
jumpstart22Boosters = []
page = requests.get(PacketListURL).text

titles = re.finditer(TitleRegex, page, re.MULTILINE)
lists = re.findall(CardsRegex, page, re.MULTILINE)
for matchNum, match in enumerate(titles):
    name = match.group(1) + (match.group(2) if match.group(2) else "")
    group = match.group(1)
    print(f"Processing booster {matchNum}: '{name}' ({group})...")
    cardsRe = re.findall(CardLineRegex, lists[matchNum], re.MULTILINE)
    cards = []
    for c in cardsRe:
        cardname = fix_cardname(c[1])
        for i in range(int(c[0])):
            cards.append(J22Cards[cardname])
    jumpstart22Boosters.append({"name": name, "group": group, "cards": cards})

print("Jumpstart 2022 Boosters: {}/121".format(len(jumpstart22Boosters)))
with open(Jumpstart22BoostersDist, 'w', encoding="utf8") as outfile:
    json.dump(jumpstart22Boosters, outfile, indent=4, ensure_ascii=False,)
print("Jumpstart 2022 boosters dumped to disk.")