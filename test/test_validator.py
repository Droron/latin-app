#!/usr/bin/env python3
"""Validator regression test: published lessons pass; each kind of bad lesson is rejected. Run: python3 test/test_validator.py"""
import copy, glob, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import curriculum_lib as C  # noqa: E402

course = C.Course()
ok = True


def check(name, cond, info=""):
    global ok
    ok &= bool(cond)
    print(("PASS " if cond else "FAIL ") + name + (f"  – {info}" if info else ""))


for p in sorted(glob.glob(os.path.join(ROOT, "lessons", "L*.json"))):
    E, W, rep = C.validate(course, C.load_json(p))
    check(f"{os.path.basename(p)} passes", not E, "; ".join(E[:3]) or f"review {rep['reviewShare']:.0%}, {len(rep['lemmasUsed'])} lemmas")

L2 = C.load_json(os.path.join(ROOT, "lessons", "L002.json"))


def bad(name, mutate, expect):
    l = copy.deepcopy(L2); mutate(l)
    E, _, _ = C.validate(course, l)
    hit = [e for e in E if expect in e]
    check(f"rejects {name}", hit, hit[0] if hit else f"errors were: {E[:3]}")


bad("an untaught lemma (puer, lesson 7)", lambda l: l["examples"].append({"la": "Puer est bonus.", "en": "The boy is good."}), "not taught yet, planned for lesson 7")
bad("a word outside the DCC list", lambda l: l["examples"].append({"la": "Puella ambulat.", "en": "The girl walks."}), "not a form of any lemma")
bad("untaught grammar (accusative puellam before lesson 4)", lambda l: l["examples"].append({"la": "Puellam terra est.", "en": "x"}), "needs rule 'accusative-singular' (lesson 4)")
L3 = C.load_json(os.path.join(ROOT, "lessons", "L003.json"))
l3 = copy.deepcopy(L3); l3["examples"].append({"la": "Fēminae labōrant.", "en": "The women work."})
E3, _, _ = C.validate(course, l3)
hit = [e for e in E3 if "needs rule 'verb-3pl' (lesson 5)" in e]
check("rejects untaught grammar (labōrant, 3rd plural, before lesson 5)", hit, hit[0] if hit else str(E3[:3]))
bad("a re-introduced lemma (puella as new in lesson 2)", lambda l: l["vocab"].append({"id": "puella", "la": "puella", "en": "girl"}), "already taught in lesson 1")
bad("an unplanned new lemma", lambda l: l["vocab"].append({"id": "silva", "la": "silva", "en": "forest"}), "not one of lesson 2's planned new lemmas")
bad("a rule from a later lesson", lambda l: l["exercises"][0].update(rules=["verb-3sg"]), "is not taught until lesson 3")
bad("too little review (0%)", lambda l: [x.pop("review", None) for x in l["exercises"] + l["drills"]], "review share is 0%")
bad("too much review (100%)", lambda l: [x.update(review=True) for x in l["exercises"] + l["drills"]], "must be 30–50%")
bad("an unglossed name (Mārcus)", lambda l: l["examples"].append({"la": "Mārcus est bonus.", "en": "x"}), "gloss it")
bad("a missing reading passage", lambda l: l.pop("reading"), "reading")
def drop_parvus(l):
    has = lambda t: "parv" in (t or "")
    l["examples"] = [e for e in l["examples"] if not has(e["la"])]
    l["vocab"] = [dict(v, example={"la": "Via longa est.", "en": "The road is long."}) if has(v.get("example", {}).get("la")) else v for v in l["vocab"]]
    l["exercises"] = [x for x in l["exercises"] if not has(json.dumps(x, ensure_ascii=False))]
    l["drills"] = [d for d in l["drills"] if not has(json.dumps(d, ensure_ascii=False))]
    l["reading"] = {"la": "Via longa est.", "en": "The road is long."}


bad("a planned lemma never used", drop_parvus, "new lemma 'parvus' is never used")
sys.exit(0 if ok else 1)
