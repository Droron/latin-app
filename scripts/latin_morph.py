"""Latin morphology for the lesson validator (stdlib only).

Generates every inflected form of a lemma from its dictionary entry (DCC headword style) and tags each
form with a grammar feature, e.g.  puellam -> N1.f.acc.sg,  amant -> V1.pres.3pl,  est -> Vsum.pres.3sg.
Curriculum rules unlock feature patterns (fnmatch globs), so "is this form allowed in lesson N?" is:
lemma taught by lesson N  AND  some tag of the form matches a pattern unlocked by a rule taught by lesson N.

Tag scheme
  nouns       N{1-5}.{m|f|n}.{nom|gen|dat|acc|abl|voc}.{sg|pl}
  adjectives  A12.{m|f|n}.{case}.{num}   (bonus -a -um, pulcher -chra -chrum)   A3.… (omnis -e, ingēns -ntis)
  verbs       V{1|2|3|3io|4|sum|poss}.{pres|impf|fut|perf}.{1|2|3}{sg|pl}   V*.imp.{sg|pl}   V*.inf
  pronouns    P.{id}.{case}.{num}[.{g}]
  other       INV (adverbs, conjunctions, prepositions, indeclinables)   CLITIC (-que, -ne, -ve)
"""
import re, unicodedata

CASES = ["nom", "gen", "dat", "acc", "abl", "voc"]


def strip(t):
    t = unicodedata.normalize("NFD", t or "")
    return "".join(c for c in t if not unicodedata.combining(c)).lower().replace("j", "i")


def nfc(t):
    return unicodedata.normalize("NFC", t)


class Unsupported(Exception):
    pass


# ---------------------------------------------------------------- helpers
def merge(lemma, suffix, drop=2):
    """'tempus' + '-oris' -> 'temporis';  'pulcher' + '-chra' -> 'pulchra';  'aetās' + '-tātis' -> 'aetātis'."""
    s = suffix.lstrip("-")
    if not suffix.startswith("-"):
        return s
    if len(s) > 2:
        i = strip(lemma).rfind(strip(s[:2]))
        if i > 0:
            return lemma[:i] + s
    i = strip(lemma).rfind(strip(s[0]))
    if len(s) > 1 and i > 0 and i >= len(lemma) - 4:
        return lemma[:i] + s
    base = lemma[:-drop] if not strip(lemma)[-1] in "aeiouy" else lemma[:-1]
    return base + s


def table(prefix, stems_endings):
    out = []
    for tag, form in stems_endings:
        for f in form if isinstance(form, (list, tuple)) else [form]:
            out.append((nfc(f), f"{prefix}.{tag}"))
    return out


