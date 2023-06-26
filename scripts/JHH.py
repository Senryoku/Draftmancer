###############################################################################
# Retreive Jumpstart: Historic Horizons pack information directly from Wizards' site

JumpstartHHBoostersDist = 'src/data/JumpstartHHBoosters.json'
PacketListURL = "https://magic.wizards.com/en/articles/archive/magic-digital/jumpstart-historic-horizons-packet-lists-2021-07-26"
TitleRegex = r"<span class=\"deck-meta\">\s*<h4>([^<]+)</h4>"
CardsRegex = r"<span class=\"card-count\">(\d+)</span>\s*<span class=\"card-name\">(?:<a[^>]*>)?([^<]+)(?:</a>)?</span>"
AlternateLinesRegex = r"<tr[\s\S]*?<\/tr>"
AlternateCardsRegex = r"<td><a href=\"https://gatherer\.wizards\.com/Pages/Card/Details\.aspx\?name=.*\" class=\"autocard-link\" data-image-url=\"https://gatherer\.wizards\.com/Handlers/Image\.ashx\?type=card&amp;name=.*\">(.+)</a></td>\s*<td>(\d+)%</td>"
TotalRegex = r"<div class=\"regular-card-total\">(\d+) Cards"

if not os.path.isfile(JumpstartHHBoostersDist):
    CardIDsByName = {}
    for cid in cards:
        cardname = cards[cid]["name"].split(" //")[0]
        if cardname not in CardIDsByName:
            CardIDsByName[cardname] = []
        CardIDsByName[cardname].append(cid)

    CyclingLands = {
        "W": "f27cfdab-7a27-4cd9-9f0d-c6fe8294e6c7", "U": "9db4c029-3f8d-4fd7-bb40-0414ca6fd4a0", "B": "bbf00df0-3857-4bd7-8993-656eb3426511", "R": "5e82b3fa-a7b8-4ca2-9ce3-054475b407cf", "G": "9ffbc971-f61c-4e04-bc52-4f9b5c31ef37"
    }

    def getIDFromNameForJHH(name):
        if name not in CardIDsByName:
            # print("Could not find a suitable CardID for '{}'".format(name))
            return None
        candidates = CardIDsByName[name]
        best = cards[candidates[0]]
        for cid in candidates:
            if cards[cid]["set"] == "j21":
                return cid
            elif cards[cid]["set"] == "mh2":
                best = cards[cid]
            elif cards[cid]["set"] == "m20" and best["set"] != "mh2":
                best = cards[cid]
            elif best["set"] == cards[cid]["set"] and cards[cid]["collector_number"].isdigit() and (not best["collector_number"].isdigit() or int(cards[cid]["collector_number"]) < int(best["collector_number"])):
                best = cards[cid]
            if "arena_id" in cards[cid] and "arena_id" not in best:
                best = cards[cid]
        return best["id"]

    NameFixes = {
        "Serra, the Benevolent": "Serra the Benevolent",
        "Storm-God's Oracle": "Storm God's Oracle",
        "Fall of the Imposter": "Fall of the Impostor",
        "Aliros, Enraptured": "Alirios, Enraptured",
        "Filligree Attendent": "Filigree Attendant",
        "Imposter of the Sixth Pride": "Impostor of the Sixth Pride",
        "Gadrak, the Crown Scourge": "Gadrak, the Crown-Scourge",
        "Scour all Possibilities": "Scour All Possibilities",
        "Storm-Kin Artist": "Storm-Kiln Artist",
        "Maurading Boneslasher": "Marauding Boneslasher",
        "Cemetary Recruitment": "Cemetery Recruitment",
        "Radiant&rsquo;s Judgment": "Radiant's Judgment",
        "Djeru&rsquo;s Renunciation": "Djeru's Renunciation",
        "Imposing Vantasau": "Imposing Vantasaur"
    }

    def fix_cardname(n):
        r = n.split(" //")[0].strip()
        if (r in NameFixes):
            return NameFixes[r]
        return r

    print("Extracting Jumpstart: Historic Horizons Boosters...")
    jumpstartHHBoosters = []
    page = requests.get(PacketListURL).text
    matches = re.finditer(TitleRegex, page)
    matches_arr = []
    for m in matches:
        matches_arr.append(m)
    for idx in range(len(matches_arr)):
        start = page.find("<div class=\"sorted-by-rarity-container sortedContainer\" style=\"display:none;\">", matches_arr[idx].span()[1])
        end = matches_arr[idx + 1].span()[0] if idx < len(matches_arr) - 1 else len(page)
        total_expected_cards = int(re.search(TotalRegex, page[start:end]).group(1))
        cards_matches = re.findall(CardsRegex, page[start:end])
        jhh_cards = []
        colors = set()
        cycling_land = False
        rarest_card = None
        for c in cards_matches:
            cardname = fix_cardname(c[1])
            if (cardname == "Cycling Land"):
                jhh_cards.append(CyclingLands[next(iter(colors))])
                continue
            cid = getIDFromNameForJHH(cardname)
            if cid == None:  # FIXME: Temp workaround, remove it when all cards are here.
                cid = getIDFromNameForJHH("\"{}\"".format(cardname))
            if cid != None:
                for color in filter(lambda a: a in "WUBRG", cards[cid]["mana_cost"]):
                    colors.add(color)
                if (rarest_card == None or Rarity[cards[cid]["rarity"]] < Rarity[cards[rarest_card]["rarity"]]):
                    rarest_card = cid
                for i in range(int(c[0])):  # Add the card c[0] times
                    jhh_cards.append(cid)
            else:
                print("Jumpstart: Historic Horizons Boosters: Card '{}' ('{}') not found.".format(cardname, c[1]))
        altcards = []
        altline_matches = re.findall(AlternateLinesRegex, page[start:end])
        for l in altline_matches:
            alt_matches = re.findall(AlternateCardsRegex, l)
            if len(alt_matches) > 0:
                altslot = []
                for altidx, alt in enumerate(alt_matches):
                    cardname = fix_cardname(alt[0])
                    cid = None
                    if cardname == "Cycling Land":
                        cid = CyclingLands[next(iter(colors))]
                    else:
                        cid = getIDFromNameForJHH(cardname)
                    if cid == None:
                        print("Jumpstart: Historic Horizons Boosters: Card '{}' ('{}') not found.".format(cardname, alt[0]))
                    else:
                        altslot.append({"name": cards[cid]["name"], "id": cid, "weight": int(alt[1])})
                        if altidx == 0 and cid in jhh_cards:
                            jhh_cards.remove(cid)
                if len(altslot) > 0:
                    altcards.append(altslot)
                else:
                    print("Jumpstart: Historic Horizons Boosters: Empty Alt Slot.")
                    print(alt_matches)
        found_cards = len(jhh_cards) + len(altcards)
        if found_cards != total_expected_cards:
            print("\tUnexpected number of cards for {} ({}/{})!".format(matches_arr[idx].group(1), found_cards, total_expected_cards))
        else:
            print("Added Pack '{}', {} + {} = {}/{} cards.".format(matches_arr[idx].group(1), len(jhh_cards), len(altcards), found_cards, total_expected_cards))
            jumpstartHHBoosters.append({"name": matches_arr[idx].group(1), "colors": list(colors), "cycling_land": cycling_land,
                                        "image": cards[rarest_card]["image_uris"]["en"] if rarest_card != None else None, "cards": jhh_cards, "alts": altcards})
    print("Jumpstart Boosters: {}/46".format(len(jumpstartHHBoosters)))
    with open(JumpstartHHBoostersDist, 'w', encoding="utf8") as outfile:
        json.dump(jumpstartHHBoosters, outfile, indent=4, ensure_ascii=False,)
    print("Jumpstart: Historic Horizons boosters dumped to disk.")