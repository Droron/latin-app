# Ideas / backlog

## Next (weekly pass)
- **Publishing:** the live site stopped at Lesson 5 (last push 2026-10-21); lessons 6–7 are only local. Check the nightly publish step.
- Who-does-what for questions and for sentences with two clauses; add dative/ablative once the course reaches them.
- Translate-the-reading mode: whole passage, sentence by sentence, with build tiles for the hardest sentence.
- Agreement drill (pick the adjective form that matches the noun) once adjectives appear in more cases/genders.
- Extend `latin_morph.py` before the outline needs it: deponents, volō/nōlō/ferō, comparatives, participles, passive, subjunctive.
- Syntax checks in the validator: preposition + required case (in + abl. vs acc.), adjective–noun agreement, subject–verb number.
- Spaced review of missed *sentences* (rules are done since 3.0): resurface missed exercises from earlier lessons.
- Auto-pick review targets from the user's exported progress (weak lemmas/rules) in `generate_lesson`.
- Per-lesson audio: record/generate classical pronunciation for the reading passage.
- Show "words you can read" coverage: % of a real text (e.g. Caesar BG 1.1) covered by taught lemmas.
- Sync progress between devices (e.g. a private gist) instead of manual export/import.

## Older ideas

## Content pipeline
- **Get the full lessons.** The emails stop at "Continue reading". Options: ask the automation to put the whole session in the email (shorter intro, no preamble) or to attach/append a JSON block in the schema from README – then `add_lesson` becomes copy-paste. Until then, the daily run could also paste the full session text from Grok manually into `raw/`.
- Ask the automation for structured output (word list, grammar, exercises with answers) and for the *next* lesson to build on previous ones – the first three lessons repeat puella/puer/est/et a lot.
- Track forms, not just lemmas: aqua/aquam, amo/amat, bonus/bona – a "forms" field per word, and drills that test endings (nominative vs accusative, -o vs -t).
- Add Hebrew glosses (`he` field) as an optional second meaning line; Hebrew speakers may find grammatical gender intuitive (ילד/ילדה ↔ puer/puella).
- Macrons: store canonical forms with macrons (puella, amō, bonus/bona) and show them, while keeping typing forgiving.

## Learning logic
- Upgrade Leitner to SM-2/FSRS with per-card ease, and separate cards per direction (LA→EN recognition vs EN→LA recall).
- "Learn" flow for new words: show card → hear it → easy MC → typing, before they enter review.
- Sentence-level exercises: build-a-sentence from word tiles (word order freedom: accept "Puella bona est" and "Bona puella est"), translate full sentences with multiple accepted answers.
- Grammar tables generated from data (e.g. 1st/2nd declension as they appear) with drills.
- Dictation mode: hear a sentence, type it (needs good TTS; consider recorded audio).
- Speech recognition (webkitSpeechRecognition, it-IT) for "say it" practice – iOS Safari support is spotty.
- Mistake log: "words you missed this week" session.
- Daily goal reminder: a Grok automation or iOS Shortcut nudge if no XP today (app can't push notifications from a file).

## UX
- Onboarding card explaining modes + review the first time.
- Streak freeze / weekly view (calendar heatmap) and achievements (first perfect round, 7-day streak, 25 words).
- Haptic-style micro-animations on correct answers; sound effects (toggle).
- Swipe gestures on flashcards (left = again, right = got it).
- Lesson "completed" state and a 'next up' suggestion on Today.
- Per-word detail sheet (all examples, history, which lessons).
- Large-text setting; RTL-aware layout if Hebrew is added.
- Sync progress between iPhone and Mac (export/import today; could use a tiny gist/iCloud file later).
- PWA install hint on iOS ("Share → Add to Home Screen") when served over https (e.g. GitHub Pages / Cloudflare Pages).

## Engineering
- Generate `dist/latin.html` and email/host it automatically after each daily add.
- JSON Schema file + CI check; unit tests for `grade()`.
- Versioned localStorage migrations when the schema changes.

## Notes from nightly runs
- 2026-10-20 (Lesson 5): no progress export available on the box, so pacing stayed as planned. `test/run.mjs` flashcard loop was capped at 30 cards and failed once the deck reached 32 words – raised the cap. Consider sharing a progress export before Friday's review.