# ---------------------------------------------------------------- nouns
def noun_forms(lemma, gen, gender, decl, plural_only=False):
    g = gender
    if decl == 1:
        st = lemma[:-1] if not plural_only else lemma[:-2]
        sg = [st + "a", st + "ae", st + "ae", st + "am", st + "ā", st + "a"]
        pl = [st + "ae", st + "ārum", st + "īs", st + "ās", st + "īs", st + "ae"]
    elif decl == 2:
        if plural_only:   # arma -ōrum n. pl. / līberī
            st = lemma[:-1]
            g = gender
        elif gen and not gen.startswith("-"):
            st = gen[:-1]           # puer puerī -> puer ; ager agrī -> agr
        else:
            st = lemma[:-2]
        if g == "n":
            sg = [st + "um", st + "ī", st + "ō", st + "um", st + "ō", st + "um"]
            pl = [st + "a", st + "ōrum", st + "īs", st + "a", st + "īs", st + "a"]
        else:
            voc = lemma if not strip(lemma).endswith("us") else (st + "ī" if strip(st).endswith("i") else st + "e")
            sg = [lemma, [st + "ī", st[:-1] + "ī"] if strip(st).endswith("i") else st + "ī", st + "ō", st + "um", st + "ō", voc]
            pl = [st + "ī", st + "ōrum", st + "īs", st + "ōs", st + "īs", st + "ī"]
    elif decl == 3:
        gfull = merge(lemma, gen) if gen.startswith("-") else gen
        st = gfull[:-2]
        istem = (strip(lemma).endswith(("is", "es")) and len(strip(lemma)) == len(strip(gfull))) or \
                (re.search(r"[^aeiouy][^aeiouy]$", strip(st)) and len(re.findall(r"[aeiouy]+", strip(lemma))) == 1) or \
                (g == "n" and strip(lemma).endswith(("e", "al", "ar")))
        if g == "n":
            sg = [lemma, st + "is", st + "ī", lemma, st + "ī" if istem else st + "e", lemma]
            pl = [st + ("ia" if istem else "a"), st + ("ium" if istem else "um"), st + "ibus", st + ("ia" if istem else "a"), st + "ibus", st + ("ia" if istem else "a")]
        else:
            sg = [lemma, st + "is", st + "ī", st + "em", st + "e", lemma]
            pl = [st + "ēs", [st + "ium", st + "um"] if istem else st + "um", st + "ibus", [st + "ēs", st + "īs"] if istem else st + "ēs", st + "ibus", st + "ēs"]
    elif decl == 4:
        st = lemma[:-2] if strip(lemma).endswith("us") else lemma[:-1]
        if g == "n":
            sg = [st + "ū", st + "ūs", st + "ū", st + "ū", st + "ū", st + "ū"]
            pl = [st + "ua", st + "uum", st + "ibus", st + "ua", st + "ibus", st + "ua"]
        else:
            sg = [lemma, st + "ūs", st + "uī", st + "um", st + "ū", lemma]
            pl = [st + "ūs", st + "uum", st + "ibus", st + "ūs", st + "ibus", st + "ūs"]
    elif decl == 5:
        st = lemma[:-2]
        sg = [lemma, [st + "eī", st + "ēī"], [st + "eī", st + "ēī"], st + "em", st + "ē", lemma]
        pl = [st + "ēs", st + "ērum", st + "ēbus", st + "ēs", st + "ēbus", st + "ēs"]
    else:
        raise Unsupported(f"declension {decl}")
    out = []
    pre = f"N{decl}.{g}"
    if not plural_only:
        out += table(pre, [(f"{c}.sg", f) for c, f in zip(CASES, sg)])
    out += table(pre, [(f"{c}.pl", f) for c, f in zip(CASES, pl)])
    return out


# ---------------------------------------------------------------- adjectives
def adj12_forms(m, f_tok, n_tok):
    f = merge(m, f_tok)
    st = f[:-1]
    out = []
    mst = st if not strip(m).endswith("us") else m[:-2]
    masc_voc = (m[:-2] + "e") if strip(m).endswith("us") else m
    out += noun_forms(m, st + "ī", "m", 2)
    out = [(x, t) for x, t in out if not t.endswith(".voc.sg")] + [(nfc(masc_voc), "N2.m.voc.sg")]
    if strip(m) == "meus":
        out = [(x, t) for x, t in out if t != "N2.m.voc.sg"] + [("mī", "N2.m.voc.sg")]
    out += noun_forms(f, None, "f", 1)
    out += noun_forms(st + "um", st + "ī", "n", 2)
    return [(x, "A12." + t.split(".", 1)[1]) for x, t in out]


def adj3_forms(toks):
    """omnis -e | ācer ācris ācre | ingēns ingentis | fēlīx -īcis"""
    m = toks[0]
    if len(toks) >= 3 and not toks[1].startswith("-") and not toks[2].startswith("-"):     # ācer ācris ācre
        mf_f, n = toks[1], toks[2]
        st = mf_f[:-2]
        nom = {"m": m, "f": mf_f, "n": n}
        one = False
    elif len(toks) >= 2 and toks[1] in ("-e",) or (len(toks) >= 2 and strip(toks[1]).endswith("e") and strip(toks[0]).endswith("is")):
        st = m[:-2]
        nom = {"m": m, "f": m, "n": st + "e"}
        one = False
    else:                                                                                     # one termination + genitive
        gen = merge(m, toks[1]) if len(toks) > 1 and toks[1].startswith("-") else (toks[1] if len(toks) > 1 else m)
        st = gen[:-2]
        nom = {"m": m, "f": m, "n": m}
        one = True
    out = []
    for g in "mfn":
        if g == "n":
            sg = [nom["n"], st + "is", st + "ī", nom["n"], st + "ī", nom["n"]]
            pl = [st + "ia", st + "ium", st + "ibus", st + "ia", st + "ibus", st + "ia"]
        else:
            sg = [nom[g], st + "is", st + "ī", st + "em", [st + "ī", st + "e"] if one else st + "ī", nom[g]]
            pl = [st + "ēs", st + "ium", st + "ibus", [st + "ēs", st + "īs"], st + "ibus", st + "ēs"]
        out += table(f"A3.{g}", [(f"{c}.sg", x) for c, x in zip(CASES, sg)] + [(f"{c}.pl", x) for c, x in zip(CASES, pl)])
    return out


