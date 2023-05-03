import requests
import json

draft_effects = {}

r = requests.get('https://api.scryfall.com/cards/search?q=o:"Draft ~ face up"')
d = json.loads(r.content)
print("export const FaceUpCards: OracleID[] = [")
for c in d["data"]:
    if c['oracle_id'] not in draft_effects:
        draft_effects[c['oracle_id']] = []
    draft_effects[c['oracle_id']].append("FaceUp")
    print(f"\t\"{c['oracle_id']}\", // {c['name']}")
print("];")

r = requests.get('https://api.scryfall.com/cards/search?q=o:"Reveal ~ as you draft it"')
d = json.loads(r.content)
print("export const RevealedCards: OracleID[] = [")
for c in d["data"]:
    if c['oracle_id'] not in draft_effects:
        draft_effects[c['oracle_id']] = []
    draft_effects[c['oracle_id']].append("Reveal")
    print(f"\t\"{c['oracle_id']}\", // {c['name']}")
print("];")

r = requests.get('https://api.scryfall.com/cards/search?q=o:"Reveal ~ as you draft it and note how many cards you’ve drafted this draft round, including ~."')
d = json.loads(r.content)
print("export const NoteDraftedCards: OracleID[] = [")
for c in d["data"]:
    if c['oracle_id'] not in draft_effects:
        draft_effects[c['oracle_id']] = []
    draft_effects[c['oracle_id']].append("NoteDraftedCards")
    print(f"\t\"{c['oracle_id']}\", // {c['name']}")
print("];")

r = requests.get('https://api.scryfall.com/cards/search?q=o:"As you draft a card, you may remove it from the draft"')
d = json.loads(r.content)
for c in d["data"]:
    if c['oracle_id'] not in draft_effects:
        draft_effects[c['oracle_id']] = []
    draft_effects[c['oracle_id']].append("RemoveDraftCard")

r = requests.get('https://api.scryfall.com/cards/search?q=o:"As you draft a card, you may reveal it, note its name, then turn ~ face down."')
d = json.loads(r.content)
for c in d["data"]:
    if c['oracle_id'] not in draft_effects:
        draft_effects[c['oracle_id']] = []
    draft_effects[c['oracle_id']].append("NoteCardName")
    
r = requests.get('https://api.scryfall.com/cards/search?q=o:"As you draft a creature card, you may reveal it, note its creature types, then turn ~ face down."')
d = json.loads(r.content)
for c in d["data"]:
    if c['oracle_id'] not in draft_effects:
        draft_effects[c['oracle_id']] = []
    draft_effects[c['oracle_id']].append("NoteCreatureTypes")

r = requests.get('https://api.scryfall.com/cards/search?q=o:"As you draft a creature card, you may reveal it, note its name, then turn ~ face down."')
d = json.loads(r.content)
for c in d["data"]:
    if c['oracle_id'] not in draft_effects:
        draft_effects[c['oracle_id']] = []
    draft_effects[c['oracle_id']].append("NoteCreatureName")

# Unique effects
draft_effects["ec0d964e-ca2c-4252-8551-cf1916576653"].append("CogworkLibrarian")
draft_effects["19047c4b-0106-455d-ab71-68cabfae7404"].append("AgentOfAcquisitions")
draft_effects["80ea63fd-691a-45ba-a4bf-862e5ec2922d"].append("AetherSearcher")
draft_effects["adfd33cb-086c-48f4-b443-ba971ff43684"].append("CogworkSpy")
draft_effects["c60ba5e9-dbfa-441b-a96f-9cc7fdfd2d76"].append("CogworkTracker")
draft_effects["19a3c505-b180-47cc-bef3-9e807a8a4a3d"].append("LoreSeeker")
draft_effects["6ca0078f-d6b5-4643-b801-e7a98706f21c"].append("ArchdemonOfPaliano")
draft_effects["bb6bda0d-ddb8-47fa-be07-bbcd73a52830"].append("CanalDredger")
draft_effects["8fedb2c2-fb13-4af1-b85e-714832562da7"].append("LeovoldsOperative")
draft_effects["f10898a5-87ec-4a30-a383-9f9bcba3e4d0"].append("CogworkGrinder")
draft_effects["70ff487d-96b3-4322-9975-59bf3c6b517f"].append("AnimusOfPredation")

print(draft_effects)