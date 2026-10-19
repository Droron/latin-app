# Changelog

## 2.1 – 2026-10-19 · navigation
- **Sessions return to where they were launched from.** Exercises, flashcards, drills and practice started inside a lesson end with a
  summary (score, XP) and a **Continue lesson** button that goes back to that lesson, scrolled to the next section (e.g. the reading),
  with a "✓ Exercises done · 8/8 right · +100 XP" banner. The section is marked done (✓ on its heading; stored in `course.sections`,
  same `latina.v1` key, nothing reset). Practice tab → back to Practice (same scope), Review → Review, a grammar rule → that rule,
  Today → Today. A finished lesson offers **Next: Lesson n+1** and **Back to …**.
- **History-aware navigation.** Every screen is a history entry with a numbered `history.state` and a per-tab navigation stack, so the
  browser / iOS swipe-back gesture works in the installed app. Leaving a finished session replaces its entry (Back never lands in a finished
  session and restarts it); redirects and the Practice scope buttons no longer add history entries; Back restores the scroll position.
- **Header back control** on every non-root screen, named after the destination ("‹ Lesson 3", "‹ Lexicon", "‹ Rule 3", "‹ Course");
  it replaces the hard-coded "← Course"/"← Grammar" links. Escape also goes back on desktop.
- **Quit with confirmation**: the X (and header back) in a session asks "Leave this session?" once you have answered something; it returns to
  the section you launched from. The session's tab stays highlighted (Course for lesson sessions, not Practice).
- New **word page** (`#/words/<id>`): dictionary entry, forms seen, examples, lessons, previous/next word; linked from lesson word cards and the Lexicon.
- Dead ends fixed: "Nothing to do here" screens now go back to their origin; "Unlocks when you reach Lesson n" links to the lesson.
- Tests: 43 navigation checks per viewport in `test/run.mjs` (phone + desktop); `test/nav_shots.mjs` takes the before/after screenshots.

## 2.0 – 2026-10-19 · self-written frequency course
- **New content pipeline.** The email lessons are retired (archived locally in `archive/email-lessons/`, not shown) because they re-taught words
  as new and asked for untaught words. Lessons are now written from `data/curriculum.json`, built on the DCC Latin Core Vocabulary
  (`data/core_lemmas.json`, 997 lemmas, CC BY-SA 3.0, credited in the app's About box).
- Curriculum: 30 lessons planned in detail (185 lemmas, 28 grammar rules, 2 consolidation lessons) plus an outline to the full core list.
- `latin_morph.py` (paradigms for all declensions/conjugations) + `curriculum_lib.py`: every Latin token is lemmatized; `validate_lesson` rejects
  untaught lemmas, untaught grammar, re-introduced lemmas, unglossed names, review share outside 30–50 %. `generate_lesson` writes the plan
  (allowed forms per lemma, review targets) and a skeleton. `add_lesson` rewritten. `test/test_validator.py`.
- Lessons 1–3 written: est-sentences; plural -ae/sunt; 3rd-person verbs.
- Lexicon and grammar index are now fully derived (forms seen + parses from the lemmatizer, DCC rank shown).
- App: exercise prompts show the Latin sentence (speakable); fill-in-the-blank offers other forms of the same word as distractors and only taught
  forms; "Lesson exercises" replaces "Email exercises"; About/credits; course progress migrates (same `latina.v1` key, course restarted, XP kept).
- GitHub Pages: workflow builds from source; `scripts/publish` (git or MCP `push_files` payload).

## 1.1 – 2026-10-19
- Lesson numbering, course path, lexicon and grammar index, PWA (manifest, icons, service worker), two Oct 19 email lessons.

## 1.0 – 2026-10-19
- First version from the daily "Language Practice" emails.