# ---------------------------------------------------------------- verbs
PERS = ["1sg", "2sg", "3sg", "1pl", "2pl", "3pl"]
SUM = {"pres": ["sum", "es", "est", "sumus", "estis", "sunt"], "impf": ["eram", "erās", "erat", "erāmus", "erātis", "erant"],
       "fut": ["erō", "eris", "erit", "erimus", "eritis", "erunt"], "perf": ["fuī", "fuistī", "fuit", "fuimus", "fuistis", ["fuērunt", "fuēre"]]}


def sum_forms(prefix="", pot=False, perf_stem=None):
    out = []
    for t, forms in SUM.items():
        for p, f in zip(PERS, forms):
            for x in f if isinstance(f, list) else [f]:
                if pot:
                    if t == "perf":
                        x = "potu" + x[2:]
                    elif x.startswith("s"):
                        x = "pos" + x
                    else:
                        x = "pot" + x
                elif t == "perf" and perf_stem:
                    x = perf_stem + x[2:]
                else:
                    x = prefix + x
                out.append((nfc(x), f"{t}.{p}"))
    if pot:
        out.append(("posse", "inf"))
    else:
        out += [(nfc(prefix + "esse"), "inf"), (nfc(prefix + "es"), "imp.sg"), (nfc(prefix + "este"), "imp.pl")]
    return out


EO = {"pres": ["eō", "īs", "it", "īmus", "ītis", "eunt"], "impf": ["ībam", "ībās", "ībat", "ībāmus", "ībātis", "ībant"],
      "fut": ["ībō", "ībis", "ībit", "ībimus", "ībitis", "ībunt"], "perf": ["iī", ["īstī", "iistī"], "iit", "iimus", ["īstis", "iistis"], "iērunt"]}


def regular_verb(lemma, inf, perf, conj):
    l = lemma
    if conj == "1":
        r = l[:-1]
        pres = [r + "ō", r + "ās", r + "at", r + "āmus", r + "ātis", r + "ant"]
        ps = r + "ā"; impf_st = ps + "b"; fut = [ps + "bō", ps + "bis", ps + "bit", ps + "bimus", ps + "bitis", ps + "bunt"]
        imp = [ps, ps + "te"]; infin = ps + "re"; dperf = r + "āv"
        if strip(l) == "do":
            pres = ["dō", "dās", "dat", "damus", "datis", "dant"]; impf_st = "dab"; fut = ["dabō", "dabis", "dabit", "dabimus", "dabitis", "dabunt"]
            imp = ["dā", "date"]; infin = "dare"
    elif conj == "2":
        r = l[:-2]
        ps = r + "ē"
        pres = [r + "eō", ps + "s", r + "et", ps + "mus", ps + "tis", r + "ent"]
        impf_st = ps + "b"; fut = [ps + "bō", ps + "bis", ps + "bit", ps + "bimus", ps + "bitis", ps + "bunt"]
        imp = [ps, ps + "te"]; infin = ps + "re"; dperf = r + "u"
    elif conj == "3":
        r = l[:-1]
        pres = [r + "ō", r + "is", r + "it", r + "imus", r + "itis", r + "unt"]
        impf_st = r + "ēb"; fut = [r + "am", r + "ēs", r + "et", r + "ēmus", r + "ētis", r + "ent"]
        imp = [r + "e", r + "ite"]; infin = r + "ere"; dperf = None
        if strip(l) in ("dico", "duco"):
            imp = [[r, r + "e"], r + "ite"]
    elif conj in ("3io", "4"):
        r = l[:-2]
        if conj == "3io":
            pres = [r + "iō", r + "is", r + "it", r + "imus", r + "itis", r + "iunt"]; imp = [r + "e", r + "ite"]; infin = r + "ere"; dperf = None
            if strip(l) == "facio":
                imp = [["fac", "face"], "facite"]
        else:
            pres = [r + "iō", r + "īs", r + "it", r + "īmus", r + "ītis", r + "iunt"]; imp = [r + "ī", r + "īte"]; infin = r + "īre"; dperf = r + "īv"
        impf_st = r + "iēb"; fut = [r + "iam", r + "iēs", r + "iet", r + "iēmus", r + "iētis", r + "ient"]
    else:
        raise Unsupported(conj)
    impf = [impf_st + e for e in ("am", "ās", "at", "āmus", "ātis", "ant")]
    out = [(f, f"pres.{p}") for p, f in zip(PERS, pres)] + [(f, f"impf.{p}") for p, f in zip(PERS, impf)] + \
          [(f, f"fut.{p}") for p, f in zip(PERS, fut)]
    pst = []
    for p in (perf or "").split("/"):
        p = p.strip()
        if not p or p.endswith("sum"):
            continue
        full = merge(lemma, p) if p.startswith("-") else p
        if strip(full).endswith("i"):
            pst.append(full[:-1])
    if not pst and dperf and not perf:
        pst = [dperf]
    for s in pst:
        out += [(s + e, f"perf.{p}") for p, e in zip(PERS, ["ī", "istī", "it", "imus", "istis", "ērunt"])] + [(s + "ēre", "perf.3pl")]
    for f, t in [(imp[0], "imp.sg"), (imp[1], "imp.pl"), (infin, "inf")]:
        out += [(x, t) for x in (f if isinstance(f, list) else [f])]
    return [(nfc(f), t) for f, t in out]


