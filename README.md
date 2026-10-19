# Lingua Latina – Dror's Latin course

A personal, mobile-first Latin app (plain HTML/CSS/JS, offline PWA) with a **self-written, frequency-based beginner course**.
Live: **https://droron.github.io/latin-app/** · repo: https://github.com/Droron/latin-app

Lessons are no longer taken from emails (they repeated words as "new" and asked for words never taught). Every lesson is now
written by us from a plan, and a validator guarantees it uses **only words and grammar already taught**.

## Quick start

| Want to… | Do this |
|---|---|
| Use it | open the live URL on iPhone/Mac → Share → **Add to Home Screen** (works offline), or open `dist/latin.html` |
| Plan the next lesson | `scripts/generate_lesson` → `drafts/L###.plan.json` + skeleton `drafts/L###.json` |
| Check a lesson | `scripts/validate_lesson drafts/L004.json` |
| Add it to the course | `scripts/add_lesson drafts/L004.json` (validates, writes `lessons/L004.json`, rebuilds) |
| Rebuild everything | `python3 scripts/build.py` (validates all lessons; fails on any error) |
| Tests | `python3 test/test_validator.py` and `node --experimental-websocket test/run.mjs [URL] [--shots]` |
| Publish | `scripts/publish` (see *Publishing*) |

## Where the words come from

`data/core_lemmas.json` is the **Dickinson College Commentaries Latin Core Vocabulary** – the ~1,000 most frequent Latin lemmas
(997 entries) with dictionary entry, part of speech, definition, frequency rank and semantic group –
https://dcc.dickinson.edu/latin-core-list1, by Christopher Francese et al. (Dickinson College, 2012–13), licensed **CC BY-SA 3.0**
(credited in the app under *Progress → About* and in `LICENSE.md`). Re-import with `python3 scripts/import_dcc.py`.
Each entry has our own ASCII `id` (`puella`, `sum`, `-que`, `hic-adv` …) used everywhere else.

## The curriculum – `data/curriculum.json`

- `lessons[]` – lessons 1–30 planned in detail: `number`, `title`, `newLemmas` (5–8 DCC ids), `rule` (≤ 1 new grammar rule or `null`), `focus`.
- `rules[]` – the grammar index source: `id`, `number`, `lesson`, `title`, `summary`, and `unlocks` – the inflection **features** the rule makes legal
  (e.g. `accusative-singular` unlocks `N1.*.acc.sg` and `A12.f.acc.sg`; `verb-3pl` unlocks `V1.pres.3pl`, `V2.pres.3pl`).
- `outline[]` – rough plan for lessons 31+ (hic/ille, relative pronoun, 3rd-decl. adjectives, 4th/5th decl., passive, subjunctive …, then the rest of the DCC list in rank order).
- Order: est-sentences → plural → verbs (3rd sg) → accusative → 3rd pl → acc. plural → 2nd decl. masc. → neuter → questions → 1st/2nd person →
  1st/2nd pl → imperative/vocative → infinitive → prepositions → ablative → genitive → dative → *review* → 3rd decl. (×3) → 3rd conj. → 3rd -iō/4th → *review* →
  imperfect → future (×2) → perfect → personal pronouns → is/ea/id. Lessons 18 and 24 add words but no grammar.
- Lemmas are chosen by frequency **and** teachability: the commonest function words and verbs/nouns first, but only once the grammar to use them exists.

Lessons 1–10 (new lemmas · rule):

| # | Title | New lemmas | Rule |
|---|---|---|---|
| 1 | Est: your first Latin sentences | sum, et, nōn, puella, fēmina, bonus, magnus | est-sentences |
| 2 | More than one: -ae and sunt | sed, terra, via, aqua, longus, parvus | nominative-plural |
| 3 | Verbs: someone does something | stō, labōrō, timeō, maneō, rīdeō, nunc, saepe | verb-3sg |
| 4 | The object: -am | amō, videō, habeō, vocō, laudō, silva | accusative-singular |
| 5 | They do: -nt | multus, parō, portō, spectō, quoque, ubi | verb-3pl |
| 6 | Many objects: -ās | porta, īnsula, fābula, nārrō, semper, numquam | accusative-plural |
| 7 | Boys and men: second declension | puer, vir, servus, dominus, equus, amīcus | second-declension-masculine |
| 8 | Neuter nouns | bellum, dōnum, verbum, oppidum, caelum, novus, dō | second-declension-neuter |
| 9 | Asking questions | -ne, quis, cūr, malus, laetus, iam | questions |
| 10 | I and you | ego, tū, meus, tuus, bene, rogō | verb-1sg-2sg |

