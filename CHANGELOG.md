# Changelog

## 3.0 – 2026-10-23 · sentence structure (weekly pass for lessons 4–7)
This week's lessons brought cases (accusative singular/plural), verb endings (3rd person singular/plural) and the 2nd declension,
so the new exercises practise *how a sentence is put together*, not just single words.
- **Build the sentence** (new Practice mode, plus one per lesson after its exercises): English prompt, tap Latin word tiles into order.
  Any correct Latin order of a single clause is accepted ("Servōs dominus vocat" for "Dominus servōs vocat"), with a note explaining why;
  nōn, prepositions and quoque must stay next to their word, and sentences with et/sed/commas/questions must match exactly.
  **Challenge** (harder mode): once all of a sentence's rules are mastered (or from level 4), one tile with a wrong ending is mixed in.
- **Who does what?** (new mode, plus one per lesson): tap the subject or the object of a sentence; the answer shows S/O/V on every word and
  names the ending. Sentences where an ending is ambiguous (e.g. -a could be either) are never asked.
- **Endings** (new mode, also in Mix): "pick the accusative plural of servus" from the forms taught so far; for words in box 4+ it becomes
  typing with strict grading (a near miss counts as wrong).
- **Grammar refreshers in Review**: up to 2 practised rules that are weak, or mastered but unseen for 3+ days, are added to the end of the
  review (one question + one sentence to build each), and the Review page lists them. Stored as a `last` timestamp inside the existing
  rule entries – same `latina.v1` key, no reset.
- New Practice tiles are marked "new" and stay disabled with a hint until the course has the content (e.g. "From Lesson 4 (objects)").
- **Fix:** Lesson 7 arrived without a `written` date, which crashed the Today screen of the local build ("Cannot read properties of null").
  Added the date, made the build fall back to the file date with a warning, and made date formatting tolerate a missing date.
- Tests: word-order grading, subject/object detection, endings drill, and full sessions of the three new modes on phone and desktop
  (203/203 checks).

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