# ---------------------------------------------------------------- pronouns
def _decl_table(rows):
    """rows: {tag: 'form' | [forms]} -> list"""
    out = []
    for tag, f in rows.items():
        for x in f if isinstance(f, list) else [f]:
            out.append((nfc(x), tag))
    return out


def _gtable(m, f, n):
    """three gender columns, each 10 forms in order nom gen dat acc abl (sg) then (pl)"""
    out = {}
    for g, col in (("m", m), ("f", f), ("n", n)):
        for i, x in enumerate(col):
            c = CASES[i % 5]; num = "sg" if i < 5 else "pl"
            out.setdefault(f"{c}.{num}.{g}", x)
    return out


PRON = {
    "ego": {"nom.sg": "ego", "gen.sg": "meī", "dat.sg": ["mihi", "mihī"], "acc.sg": "mē", "abl.sg": ["mē", "mēcum"]},
    "tu": {"nom.sg": "tū", "gen.sg": "tuī", "dat.sg": ["tibi", "tibī"], "acc.sg": "tē", "abl.sg": ["tē", "tēcum"]},
    "nos": {"nom.pl": "nōs", "gen.pl": ["nostrum", "nostrī"], "dat.pl": "nōbīs", "acc.pl": "nōs", "abl.pl": ["nōbīs", "nōbīscum"]},
    "vos": {"nom.pl": "vōs", "gen.pl": ["vestrum", "vestrī"], "dat.pl": "vōbīs", "acc.pl": "vōs", "abl.pl": ["vōbīs", "vōbīscum"]},
    "sui": {"gen.sg": "suī", "dat.sg": ["sibi", "sibī"], "acc.sg": ["sē", "sēsē"], "abl.sg": ["sē", "sēcum"]},
    "quis": {"nom.sg": "quis", "gen.sg": "cuius", "dat.sg": "cui", "acc.sg": ["quem", "quid"], "abl.sg": "quō", "nom.sg.n": "quid"},
    "is": _gtable(["is", "eius", "eī", "eum", "eō", ["eī", "iī"], "eōrum", ["eīs", "iīs"], "eōs", ["eīs", "iīs"]],
                  ["ea", "eius", "eī", "eam", "eā", "eae", "eārum", ["eīs", "iīs"], "eās", ["eīs", "iīs"]],
                  ["id", "eius", "eī", "id", "eō", "ea", "eōrum", ["eīs", "iīs"], "ea", ["eīs", "iīs"]]),
    "hic": _gtable(["hic", "huius", "huic", "hunc", "hōc", "hī", "hōrum", "hīs", "hōs", "hīs"],
                   ["haec", "huius", "huic", "hanc", "hāc", "hae", "hārum", "hīs", "hās", "hīs"],
                   ["hoc", "huius", "huic", "hoc", "hōc", "haec", "hōrum", "hīs", "haec", "hīs"]),
    "ille": _gtable(["ille", "illīus", "illī", "illum", "illō", "illī", "illōrum", "illīs", "illōs", "illīs"],
                    ["illa", "illīus", "illī", "illam", "illā", "illae", "illārum", "illīs", "illās", "illīs"],
                    ["illud", "illīus", "illī", "illud", "illō", "illa", "illōrum", "illīs", "illa", "illīs"]),
    "ipse": _gtable(["ipse", "ipsīus", "ipsī", "ipsum", "ipsō", "ipsī", "ipsōrum", "ipsīs", "ipsōs", "ipsīs"],
                    ["ipsa", "ipsīus", "ipsī", "ipsam", "ipsā", "ipsae", "ipsārum", "ipsīs", "ipsās", "ipsīs"],
                    ["ipsum", "ipsīus", "ipsī", "ipsum", "ipsō", "ipsa", "ipsōrum", "ipsīs", "ipsa", "ipsīs"]),
    "qui": _gtable(["quī", "cuius", "cui", "quem", "quō", "quī", "quōrum", ["quibus", "quīs"], "quōs", ["quibus", "quīs"]],
                   ["quae", "cuius", "cui", "quam", "quā", "quae", "quārum", ["quibus", "quīs"], "quās", ["quibus", "quīs"]],
                   ["quod", "cuius", "cui", "quod", "quō", "quae", "quōrum", ["quibus", "quīs"], "quae", ["quibus", "quīs"]]),
}

