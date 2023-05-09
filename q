[1mdiff --git a/ManageCardData.py b/ManageCardData.py[m
[1mindex 8fdf157c..f0a110ce 100644[m
[1m--- a/ManageCardData.py[m
[1m+++ b/ManageCardData.py[m
[36m@@ -191,7 +191,7 @@[m [mPrimarySets = [s['code'] for s in SetsInfos if s['set_type'][m
                in ['core', 'expansion', 'masters', 'draft_innovation']][m
 PrimarySets.extend(['unf', 'ugl', 'unh', 'ust', 'und'])  # Add Un-Sets as primary.[m
 PrimarySets.extend(['hbg', 'planeshifted_snc', 'ydmu'])[m
[31m-[m
[32m+[m[32mPrimarySets.append("mat") # Support mat as a draftable set (mom + mat cards)[m
 [m
 def append_set_cards(allcards, results):[m
     print(f"Processing {len(results['data'])} cards...")[m
[36m@@ -833,7 +833,6 @@[m [mfor mtgset, group in groups:[m
     setinfos[mtgset] = {"code": mtgset,[m
                         "fullName": setdata['name'],[m
                         "cardCount": len(cardList),[m
[31m-[m
                         "isPrimary": mtgset in PrimarySets[m
                         }[m
     if 'block' in setdata:[m
[36m@@ -870,7 +869,6 @@[m [msetinfos["mb1_convention_2021"].update({"code": "mb1_convention_2021",[m
                                      "isPrimary": True,[m
                                      })[m
 PrimarySets.append("mb1_convention_2021")[m
[31m-PrimarySets.append("mat") # Support mat as a draftable set (mom + mat cards)[m
 [m
 # Create fake primary sets for each version of the Shadows over Innistrad Remastered bonus sheet, so users can choose rather than rely on the auto rotation.[m
 with open("src/data/shadow_of_the_past.json", "r") as bonusSheetsFile:[m
[36m@@ -895,6 +893,6 @@[m [mconstants = {}[m
 with open("src/data/constants.json", 'r', encoding="utf8") as constantsFile:[m
     constants = json.loads(constantsFile.read())[m
 constants['PrimarySets'] = [[m
[31m-    s for s in PrimarySets if s in setinfos and s not in subsets and s not in ["ren", "rin", "a22", "y22", "j22", "mat", "cmm", "sis", "ltr", "ltc", "who"]]  # Exclude some codes that are actually part of larger sets (tsb, fmb1, h1r... see subsets), or aren't out yet[m
[32m+[m[32m    s for s in PrimarySets if s in setinfos and s not in subsets and s not in ["ren", "rin", "a22", "y22", "j22", "cmm", "sis", "ltr", "ltc", "who"]]  # Exclude some codes that are actually part of larger sets (tsb, fmb1, h1r... see subsets), or aren't out yet[m
 with open("src/data/constants.json", 'w', encoding="utf8") as constantsFile:[m
     json.dump(constants, constantsFile, ensure_ascii=False, indent=4)[m
