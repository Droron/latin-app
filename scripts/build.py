#!/usr/bin/env python3
"""Validate lessons and build everything.

Usage: python3 scripts/build.py
Outputs (all generated – never edit by hand):
  lessons/index.json   manifest of all lessons
  app/lessons.js       window.LATIN_LESSONS for the multi-file app (app/index.html)
  app/icons/*.png      PNG icons (scripts/make_icons.py)
  dist/latin.html      single self-contained file (everything inlined)
  site/                the deployable static site for GitHub Pages
Standard library only, so it runs unchanged in the GitHub Actions workflow.
"""
import datetime, glob, hashlib, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS = os.path.join(ROOT, "lessons")
APP = os.path.join(ROOT, "app")
DIST = os.path.join(ROOT, "dist")
SITE = os.path.join(ROOT, "site")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

APP_FILES = ["index.html", "styles.css", "app.js", "manifest.webmanifest", "icon.svg"]
import curriculum_lib as C  # noqa: E402
import latin_morph as M  # noqa: E402


class LessonError(Exception):
    pass


def load_all():
    """lessons/L001.json … in curriculum order; every lesson must pass the curriculum validator."""
    course = C.Course()
    files = sorted(glob.glob(os.path.join(LESSONS, "L[0-9][0-9][0-9].json")))
    stray = [f for f in glob.glob(os.path.join(LESSONS, "*.json")) if f not in files and not f.endswith("index.json")]
    if stray:
        raise LessonError(f"unexpected files in lessons/: {stray} (old email lessons live in archive/)")
    lessons, reports, errs = [], {}, []
    for f in files:
        with open(f, encoding="utf-8") as fh:
            try:
                data = json.load(fh)
            except json.JSONDecodeError as e:
                raise LessonError(f"{f}: invalid JSON: {e}")
        if os.path.basename(f) != f"{data.get('id')}.json":
            errs.append(f"{f}: file name must be {data.get('id')}.json")
        E, W, rep = C.validate(course, data)
        errs += [f"{os.path.basename(f)}: {e}" for e in E]
        for w in W:
            print(f"warning: {os.path.basename(f)}: {w}")
        lessons.append(data); reports[data.get("number")] = rep
    if errs:
        raise LessonError("lesson validation failed:\n  " + "\n  ".join(errs))
    lessons.sort(key=lambda l: l["number"])
    nums = [l["number"] for l in lessons]
    if nums != list(range(1, len(lessons) + 1)):
        raise LessonError(f"lesson numbers must be 1..{len(lessons)} with no gaps, got {nums}")
    for l in lessons:
        if not l.get("written"):   # a lesson without a date broke the Today screen (Lesson 7, Oct 2026): fall back to the file date
            f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lessons", f"{l['id']}.json")
            ts = os.path.getmtime(f) if os.path.exists(f) else None
            l["written"] = (datetime.date.fromtimestamp(ts) if ts else datetime.date.today()).isoformat()
            print(f"warning: {l['id']}: no 'written' date – using {l['written']}")
        if not l.get("date"):
            l["date"] = l["written"]
    return lessons, course, reports


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def ensure_icons():
    import make_icons
    out = os.path.join(APP, "icons")
    src = os.path.join(ROOT, "scripts", "make_icons.py")
    need = [os.path.join(out, n) for n in ("apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "favicon-32.png")]
    if not all(os.path.exists(p) and os.path.getmtime(p) >= os.path.getmtime(src) for p in need):
        make_icons.main(out)
    return [os.path.relpath(p, APP) for p in need]


# ---------------------------------------------------------------- lexicon & grammar (derived – never edit by hand)
DATA = os.path.join(ROOT, "data")


def dump_json(path, data):
    write(path, json.dumps(data, ensure_ascii=False, indent=1) + "\n")


SIMPLE_POS = [("Noun", "noun"), ("Verb", "verb"), ("Adjective", "adjective"), ("Adverb", "adverb"), ("Conjunction", "conjunction"),
              ("Preposition", "preposition"), ("Pronoun", "pronoun"), ("Interjection", "interjection")]


def lemma_record(course, lid, first):
    e = course.lex[lid]
    pos = "proper noun" if e.get("isName") else next((v for k, v in SIMPLE_POS if e["pos"].startswith(k)), e["pos"].lower())
    if pos == "pronoun" and re.search(r"-a -um|nostra|vestra", e["entry"]):
        pos = "adjective"
    rec = {"id": lid, "lemma": e["lemma"], "entry": e["entry"], "pos": pos, "dccPos": e["pos"], "en": e["definition"],
           "rank": e.get("rank"), "group": e.get("group"), "firstLesson": first}
    m = re.match(r"Noun: (\d)", e["pos"])
    if m:
        rec["declension"] = int(m.group(1))
        g = re.search(r"\b([mfn])\.", e["entry"])
        if g:
            rec["gender"] = g.group(1)
    m = re.match(r"Verb: (\d)\w\w Conjugation( -iō)?", e["pos"])
    if m:
        rec["conjugation"] = int(m.group(1)) if not m.group(2) else "3rd (-iō) conj."
    if e["pos"].startswith("Adjective: 1st and 2nd"):
        rec["declension"] = "1st/2nd"
    if e["pos"].startswith("Adjective: 3rd"):
        rec["declension"] = 3
    rec["note"] = (f"Dictionary entry: **{e['entry']}** – {e['definition']} · DCC frequency rank #{e['rank']} · {e['group']}" if e.get("rank")
                   else f"Proper name: **{e['entry']}** (glossed in the lesson; not part of the DCC core list)")
    return rec


def derive_lexicon(lessons, course, reports):
    """Lemmas in teaching order (lesson, then vocab position; names after), with every form seen and its parse."""
    order, first = [], {}
    for l in lessons:
        for v in l["vocab"]:
            if v["id"] not in first:
                first[v["id"]] = l["number"]; order.append(v["id"])
        for x in l.get("names", []):
            k = "name:" + x["id"]
            if k not in first:
                first[k] = l["number"]; order.append(k)
    seen = {}
    for l in lessons:
        for (lid, key), (tok, tags) in reports[l["number"]]["_forms"].items():
            d = seen.setdefault(lid, {}).setdefault(key, {"form": tok, "tags": set(), "lessons": set()})
            d["tags"] |= tags; d["lessons"].add(l["number"])
            if tok[:1].islower():
                d["form"] = tok
    lemmas, warnings = [], []
    gloss = {}
    for l in lessons:
        for v in l["vocab"]:
            gloss.setdefault(v["id"], v["en"])
        for x in l.get("names", []):
            gloss.setdefault("name:" + x["id"], x["en"])
    for lid in order:
        rec = lemma_record(course, lid, first[lid])
        rec["dccDefinition"], rec["en"] = rec["en"], gloss.get(lid, rec["en"])   # the lesson's short gloss; DCC definition kept
        fs = sorted(seen.get(lid, {}).values(), key=lambda d: (min(d["lessons"]), M.strip(d["form"])))
        parse = lambda d: " or ".join(dict.fromkeys(M.describe(t) for t in sorted(d["tags"])))
        rec["forms"] = {d["form"]: parse(d) for d in fs}
        amb = [d["form"] for d in fs if len({M.describe(t) for t in d["tags"]}) > 1]
        rec["inferred"] = [f"parse of {', '.join(amb)} is ambiguous out of context"] if amb else []
        rec["derived"] = {"firstLesson": first[lid], "lessons": sorted({n for d in fs for n in d["lessons"]}),
                          "formsSeen": [{"form": d["form"], "parse": parse(d), "lessons": sorted(d["lessons"])} for d in fs]}
        if not fs:
            warnings.append(f"lemma '{lid}' is taught but never used in a sentence")
        lemmas.append(rec)
    core_l = [e for e in lemmas if e.get("rank")]      # counts are DCC lemmas only; glossed names are listed but not counted
    by_pos = {}
    for e in core_l:
        by_pos[e["pos"]] = by_pos.get(e["pos"], 0) + 1
    growth = [{"lesson": l["number"], "lemmas": sum(1 for e in core_l if e["firstLesson"] <= l["number"]),
               "forms": sum(1 for e in core_l for f in e["derived"]["formsSeen"] if f["lessons"][0] <= l["number"]),
               "newLemmas": [e["id"] for e in core_l if e["firstLesson"] == l["number"]]} for l in lessons]
    lex = {"generated": "by scripts/build.py from lessons/ + data/core_lemmas.json – do not edit",
           "source": course.core["source"],
           "lemmas": lemmas,
           "stats": {"lemmaCount": len(core_l), "nameCount": len(lemmas) - len(core_l), "coreTotal": len(course.core["lemmas"]),
                     "formCount": sum(len(e["derived"]["formsSeen"]) for e in core_l),
                     "byPos": dict(sorted(by_pos.items(), key=lambda kv: -kv[1])), "growth": growth, "unlemmatized": {}}}
    dump_json(os.path.join(DATA, "lexicon.json"), lex)
    return lex, warnings


def derive_grammar(lessons, course):
    have = {l["number"] for l in lessons}
    rules, warnings = [], []
    for r in course.cur["rules"]:
        rid = r["id"]
        rec = {"id": rid, "number": r["number"], "title": r["title"], "explanation": r["summary"], "unlocks": r["unlocks"],
               "plannedLesson": r["lesson"], "introducedIn": r["lesson"] if r["lesson"] in have else None,
               "examples": [], "lessonCards": [], "exercises": [], "quiz": []}
        refs = set()
        for l in lessons:
            n = l["number"]
            for g in l.get("grammar", []):
                if rid in g.get("rules", []):
                    rec["lessonCards"].append({"lesson": n, "title": g["title"]}); refs.add(n)
                    if n == r["lesson"]:
                        rec["explanation"] = g["body"]
                        if g.get("table"):
                            rec["table"] = g["table"]
            for e in l.get("examples", []):
                if rid in e.get("rules", []) and len(rec["examples"]) < 6:
                    rec["examples"].append({"la": e["la"], "en": e["en"], "lessons": [n]})
            for kind, items in (("drill", l.get("drills", [])), ("exercise", l.get("exercises", []))):
                for i, x in enumerate(items):
                    if rid in x.get("rules", []):
                        rec["exercises"].append({"lesson": n, "kind": kind, "index": i, "prompt": x.get("prompt") or x.get("sentence")}); refs.add(n)
        intro = rec["introducedIn"]
        rec["reinforcedIn"] = sorted(n for n in refs if intro and n > intro)
        rec["practisedEarlierIn"] = []
        rules.append(rec)
    taught = [r for r in rules if r["introducedIn"]]
    gr = {"generated": "by scripts/build.py from data/curriculum.json + lessons/ – do not edit", "rules": rules,
          "stats": {"ruleCount": len(taught), "plannedCount": len(rules),
                    "growth": [{"lesson": l["number"], "rules": sum(1 for r in taught if r["introducedIn"] <= l["number"])} for l in lessons]}}
    dump_json(os.path.join(DATA, "grammar.json"), gr)
    return gr, warnings


def build():
    lessons, course, reports = load_all()
    index = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "count": len(lessons),
        "lessons": [
            {"number": l["number"], "id": l["id"], "date": l["date"], "title": l["title"], "file": f"{l['id']}.json",
             "vocabCount": len(l["vocab"]), "exerciseCount": len(l.get("exercises", [])), "drillCount": len(l.get("drills", [])),
             "rule": l.get("rule"), "reviewShare": reports[l["number"]]["reviewShare"]}
            for l in lessons
        ],
    }
    write(os.path.join(LESSONS, "index.json"), json.dumps(index, ensure_ascii=False, indent=2) + "\n")

    lex, w1 = derive_lexicon(lessons, course, reports)
    gr, w2 = derive_grammar(lessons, course)
    meta = {"curriculum": course.cur["id"], "curriculumTitle": course.cur["title"], "plannedLessons": len(course.cur["lessons"]),
            "nextLesson": course.plan.get(len(lessons) + 1, {}).get("title"), "source": course.core["source"]}
    for w in w1 + w2:
        print("warning:", w)
    enc = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    js = ("/* generated by scripts/build.py – do not edit */\nwindow.LATIN_LESSONS=" + enc(lessons) + ";\n"
          "window.LATIN_LEXICON=" + enc(lex) + ";\nwindow.LATIN_GRAMMAR=" + enc(gr) + ";\nwindow.LATIN_META=" + enc(meta) + ";\n")
    write(os.path.join(APP, "lessons.js"), js)
    icons = ensure_icons()

    # ---- single-file build
    html = read(os.path.join(APP, "index.html"))
    css = read(os.path.join(APP, "styles.css"))
    appjs = read(os.path.join(APP, "app.js")).replace("</script", "<\\/script")
    one = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
    one = one.replace('<script src="lessons.js"></script>', f"<script>\n{js}</script>")
    one = one.replace('<script src="app.js"></script>', f"<script>\n{appjs}\n</script>")
    one = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', "", one)
    one = re.sub(r'\s*<link rel="icon" type="image/png"[^>]*>', "", one)
    one = one.replace("<!--SINGLEFILE-->", "<script>window.LATIN_SINGLE_FILE=true;</script>")
    for marker in ('href="styles.css"', 'src="lessons.js"', 'src="app.js"', 'icons/'):
        if marker in one:
            raise LessonError(f"single-file build failed to inline {marker}")
    write(os.path.join(DIST, "latin.html"), one)

    # ---- deployable site (GitHub Pages)
    if os.path.isdir(SITE):
        shutil.rmtree(SITE)
    os.makedirs(SITE)
    files = APP_FILES + ["lessons.js"] + icons
    for f in files:
        os.makedirs(os.path.dirname(os.path.join(SITE, f)), exist_ok=True)
        shutil.copyfile(os.path.join(APP, f), os.path.join(SITE, f))
    shutil.copyfile(os.path.join(DIST, "latin.html"), os.path.join(SITE, "latin.html"))
    os.makedirs(os.path.join(SITE, "lessons"))
    for l in lessons:
        shutil.copyfile(os.path.join(LESSONS, f"{l['id']}.json"), os.path.join(SITE, "lessons", f"{l['id']}.json"))
    shutil.copyfile(os.path.join(LESSONS, "index.json"), os.path.join(SITE, "lessons", "index.json"))
    os.makedirs(os.path.join(SITE, "data"))
    for f in ("lexicon.json", "grammar.json", "curriculum.json", "core_lemmas.json"):
        shutil.copyfile(os.path.join(DATA, f), os.path.join(SITE, "data", f))
    write(os.path.join(SITE, ".nojekyll"), "")
    # version = hash of everything the app serves (index.json excluded: its timestamp changes every build)
    h = hashlib.sha256()
    for f in sorted(files + ["latin.html"]):
        with open(os.path.join(SITE, f), "rb") as fh:
            h.update(f.encode() + b"\0" + fh.read())
    version = h.hexdigest()[:10]
    precache = ["./", "./index.html"] + [f"./{f}" for f in files if f != "index.html"]
    sw = read(os.path.join(APP, "sw.js")).replace("__VERSION__", version).replace("__PRECACHE__", json.dumps(precache))
    write(os.path.join(SITE, "sw.js"), sw)
    write(os.path.join(SITE, "version.json"), json.dumps({"version": version, "lessons": len(lessons)}) + "\n")

    print(f"Built {len(lessons)} lessons, {lex['stats']['lemmaCount']} lemmas / {lex['stats']['formCount']} forms, {gr['stats']['ruleCount']} rules, version {version} -> lessons/index.json, app/lessons.js, "
          f"dist/latin.html ({len(one)//1024} KB), site/")
    return version


if __name__ == "__main__":
    try:
        build()
    except LessonError as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