POS_INV = ("Adverb", "Conjunction", "Preposition", "Interjection", "Adjective: Indeclinable", "Noun: Indeclinable")
NUMERALS = {"duo": _gtable(["duo", "duōrum", "duōbus", ["duōs", "duo"], "duōbus"] * 2, ["duae", "duārum", "duābus", "duās", "duābus"] * 2,
                            ["duo", "duōrum", "duōbus", "duo", "duōbus"] * 2),
            "tres": {"nom.pl": ["trēs", "tria"], "gen.pl": "trium", "dat.pl": "tribus", "acc.pl": ["trēs", "trīs", "tria"], "abl.pl": "tribus"}}


def paradigm(lex):
    """lex: {id, lemma, entry, pos} -> list of (form, tag). Raises Unsupported for entries we can't inflect yet."""
    pos, entry, lid = lex["pos"], lex["entry"], lex["id"]
    toks = [t for t in re.split(r"[\s,;]+", entry.replace(":", " ")) if t]
    if lid in ("-que", "-ne", "-ve"):
        return [(lid[1:], "CLITIC")]
    if lex.get("forms"):           # explicit override table {form: tag}
        return [(nfc(f), t) for f, t in lex["forms"].items()]
    if lid in PRON:
        return [(f, f"P.{lid}.{t}") for f, t in _decl_table(PRON[lid])]
    if lid in NUMERALS:
        return [(f, f"NUM.{lid}.{t}") for f, t in _decl_table(NUMERALS[lid])]
    if pos.startswith(POS_INV) or lid in ("unus",) and False:
        alts = [t for t in re.split(r"[\s,/]+|\bor\b", re.sub(r"\(.*?\)", "", entry)) if t and t not in ("or",)]
        return [(nfc(a.rstrip(":")), "INV") for a in alts]
    if pos.startswith("Noun"):
        m = re.match(r"Noun: (\d)", pos)
        if not m:
            raise Unsupported(f"{entry}: {pos}")
        decl = int(m.group(1))
        g = re.search(r"\b([mfn])\.", entry)
        gender = g.group(1) if g else ("f" if decl == 1 else "m")
        plural_only = " pl." in entry
        gen = toks[1] if len(toks) > 1 else ""
        forms = noun_forms(toks[0], gen, gender, decl, plural_only)
        if lid == "deus":
            forms += [(nfc(x), "N2.m." + t) for x, t in [("deus", "voc.sg"), ("dī", "nom.pl"), ("diī", "nom.pl"), ("dīs", "dat.pl"), ("dīs", "abl.pl"), ("deum", "gen.pl")]]
        if lid == "domus":
            forms += [(nfc(x), "N4.f." + t) for x, t in [("domō", "abl.sg"), ("domī", "loc.sg"), ("domōs", "acc.pl"), ("domōrum", "gen.pl")]]
        if "; " in entry:          # 'dominus -ī m.; domina -ae f.' -> also the feminine partner
            other = entry.split("; ", 1)[1].split()
            od = 1 if other[1] == "-ae" else 2
            forms += noun_forms(other[0], other[1], other[2].rstrip(".")[0] if len(other) > 2 else "f", od)
        return forms
    if pos.startswith("Adjective: 1st and 2nd") or (pos == "Pronoun" and re.search(r"-a -um|nostra|vestra", entry)) or lid in ("unus", "solus", "totus", "nullus", "ullus", "alter", "alius"):
        if lid == "alius":
            forms = adj12_forms("alius", "-a", "-ud")
            return [(f, t) for f, t in forms if not t.startswith("A12.n.nom.sg") and not t.startswith("A12.n.acc.sg")] + [("aliud", "A12.n.nom.sg"), ("aliud", "A12.n.acc.sg")]
        if len(toks) < 2:
            raise Unsupported(entry)
        return adj12_forms(toks[0], toks[1], toks[2] if len(toks) > 2 else "-um")
    if pos.startswith("Adjective: 3rd"):
        return adj3_forms(toks)
    if pos.startswith("Verb: Irregular") or lid in ("sum",):
        base = strip(toks[0])
        if base == "sum":
            return [(f, "Vsum." + t) for f, t in sum_forms()]
        if base == "possum":
            return [(f, "Vposs." + t) for f, t in sum_forms(pot=True)]
        if base.endswith("sum") and len(toks) >= 3:      # adsum, absum, dēsum … (prefix + sum)
            pre = toks[0][:-3]
            pf = toks[2] if not toks[2].startswith("-") else pre + toks[2].lstrip("-")
            return [(f, "Vsum." + t) for f, t in sum_forms(prefix=pre, perf_stem=pf[:-2] if strip(pf).endswith("ui") else None)]
        if base.endswith("eo") and ("īre" in entry or "-īre" in entry):
            pre = toks[0][:-2]
            out = []
            for t, forms in EO.items():
                for p, f in zip(PERS, forms):
                    for x in f if isinstance(f, list) else [f]:
                        out.append((nfc(pre + x), f"Veo.{t}.{p}"))
            return out + [(nfc(pre + "īre"), "Veo.inf"), (nfc(pre + "ī"), "Veo.imp.sg"), (nfc(pre + "īte"), "Veo.imp.pl")]
        raise Unsupported(f"{entry}: irregular verb – add an explicit 'forms' table")
    if pos.startswith("Verb: 1st"):
        conj = "1"
    elif pos.startswith("Verb: 2nd"):
        conj = "2"
    elif pos.startswith("Verb: 3rd Conjugation -iō"):
        conj = "3io"
    elif pos.startswith("Verb: 3rd"):
        conj = "3"
    elif pos.startswith("Verb: 4th"):
        conj = "4"
    else:
        raise Unsupported(f"{entry}: {pos}")
    perf = toks[2] if len(toks) > 2 else None
    return [(f, f"V{conj}.{t}") for f, t in regular_verb(toks[0], toks[1] if len(toks) > 1 else None, perf, conj)]


