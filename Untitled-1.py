
import requests
import json

s = json.loads(requests.get(f"https://api.scryfall.com/sets/mom").content)
print(s)
