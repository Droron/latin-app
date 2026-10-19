# Changelog

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