def describe(tag):
    """human-readable parse of a tag, for the lexicon screen."""
    if tag in ("INV", "CLITIC"):
        return {"INV": "invariable", "CLITIC": "enclitic"}[tag]
    p = tag.split(".")
    names = {"nom": "nominative", "gen": "genitive", "dat": "dative", "acc": "accusative", "abl": "ablative", "voc": "vocative", "loc": "locative",
             "sg": "singular", "pl": "plural", "m": "masc.", "f": "fem.", "n": "neut.", "pres": "present", "impf": "imperfect", "fut": "future",
             "perf": "perfect", "imp": "imperative", "inf": "infinitive"}
    if p[0].startswith(("N", "A")) and len(p) >= 4:
        return f"{names.get(p[2], p[2])} {names.get(p[3], p[3])}" + (f" {names.get(p[1])}" if p[0].startswith("A") else "")
    if p[0].startswith("V"):
        if p[1] in ("imp",):
            return f"imperative {names.get(p[2], p[2])}"
        if p[1] == "inf":
            return "infinitive"
        pers = {"1": "1st", "2": "2nd", "3": "3rd"}[p[2][0]]
        return f"{names[p[1]]} {pers} person {names[p[2][1:]]}"
    if p[0] in ("P", "NUM"):
        return " ".join(names.get(x, x) for x in p[2:])
    return tag
