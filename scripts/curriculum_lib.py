"""Curriculum, lexicon and lesson validation shared by validate_lesson, generate_lesson, add_lesson and build.py.

Every Latin token in a lesson is lemmatized against the DCC core list (data/core_lemmas.json) plus
data/names.json, using the paradigms in latin_morph.py. A lesson N passes only if every token is a form of a
lemma taught in lessons 1..N, in a form unlocked by a grammar rule taught in lessons 1..N (data/curriculum.json).
"""
import fnmatch, json, os, re
import latin_morph as M

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
LESSONS_DIR = os.path.join(ROOT, "lessons")
ID_FMT = "L{:03d}"
REVIEW_MIN, REVIEW_MAX = 0.30, 0.50


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


class Course:
    def __init__(self):
        self.core = load_json(os.path.join(DATA, "core_lemmas.json"))
        self.cur = load_json(os.path.join(DATA, "curriculum.json"))
        self.names = load_json(os.path.join(DATA, "names.json"))["names"]
        self.lex = {e["id"]: e for e in self.core["lemmas"]}
        for n in self.names:
            self.lex["name:" + n["id"]] = dict(n, id="name:" + n["id"], isName=True, definition=n["en"], rank=None, group="Proper names")
        self.rules = {r["id"]: r for r in self.cur["rules"]}
        self.plan = {l["number"]: l for l in self.cur["lessons"]}
        self.first = {}
        for l in self.cur["lessons"]:
            for x in l["newLemmas"]:
                self.first[x] = l["number"]
        self.index, self.unsupported = {}, {}
        for lid, e in self.lex.items():
            try:
                forms = M.paradigm(e)
            except M.Unsupported as ex:
                self.unsupported[lid] = str(ex)
                continue
            for f, tag in forms:
                k = M.strip(f)
                lst = self.index.setdefault(k, [])
                if not any(a["lemma"] == lid and a["tag"] == tag for a in lst):
                    lst.append({"lemma": lid, "tag": tag, "form": f})

    # ---- what is allowed by lesson n
    def taught(self, n):
        return {x for l in self.cur["lessons"] if l["number"] <= n for x in l["newLemmas"]}

    def rules_by(self, n):
        return [r for r in self.cur["rules"] if r["lesson"] <= n]

    def unlocked(self, n):
        return [p for r in self.rules_by(n) for p in r["unlocks"]]

    def rule_for_tag(self, tag):
        for r in self.cur["rules"]:
            if any(fnmatch.fnmatchcase(tag, p) for p in r["unlocks"]):
                return r
        return None

    @staticmethod
    def tag_ok(tag, patterns):
        return tag in ("INV", "CLITIC") or any(fnmatch.fnmatchcase(tag, p) for p in patterns)

    def lemma_label(self, lid):
        e = self.lex.get(lid, {})
        return e.get("lemma", lid)

    def analyse(self, tok, n, names_ok):
        """-> (status, analyses, message). status: ok | lemma | grammar | name | unknown"""
        k = M.strip(tok)
        cands = list(self.index.get(k, []))
        clitic = None
        if not cands:
            for c in ("que", "ne", "ve"):
                if k.endswith(c) and len(k) > len(c) + 1 and self.index.get(k[:-len(c)]):
                    cands, clitic = list(self.index[k[:-len(c)]]), "-" + c
                    break
        if not cands:
            return "unknown", [], f"'{tok}' is not a form of any lemma in the DCC core list or data/names.json"
        taught, pats = self.taught(n), self.unlocked(n)
        if clitic and clitic not in taught:
            return "lemma", [], f"'{tok}' uses the enclitic {clitic}, which is taught in lesson {self.first.get(clitic, '?')}"
        good, wrong_grammar, untaught = [], [], []
        for a in cands:
            lid = a["lemma"]
            if lid.startswith("name:"):
                if tok[:1] != tok[:1].upper() or lid[5:] not in names_ok:
                    untaught.append(a); continue
            elif lid not in taught:
                untaught.append(a); continue
            (good if self.tag_ok(a["tag"], pats) else wrong_grammar).append(a)
        if good:
            return "ok", [dict(a, clitic=clitic) for a in good], ""
        if wrong_grammar:
            a = wrong_grammar[0]
            r = self.rule_for_tag(a["tag"])
            need = f"rule '{r['id']}' (lesson {r['lesson']})" if r else "a rule that is not in the curriculum yet"
            return "grammar", wrong_grammar, f"'{tok}' = {self.lemma_label(a['lemma'])}, {M.describe(a['tag'])} – that form needs {need}"
        a = untaught[0]
        if a["lemma"].startswith("name:"):
            return "name", untaught, f"'{tok}' is the name {self.lex[a['lemma']]['lemma']} – gloss it in this lesson's \"names\" (and capitalise it)"
        lid = a["lemma"]
        when = f"planned for lesson {self.first[lid]}" if lid in self.first else "not in the curriculum yet"
        return "lemma", untaught, f"'{tok}' = {self.lemma_label(lid)} ({self.lex[lid]['definition'][:40]}; DCC #{self.lex[lid]['rank']}) – not taught yet, {when}"


