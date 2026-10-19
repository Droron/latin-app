#!/usr/bin/env python3
"""Fetch the Dickinson College Commentaries Latin Core Vocabulary and write data/core_lemmas.json.

Source: https://dcc.dickinson.edu/latin-core-list1  (Christopher Francese et al., Dickinson College, 2012–13)
Licence: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) – credit is shown in the app's About box.
Usage: python3 scripts/import_dcc.py [saved.html]     (stdlib only; run rarely – the JSON is committed)
"""
import datetime, html, json, os, re, sys, unicodedata, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://dcc.dickinson.edu/latin-core-list1"
OUT = os.path.join(ROOT, "data", "core_lemmas.json")
# ids are ASCII, macron-free; these entries need a hand-picked id
ID_OVERRIDES = {"que": "-que", "ne (enclitic)": "-ne", "ve": "-ve", "ā ab abs": "ab", "hīc": "hic-adv", "fīlia -ae f.; fīlius -ī m.": "filia",
                "cum": "cum", "nē": "ne", "quī quae quod": "qui", "quis quid": "quis", "līber lībera līberum": "liber-adj",
                "liber librī m.": "liber", "sui sibi sē/sēsē": "sui", "ūnus -a -um": "unus", "ut, utī": "ut", "quā": "qua-adv",
                "quō": "quo-adv", "tum or tunc": "tum"}


def strip(t):
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if not unicodedata.combining(c)).lower().replace("j", "i")


def main():
    if len(sys.argv) > 1:
        page = open(sys.argv[1], encoding="utf-8").read()
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (lingua-latina importer)"})
        page = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    rows = re.findall(r"<tr>(.*?)</tr>", page, re.S)
    out, used = [], set()
    for r in rows:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
        if len(tds) != 5:
            continue
        slug = re.search(r'href="/latin-core/([^"]+)"', tds[0])
        f = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t))).strip() for t in tds]
        entry, defn, pos, group, rank = f
        out.append({"entry": entry, "definition": defn, "pos": pos, "group": group, "rank": int(rank), "dccSlug": slug.group(1) if slug else None})
    out.sort(key=lambda e: (e["rank"], e["entry"]))
    for e in out:   # assign ids in frequency order so the commoner word gets the bare id
        if e["entry"] in ID_OVERRIDES:
            i = ID_OVERRIDES[e["entry"]]
        else:
            toks = [t for t in re.split(r"[\s,/:;]+", e["entry"]) if t]
            first = toks[1] if len(toks) > 1 and len(strip(toks[0])) == 1 and strip(toks[0]) in "ae" else toks[0]
            i = strip(first)
        base, k = i, 2
        while i in used:
            i = f"{base}-{k}"; k += 1
        used.add(i)
        e["id"] = i
        toks = [t for t in re.split(r"[\s,/]+", e["entry"]) if t]
        e["lemma"] = toks[1] if e["id"] == "ab" else ("-" + e["entry"].split()[0] if e["id"] in ("-que", "-ne", "-ve") else toks[0].rstrip(":"))
    data = {
        "source": {"title": "Dickinson College Commentaries Latin Core Vocabulary", "url": URL,
                   "authors": "Christopher Francese and collaborators, Dickinson College (2012–13)",
                   "licence": "CC BY-SA 3.0 Unported", "licenceUrl": "https://creativecommons.org/licenses/by-sa/3.0/",
                   "retrieved": datetime.date.today().isoformat(), "count": len(out),
                   "note": "rank = frequency rank in the DCC core list (1 = most frequent). Fields: id (ours), lemma, entry (DCC headword = dictionary entry), pos, definition, rank, group (DCC semantic group)."},
        "lemmas": [{k: e[k] for k in ("id", "lemma", "entry", "pos", "definition", "rank", "group", "dccSlug")} for e in out],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"wrote {OUT}: {len(out)} lemmas")


if __name__ == "__main__":
    main()