## The validator – `scripts/validate_lesson` (also run by every build and in CI)

`scripts/latin_morph.py` generates every inflected form of a DCC lemma from its dictionary entry (5 declensions, adjectives 1st/2nd + 3rd,
4 conjugations + -iō, present/imperfect/future/perfect, imperative, infinitive, sum/possum/eō and compounds, personal/demonstrative/relative
pronouns), each tagged with a feature such as `N1.f.acc.sg` or `V2.pres.3pl`. `scripts/curriculum_lib.py` lemmatizes **every Latin token**
in a lesson (examples, word-card examples, exercise answers/choices/Latin prompts, every drill choice, the reading, and Latin written in
*single asterisks* inside English prose and grammar tables) and rejects lesson N when:

1. a word's lemma is not taught in lessons 1..N (message says which lesson will teach it), or is not in the DCC list / name whitelist;
2. a form needs grammar not yet taught (e.g. *puellam* before `accusative-singular`);
3. the vocab re-introduces an already-taught lemma as new, or differs from the curriculum's `newLemmas`;
4. it teaches/tags a rule other than the rules taught so far + its one planned rule, or doesn't teach and practise that rule (≥ 2 items);
5. it uses a proper name not in `data/names.json` or not glossed in `names` (the first lesson that uses it);
6. its review share is outside **30–50 %**: exercises + drills marked `"review": true`, each of which must use a lemma from an earlier lesson;
7. a new lemma is never used, or there is no `reading`.
Deponent/irregular verbs without a paradigm (volō, ferō …) are reported as unknown until `latin_morph.py` learns them (outline lessons 37+).
`test/test_validator.py` proves each rejection still works.

## Lesson schema (`schemaVersion: 2`, file `lessons/L###.json`)

```jsonc
{ "schemaVersion": 2, "number": 4, "id": "L004", "curriculum": "dcc-core-v1", "written": "2026-10-20",
  "title": "The object: -am", "subtitle": "Lesson 4 · …", "rule": "accusative-singular",
  "intro": "English with *Latin in single asterisks*; **bold** for English emphasis",
  "names": [{ "id": "iulia", "la": "Iūlia", "en": "Julia (a girl's name)" }],          // whitelist ids, gloss on first use
  "vocab": [{ "id": "amo", "la": "amō", "dict": "amō -āre", "en": "love", "accept": ["like"], "pos": "verb", "conj": "1",
              "rank": 219, "pron": "A-moh", "notes": "*amat* = …", "example": { "la": "Puella aquam amat.", "en": "…" } }],
  "grammar": [{ "title": "…", "rules": ["accusative-singular"], "body": "…", "table": { "head": [], "rows": [[]], "laCols": [0] } }],
  "examples": [{ "la": "…", "en": "…", "rules": ["…"] }],
  "exercises": [ // answerLang "la" (default): answer/accept/choices are Latin;  "en": the Latin sentence goes in "la"
    { "type": "translate", "prompt": "Translate into English:", "la": "Puella silvam videt.", "answerLang": "en", "answer": "The girl sees the forest.", "accept": [], "rules": [], "review": false },
    { "type": "choose", "prompt": "Choose the Latin for: …", "answer": "…", "choices": ["…"], "rules": [], "review": true } ],
  "drills": [{ "sentence": "Puella ___ videt.", "answer": "silvam", "choices": ["silvam", "silva"], "en": "…", "rules": [], "review": false }],
  "reading": { "title": "…", "la": "only known words", "en": "…", "hint": "…" },
  "notes": [] }
```

## Nightly procedure (one new lesson)

1. `scripts/generate_lesson` – reads the next number after the last `lessons/L###.json`; writes the **plan** (new lemmas with DCC data, the new
   rule, *allowed vocabulary = every taught lemma with exactly the forms the taught grammar permits*, allowed rules, review targets = earlier lemmas
   recycled least) and a skeleton with vocab pre-filled.
2. Write the content in `drafts/L###.json`: short clear explanation (grammar card tagged with the rule), 4–6 examples, ~7 exercises and ~4 drills
   (mix choose / translate both ways / fill), 30–50 % marked `review: true` using the review targets, a tiny reading passage. Use only allowed forms.