TOKEN_RE = re.compile(r"[A-Za-zÀ-ɏ]+")
ITALIC_RE = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")


def latin_segments(lesson):
    """(where, latin_text, item_key) for every piece of Latin in a lesson. item_key groups segments into practice items."""
    out = []
    # Latin inside English prose is written in *single asterisks*; an italic that starts with "-" is an ending (*-ae*), not a word
    italics = lambda s: [t for t in ITALIC_RE.findall(s or "") if not t.strip().startswith(("-", "–"))]
    for t in italics(lesson.get("intro")):
        out.append(("intro", t, None))
    for i, v in enumerate(lesson.get("vocab", [])):
        for t in italics(v.get("notes")):
            out.append((f"vocab[{i}].notes", t, None))
        if v.get("example"):
            out.append((f"vocab[{i}].example", v["example"]["la"], ("sent", f"v{i}")))
    for i, g in enumerate(lesson.get("grammar", [])):
        for t in italics(g.get("body")):
            out.append((f"grammar[{i}].body", t, None))
        for j, e in enumerate(g.get("examples", [])):
            out.append((f"grammar[{i}].examples[{j}]", e["la"], ("sent", f"g{i}.{j}")))
        tb = g.get("table")
        if tb:
            for r, row in enumerate(tb.get("rows", [])):
                for c in tb.get("laCols", [0]):
                    if c < len(row):
                        out.append((f"grammar[{i}].table[{r}][{c}]", row[c], None))
    for i, e in enumerate(lesson.get("examples", [])):
        out.append((f"examples[{i}]", e["la"], ("sent", f"e{i}")))
    for i, x in enumerate(lesson.get("exercises", [])):
        key = ("item", f"x{i}")
        for t in italics(x.get("prompt")):
            out.append((f"exercises[{i}].prompt", t, key))
        if x.get("la"):
            out.append((f"exercises[{i}].la", x["la"], key))
        if x.get("answerLang", "la") == "la":
            for j, a in enumerate([x.get("answer", "")] + x.get("accept", []) + x.get("choices", [])):
                out.append((f"exercises[{i}].answer/accept/choices[{j}]", a, key))
    for i, d in enumerate(lesson.get("drills", [])):
        key = ("item", f"d{i}")
        for c in d.get("choices", []):
            out.append((f"drills[{i}] with '{c}'", d["sentence"].replace("___", c), key))
    if lesson.get("reading"):
        out.append(("reading", lesson["reading"]["la"], ("sent", "reading")))
    for i, t in enumerate(lesson.get("notes", [])):
        for s in italics(t):
            out.append((f"notes[{i}]", s, None))
    return out


def lesson_path(n):
    return os.path.join(LESSONS_DIR, ID_FMT.format(n) + ".json")


def names_glossed_before(n):
    out = set()
    for k in range(1, n):
        p = lesson_path(k)
        if os.path.exists(p):
            out |= {x["id"] for x in load_json(p).get("names", [])}
    return out


