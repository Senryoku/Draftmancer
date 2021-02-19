import json

# List all characters present in selected properties of the card db
with open("../../data/MTGCards.json", 'r', encoding="utf8") as file:
    cards = json.load(file)
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