3. `scripts/validate_lesson drafts/L###.json` – fix every ERROR (warnings are advice).
4. `scripts/add_lesson drafts/L###.json` – writes `lessons/L###.json` and rebuilds lexicon, grammar index, app, `dist/`, `site/`.
5. Test: `python3 test/test_validator.py` and `node --experimental-websocket test/run.mjs` (or `scripts/publish --browser-tests`).
6. Publish: `scripts/publish -m "Lesson N: …"` (below).
Never edit a published lesson's new lemmas; fix typos with `scripts/add_lesson --force`.

## Weekly pass

- Review the curriculum: pacing (5–8 lemmas, ≤ 1 rule), upcoming lessons' lemma choices (DCC rank vs. teachability), extend the detailed plan
  so ≥ 10 lessons are always planned ahead, keep `outline` current. Change `data/curriculum.json` only for lessons not yet published.
- Adjust pacing from progress (export it from the app, *Progress → Backup → Export*): rules below 80 % accuracy or lemmas stuck in box ≤ 2 →
  insert a consolidation lesson (no new rule) or recycle them as review targets.
- Improve the UX (`IDEAS.md`), extend `latin_morph.py` before lessons that need new paradigms, re-run all tests, publish.

## Lexicon, grammar index, ordering

`scripts/build.py` derives (never edit): `data/lexicon.json` – taught lemmas in teaching order with DCC entry, rank, part of speech, gender,
declension/conjugation, first lesson, **every form seen with its parse and lesson numbers**, ambiguous parses marked *inferred*, and stats
(lemma count, forms count, counts by part of speech, growth per lesson; glossed names listed but not counted) – and `data/grammar.json` –
rules numbered in teaching order with explanation, examples, introducing/reinforcing lessons and tagged exercises.
In the app lessons run strictly 1, 2, 3… (path strip, prev/next); inside a lesson: words → grammar → exercises → reading; review and
practice only use lessons already reached; new review words are introduced in lesson order; *Grammar* lets you practise one rule.

## App, storage, PWA

`app/` (index.html, styles.css, app.js, sw.js, manifest) reads `window.LATIN_LESSONS / LATIN_LEXICON / LATIN_GRAMMAR / LATIN_META` from the
generated `app/lessons.js`. Progress lives in `localStorage` key **`latina.v1`** (unchanged). When the curriculum id changes (`dcc-core-v1`),
the course path and rule stats restart but XP, streak, settings and spaced-repetition boxes are kept. Storage is per origin/device:
use *Progress → Backup → Export/Import* to move progress between the file version, Safari and the Home-Screen app.
The service worker is network-first with an offline cache; each build has a new version and the app shows "updated" when it changes.

## Publishing

`scripts/publish` builds, runs the validator test (`--browser-tests` adds the Chrome suite), then pushes the **source** files to
`Droron/latin-app` (`main`). GitHub Actions (`.github/workflows/pages.yml`) rebuilds from source (lessons are validated again) and deploys
Pages. On the agent box there are no git credentials, so the script writes `.publish/payload.json` – `calls[]`, each the arguments for one
GitHub MCP `push_files` call (server `user-GitHub-xai`, ≤ 4 files per call because the MCP bridge resolves at most four `"$file:/abs/path"`
references, workflow last) – the agent sends them in order and then runs `scripts/publish --mark-published`. Each push may need the user's
approval (saved rule against git push).
With git credentials, `PUBLISH_VIA_GIT=1 scripts/publish` commits and pushes from `.publish/repo`.
Not published: `site/`, `dist/`, generated data, `drafts/`, `screenshots/`, `archive/` (the old email lessons, kept only locally).

## Layout

```
app/                      the app shell
lessons/L###.json         the course, one file per lesson
data/core_lemmas.json     DCC core list (source)      data/curriculum.json  plan + grammar rules      data/names.json  name whitelist
data/lexicon.json, grammar.json   generated
scripts/                  build.py, latin_morph.py, curriculum_lib.py, generate_lesson, validate_lesson, add_lesson, publish, import_dcc.py, make_icons.py
test/                     run.mjs (headless Chrome, phone 390×844 + desktop), test_validator.py
archive/email-lessons/    retired email-derived lessons (local only, not in the course)
```