def validate(course, lesson, strict_previous=True):
    """-> (errors, warnings, report)"""
    E, W = [], []
    n = lesson.get("number")
    if not isinstance(n, int) or n not in course.plan:
        return [f"number must be a lesson number planned in data/curriculum.json (got {n!r})"], [], {}
    plan = course.plan[n]
    if lesson.get("id") != ID_FMT.format(n):
        E.append(f"id must be {ID_FMT.format(n)}")
    if lesson.get("schemaVersion") != 2:
        E.append("schemaVersion must be 2")
    if lesson.get("curriculum") != course.cur["id"]:
        E.append(f"curriculum must be '{course.cur['id']}'")
    for k in ("title",):
        if not (lesson.get(k) or "").strip():
            E.append(f"{k} required")
    if strict_previous:
        for k in range(1, n):
            if not os.path.exists(lesson_path(k)):
                E.append(f"lesson {k} ({ID_FMT.format(k)}.json) must exist before lesson {n} – lessons are written in curriculum order")
    taught_before, taught_now = course.taught(n - 1), course.taught(n)
    # ---- vocabulary: exactly this lesson's planned new lemmas, never a re-introduction
    vids = [v.get("id") for v in lesson.get("vocab", [])]
    for i, v in enumerate(lesson.get("vocab", [])):
        if not (v.get("la") and v.get("en")):
            E.append(f"vocab[{i}] needs la and en")
        if v.get("id") in taught_before:
            E.append(f"vocab[{i}] '{v.get('id')}' was already taught in lesson {course.first[v['id']]} – it cannot be introduced as new again (review it in exercises instead)")
        elif v.get("id") not in plan["newLemmas"]:
            E.append(f"vocab[{i}] '{v.get('id')}' is not one of lesson {n}'s planned new lemmas {plan['newLemmas']} – change data/curriculum.json first")
    missing = [x for x in plan["newLemmas"] if x not in vids]
    if missing:
        E.append(f"planned new lemmas missing from vocab: {missing}")
    if len(set(vids)) != len(vids):
        E.append("duplicate vocab ids")
    # ---- names
    names_ok = names_glossed_before(n) | {x.get("id") for x in lesson.get("names", [])}
    wl = {x["id"] for x in course.names}
    for x in lesson.get("names", []):
        if x.get("id") not in wl:
            E.append(f"name '{x.get('id')}' is not in the data/names.json whitelist")
        if not x.get("en"):
            E.append(f"name '{x.get('id')}' needs an English gloss (en)")
    # ---- grammar
    allowed_rules = {r["id"] for r in course.rules_by(n)}
    new_rule = plan.get("rule")
    if lesson.get("rule") != new_rule:
        E.append(f"rule must be {new_rule!r} (the curriculum's rule for lesson {n})")
    cards = lesson.get("grammar", [])
    if new_rule and not any(new_rule in g.get("rules", []) for g in cards):
        E.append(f"lesson {n} must teach its new rule '{new_rule}' on a grammar card (rules: ['{new_rule}'])")
    for where, items in (("grammar", cards), ("exercises", lesson.get("exercises", [])), ("drills", lesson.get("drills", [])), ("examples", lesson.get("examples", []))):
        for i, x in enumerate(items):
            for rid in x.get("rules", []):
                if rid not in course.rules:
                    E.append(f"{where}[{i}] rules: unknown rule '{rid}'")
                elif rid not in allowed_rules:
                    E.append(f"{where}[{i}] rules: '{rid}' is not taught until lesson {course.rules[rid]['lesson']}")
    for i, x in enumerate(lesson.get("exercises", [])):
        if not (x.get("prompt") and x.get("answer")):
            E.append(f"exercises[{i}] needs prompt and answer")
        if x.get("choices") and x.get("answer") not in x["choices"]:
            E.append(f"exercises[{i}] answer must be one of its choices")
        if x.get("answerLang", "la") == "en" and not x.get("la"):
            E.append(f"exercises[{i}] translates Latin into English, so it needs the Latin sentence in 'la'")
    for i, d in enumerate(lesson.get("drills", [])):
        if d.get("sentence", "").count("___") != 1:
            E.append(f"drills[{i}] sentence needs exactly one ___")
        if d.get("answer") not in d.get("choices", []):
            E.append(f"drills[{i}] answer must be one of its choices")
    r = lesson.get("reading")
    if not (isinstance(r, dict) and r.get("la") and r.get("en")):
        E.append("reading (a short passage using only known words) with la and en is required")
    # ---- every Latin token
    used = {}          # lemma -> set(segment keys)
    item_lemmas = {}   # item key -> set(lemmas)
    forms_seen = {}    # (lemma, form) -> set(tags)
    bad = 0
    for where, text, key in latin_segments(lesson):
        for tok in TOKEN_RE.findall(text):
            st, an, msg = course.analyse(tok, n, names_ok)
            if st != "ok":
                bad += 1
                if bad <= 60:
                    E.append(f"{where}: {msg}")
                continue
            lemmas = sorted({a["lemma"] for a in an}, key=lambda x: course.first.get(x, 0))
            lid = lemmas[0]
            if key:
                used.setdefault(lid, set()).add(key)
                item_lemmas.setdefault(key, set()).add(lid)
                if an[0].get("clitic"):
                    item_lemmas[key].add(an[0]["clitic"]); used.setdefault(an[0]["clitic"], set()).add(key)
            tags = {a["tag"] for a in an if a["lemma"] == lid}
            forms_seen.setdefault((lid, M.strip(tok)), [tok, set()])[1].update(tags)
            if an[0].get("clitic"):
                forms_seen.setdefault((an[0]["clitic"], an[0]["clitic"][1:]), [an[0]["clitic"][1:], set()])[1].add("CLITIC")
    if bad > 60:
        E.append(f"… and {bad - 60} more token errors")
    for x in plan["newLemmas"]:
        k = len({s for s in used.get(x, set())})
        if k == 0:
            E.append(f"new lemma '{x}' is never used in a sentence, exercise or the reading")
        elif k == 1:
            W.append(f"new lemma '{x}' is used in only one sentence/exercise")
    # ---- recycling: 30–50% of exercises + drills review earlier lemmas
    items = [("x", i, x) for i, x in enumerate(lesson.get("exercises", []))] + [("d", i, x) for i, x in enumerate(lesson.get("drills", []))]
    rev = [t for t in items if t[2].get("review")]
    ratio = len(rev) / len(items) if items else 0
    if n >= 2:
        if not items:
            E.append("no exercises or drills")
        elif not (REVIEW_MIN <= ratio <= REVIEW_MAX):
            E.append(f"review share is {ratio:.0%} ({len(rev)}/{len(items)} items marked review) – must be 30–50%")
        for kind, i, x in rev:
            ls = item_lemmas.get(("item", f"{kind}{i}"), set())
            old = [l for l in ls if l in taught_before and not course.lex.get(l, {}).get("pos", "").startswith(M.POS_INV)]
            if not old:
                E.append(f"{'exercises' if kind == 'x' else 'drills'}[{i}] is marked review but uses no lemma from lessons 1–{n - 1}")
    elif rev:
        W.append("lesson 1 has nothing to review – review flags ignored")
    for kind, i, x in items:
        if x.get("review"):
            continue
        ls = item_lemmas.get(("item", f"{kind}{i}"), set())
        if not (ls & set(plan["newLemmas"])) and not (new_rule and new_rule in x.get("rules", [])):
            W.append(f"{'exercises' if kind == 'x' else 'drills'}[{i}] is not marked review but uses none of this lesson's new lemmas or its new rule")
    if new_rule:
        k = sum(1 for _, _, x in items if new_rule in x.get("rules", []))
        if k < 2:
            E.append(f"at least 2 exercises/drills must practise the new rule '{new_rule}' (tag them rules: ['{new_rule}'])")
    report = {"lesson": n, "items": len(items), "review": len(rev), "reviewShare": round(ratio, 2),
              "lemmasUsed": sorted(used), "formsSeen": {f"{l}:{f}": sorted(t) for (l, f), (_, t) in forms_seen.items()},
              "tokenErrors": bad}
    report["_forms"] = forms_seen
    return E, W, report
