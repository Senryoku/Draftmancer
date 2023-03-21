import json
import glob

# List all characters present in selected properties of the card dbDBFiles = glob.glob("data/MTGCards.*.json")
cards = {}
DBFiles = glob.glob("../../data/MTGCards.*.json")
for f in DBFiles:
    with open(f, 'r', encoding="utf8") as file:
        cards.update(json.loads(file.read()))
NameChars = {'a', 'b', 'c'}
SetChars = {'a', 'b', 'c'}
CollectorNumberChars = {'1', '2', '3'}
for cid in cards:
    c = cards[cid]
    NameChars.update(list(c['name']))
    SetChars.update(list(c['set']))
    CollectorNumberChars.update(list(c['collector_number']))
print("NameChars ({})".format(len(NameChars)), sorted(NameChars))
print("SetChars ({})".format(len(SetChars)), sorted(SetChars))
print("CollectorNumberChars ({})".format(len(CollectorNumberChars)), sorted(CollectorNumberChars))
