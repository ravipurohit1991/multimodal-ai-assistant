# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Renamed the application and project from its former assistant-oriented name to
  **PersonaParlour**, including the Python package (`personaparlour`), frontend
  metadata, development commands, documentation, and repository links. Existing
  browser settings and exported sessions remain compatible.

### Fixed
- **The reply prompt had grown incoherent.** Each feature had been added with its own
  system block and its own placement, and nobody had looked at the result end to end.
  With everything switched on a single reply carried **ten system messages, four of
  them stacked after the user's turn** — so the last thing the model read before
  answering was two thousand characters of instructions rather than the question. The
  standing context (contract and card, memory, lore, scene, canon, threads) is now one
  leading system message, and the per-reply steering (Director dials, Character Study,
  Sightlines, Author's Note, any armed correction, the closing check) is one message
  placed immediately *before* the user's latest turn, so their words stay last. Twenty
  messages became twelve, ten system turns became three, and nothing sits between the
  question and the answer. Chat templates expect a single leading system turn and
  render repeats inconsistently, which the old shape was quietly relying on.
- **The same rules were being stated up to six times.** An audit of the assembled
  prompt found 32 directive lines, with "never mention these instructions" repeated
  six times across block headers, "don't write for the user" three times, and the
  knowledge rule three times. A capable model tries to satisfy every directive at
  once, which is what produced cluttered, checklist-driven prose that drifted from the
  conversation. The rule about bracketed records is now stated once, in the always-on
  contract, and stripped from the individual block headers; the closing check no longer
  restates what Sightlines says in full a few lines above it.
- **The Director's length dial contradicted the character prompt.** The base prompt asks
  for length to "match the moment — concise for quick dialogue, richer for important
  beats" while the dial demanded a flat "two to four paragraphs". A model that tries to
  honour both pads a one-line exchange into four paragraphs of scenery to make the
  number. The dials now read as targets the moment may stretch or compress.
- **Replies were leaking their own speaker label.** A group reply is stored as
  `"Mira: ..."` so the model can track who spoke, and the model copied the label into
  its next reply — reaching the transcript as `Mira: Mira: *she turns*`. Caught on two
  of four consecutive turns against `glm-5.2:cloud`. A leading label is now stripped as
  it streams (so the reader never sees it), stripped from the stored history (so the
  next turn does not learn the habit from this one), and asked against in the reply
  check. Only a bare label naming someone in the scene is removed, so `"Mira, don't"`
  and a colon inside real prose are both left alone.
- **The Author's Note could split a matched pair.** It is injected a configurable depth
  from the end, and depending on parity it landed between a user message and the
  assistant's answer to it, which breaks the strict alternation some chat templates
  require. It now snaps to a position before a user turn, and folds into the steering
  message when its depth would put it there anyway.

### Added
- **Invent a character** — a whole card written by the model, from a guiding line or
  from nothing. `src/personaparlour/character_cards.py` returns name, description,
  personality, and first message; the cast manager grows a box for the optional
  guidance and a *Surprise me* button when it is empty.
  The blank case is the one with a real problem behind it. A model asked for "a random
  character" is not random in any useful sense — it returns Elara or Kaelen, an elf or a
  ranger, with striking eyes and a mysterious past, essentially every time, and the
  temperature dial only shuffles the wording. So the randomness is made in Python and
  handed over as constraints to satisfy: one of eighteen settings, twenty-eight
  deliberately mundane trades, an age band, a temperament, a speech register, a habit,
  something they want, something they are hiding, and one of twenty-four naming
  traditions. The two dozen names a model reaches for unprompted are forbidden
  explicitly, because that failure is stubborn enough to deserve its own rule.
  Guidance outranks the dice: only the dimensions a user's line tends to leave silent
  are seeded, and the contract tells the model to discard any seed value that argues
  with the guidance rather than blend it — otherwise asking for a village blacksmith and
  being handed one aboard a generation ship is a coin flip away. The scene and the
  existing cast travel too, so an invented character fits the story already in play.
  An invented card becomes a *new* roster entry rather than overwriting whoever was
  being edited, its name is kept clear of the existing cast (not cosmetic: a Character
  Study is keyed by name, so a clash would silently share a sheet), a long answer is cut
  at a sentence rather than mid-word, and a prose answer gets one retry before the
  failure is reported. The generation runs off `llm_task`, so asking for a character
  never cancels a reply that is still streaming.
- **Character Study** — the cast now has a sheet the story writes about them, and it
  grows as they are played. Every other ledger here tracks the *world*: canon what is
  true, Sightlines who may know it, Threads what is still open. None tracked the
  *people*, which is why the strongest line in the reply prompt was also the emptiest
  one — "stay consistent with the character's established personality, voice, and
  motives" is an instruction with nothing behind it, because the card is a paragraph
  written once, before the character had said anything. So one model writes everyone
  and quietly sands the cast down to its own narrator voice: twenty turns in, the terse
  ex-soldier and the arch academic produce the same three-clause sentences, and nothing
  flags it because nothing was contradicted. The cast has simply merged.
  A new module (`src/personaparlour/character_study.py`) keeps, per character, a short
  ledger of specific evidence-backed observations across six facets — **voice** (how
  they speak), **line** (a sentence they actually said, kept verbatim as an anchor),
  **manner** (what they do), **bond** (where they stand with one other participant),
  **want**, and **mark** (what the story changed in them). The speaker's own sheet is
  rendered for them after the history, where recency makes a local model honour it, and
  in a group scene it also renders **one contrast line per other cast member** — a voice
  exists only differentially, so telling the model what the *others* sound like is what
  stops the merge, where describing one character alone never has.
  The authored card is never touched. `description` and `personality` belong to the
  author; the study is a separate layer, every line attributed, and a pin freezes a line
  exactly as it does in the canon. Confidence does the rest: an observation seen once is
  **provisional** and reaches no prompt at all, and only firms up when a *later* pass over
  *later* turns sees it again. That is the guard against the failure mode this kind of
  feature ships with by default — the sheet is learned from the model's own output and
  fed back to it, so a tic observed once would otherwise become a tic performed always.
  Re-reading the same turns can never firm anything up, one pass can only confirm a line
  once however often the model repeats itself, every observation must quote the words
  behind it, and a line nobody has seen for eighty turns fades back out so the sheet stays
  a current portrait rather than an accumulating pile.
  Optionally, one pass per reply checks it against the established sheet and flags a reply
  that is not this character — with the same three ways out the other guards offer: write
  it again (a one-shot correction naming what went wrong), *this is who they are now*
  (which revises the line and records what it used to say), or leave it. A violation is
  either a mistake or a development, and only the reader can say which, so the adherence
  check and the evolution engine are deliberately the same machinery pointed two ways.
  The card grows a **Sheet** tab — every observation with where it stands, how often it has
  been seen, the moments that taught it, and pin/edit/delete — and a **How they got here**
  tab: an arc showing when each line appeared, firmed up, or changed, with the old wording
  struck through. Add an observation by hand (established at once, never auto-revised),
  lock a portrait you consider finished (it keeps shaping replies; the story stops adding
  to it), catch up on unread turns, or read a whole existing story to build the sheet two
  hundred turns in. Renaming a character carries their whole sheet with them.
  Writing the cast from their sheets is **on by default and costs nothing** — it is pure
  prompt assembly, and an empty study produces a byte-identical prompt to before. Learning
  is **batched every six turns** rather than run per reply, because characters do not change
  every turn; only the per-reply adherence check spends a generation, and that half is
  opt-in and skipped entirely for a speaker with no sheet yet. Verified against
  `glm-5.2:cloud` and a local 4B: both learn and inject well, though the drift check
  wants the stronger model — another reason it is the opt-in half. Sheets travel with
  saved stories and reconnects.
- **Sightlines** — the story now knows who knows what. Story Memory, the Continuity
  Guard, and Story Threads are all global: each assembles one block and sends it
  unchanged to whoever is speaking, which quietly makes every cast member omniscient.
  A new ledger (`src/personaparlour/sightlines.py`) gives each piece of knowledge an
  *audience*, and `build_llm_messages` is now speaker-aware. Someone in the audience
  is told the entry in full, plus who else shares it and who does not, so they can act
  on a secret or guard it. Anyone outside it is shown a **spoiler-free `topic`** and
  never the `text` — a model cannot be told "you do not know X" by being told X, which
  is the whole mechanism. The block rides after the history, so the instruction saying
  which of the surrounding context is theirs is the more recent of the two.
  Optionally, one background pass then reads each reply for two things: a *leak* (the
  speaker acted on something they were never told) and a *transfer* (someone was told,
  or overheard, something new). Both must quote the passage verbatim to be believed,
  and a leak is only ever reported — against the message that caused it, while it is
  still the last thing said — with the same three ways out the Continuity Guard offers:
  write it again (a one-shot correction that names the topic, never the secret), decide
  they know it now, or leave it. A transfer the passage plainly shows *is* applied,
  because that is the story saying so rather than a judgement call.
  A who-knows-what workspace opens from the Story menu: record a secret by hand, toggle
  each participant in or out of its audience, search, pin, or read an existing story to
  map what has already been withheld. You can be kept out of an entry too — it stays
  covered behind a reveal, so your own roleplay can still surprise you. Holding
  characters to what they know is on by default and costs nothing: an empty ledger, or
  one where everyone knows everything, produces no block and a prompt identical to
  before. Only the watching half spends a generation, and it is opt-in and skipped
  entirely when nothing is being withheld. A user-authored audience is never narrowed
  to the current cast, so a character who steps out of a scene does not forget what
  they were told; only the model is held to the participant list, so it can never
  invent a knower. The ledger travels with saved stories and reconnects.

### Changed
- **Prompts** — the roleplay contract now tells the character to write only from what
  they could plausibly know, and to play the gap honestly rather than quietly using
  information they were never given in the story. The final reply check adds a
  knowledge line when something is being withheld, where recency matters most.
  Story Memory now records who was present and who learned (or was kept from learning)
  each development, so a later scene knows not only what is true but who has been told.
  Auto-cast speaker selection was rewritten as ordered rules — someone addressed by
  name answers, otherwise whoever has the strongest stake, otherwise whoever has been
  quiet — and it now receives the user's name, which the frontend had always sent and
  the prompt had always discarded.

- **Story threads** — an evidence-backed dramatic ledger now follows the promises,
  mysteries, goals, threats, secrets, and relationship tensions that remain in play.
  It is deliberately separate from canon: threads are possibilities rather than facts,
  only a small prioritized set reaches reply generation, and the prompt forbids forced
  payoffs or taking agency from the user. The tracker updates after completed replies,
  can catch up on uncovered turns or rebuild from the full transcript, and fails closed
  when a model cannot support a change with words from the new passage. A searchable
  Story Threads workspace supports manual additions, editing, pinning, active/resolved/
  dropped states, archive cleanup, and on/off or automatic-update controls. Stable IDs,
  pins, status, and the coverage cursor travel with saved sessions and reconnects.
- **Story navigator** — long transcripts now have their own searchable index. Open it
  from the story toolbar or with `Ctrl/Cmd+F`, search visible dialogue and narration,
  filter by speaker type, and jump to any result with keyboard navigation. Any user,
  character, or narrator message can be bookmarked from the transcript or the index;
  bookmarks persist in browser history and saved sessions, remain visible in the
  navigator, and are marked in Markdown exports.
- **Continuity guard** — the story keeps a canon, and every reply is held to it. A
  ledger of durable facts (`src/personaparlour/continuity.py`) — eye colour, who holds the
  key, who is dead, what was promised — is injected into every turn so contradictions
  mostly never get written; each new reply is then read back against it in the
  background, and a hard conflict is reported against the message that caused it, while
  it is still the last thing said. Nothing is rewritten on its own: you choose between
  writing the reply again (the correction steers one retry, the old take is kept as a
  swipe), accepting the new version as canon, or leaving it. The ledger is model-written
  and user-editable — pin a fact and it always reaches the model and is never revised
  away — and it can be rebuilt from a whole transcript, so the guard can be adopted
  forty turns into a story. Off by default, since checking costs one extra generation
  per reply; the ledger travels with a saved story. Auxiliary passes now ask the model
  not to deliberate (`stream_chat(..., think=False)`) — a reasoning model spent minutes
  on a question worth a few tokens.
- **Idle presence** — the character can speak first. When the room goes quiet, they may
  take a turn of their own: a small piece of business, something noticed in the scene, a
  thought said aloud, or a question back to you. A Presence dial in the Director bar
  (off / rarely / often, plus the length of quiet to wait out) controls it, and it is off
  by default. The browser holds the clock — it can see typing, the mic, an open modal, and
  whether the window is even in front of you — while the backend decides whether the ask is
  granted, counting beats so a silence never becomes a monologue. Unprompted turns are
  marked "spoke first" in the transcript, the beat varies rather than repeating itself, and
  the setting travels with a saved story.
- **Story memory** — a rolling, model-written record of everything that scrolls out of the
  context window. Older turns are folded into a "story so far" block (`src/personaparlour/memory.py`)
  and replaced in the prompt, while recent exchanges still go out verbatim, so a long
  roleplay keeps its continuity without resending the whole transcript. Runs itself in the
  background after a reply, or on demand; the record is readable and editable from a new
  Story memory modal, travels with saved stories, and survives a reconnect. Off-switch and
  window/threshold dials included; a conversation with no memory yet is prompted exactly
  as before.
- **Story library** — save whole sessions (chat, cast, lorebook, settings) server-side under
  `user_data/sessions` and reopen them later from a new "Story library" modal
  (`GET/POST/DELETE /api/sessions`). File-based save/load still works.
- **Auto-cast** — in group scenes, a new "Auto" toggle lets the model direct turn-taking:
  the backend (`choose_speaker`) picks which character naturally answers each message.
- **Living stage** — the conversation backdrop now renders the scene: rain, storm with
  lightning, snow, fog, wind, stars at night, and fireflies at dusk (canvas particles,
  reduced-motion aware, toggleable from the Scene bar).
- **Scene ambience** — synthesized soundscapes (rain, thunder rolls, wind, snow hush,
  night crickets) generated locally with WebAudio; volume slider in the Scene bar.
- **Export as story** — download the conversation as a formatted Markdown story.
- **Generation stats** — each reply shows generation time and tokens/second, reported by
  the backend in `assistant_end`.

### Changed
- **Cleaner action navigation** — the story header now groups related controls into
  Story, View, Voice, and More menus; message editing actions live behind one
  consistent overflow menu; writing assists share a Writing help menu; and the cast
  chip wall is now a compact speaker selector. Menus support Escape, arrow keys,
  outside-click dismissal, focus return, narrow layouts, and touch-sized message
  controls while frequent actions such as search, bookmarking, narration, and Send
  remain directly available.
- **Complete UI redesign** ("ink & limelight"): dark-first theme with an amber accent,
  bundled fonts (IBM Plex Sans for UI, Literata for story prose, Plex Mono for data),
  a consistent SVG icon set replacing emoji buttons, quiet hover-revealed message
  actions, a framed composer console, slimmer bars, and restyled modals/panels.
  Global design tokens live in `frontend/src/theme.ts` + `frontend/src/styles.css`.
- Right-side status panels are now fully theme-aware (previously hardcoded light styles).

### Fixed
- Switching the TTS engine no longer resets the roleplay system prompt mid-conversation.
- "Wipe everything" now also clears the server-side session library.

## [0.1.0] - 2026-01-01

### Added
- Initial public release
- Voice input using Whisper STT (faster-whisper)
- Voice output with multiple TTS engines:
  - Piper TTS (default, lightweight)
  - Chatterbox TTS (expressive)
  - Soprano TTS (fast)
- Image understanding with Qwen3VL vision-language models
- Image generation with Stable Diffusion
  - Support for diffusion models (SD1.5, SDXL, etc.)
  - Support for Qwen Image Edit models in progress (should work via comfyui eitherway for now)
  - LoRA support for custom styles
- LLM integration via Ollama (local and cloud)
- FastAPI backend with WebSocket support
- React + TypeScript frontend with Vite
- Real-time bidirectional communication (latency depends on user hardware)
- Automatic model downloading from HuggingFace
- Character profile system (basic) -> baby infront of SillyTavern
- Conversation context management -> Not embedding or vector, just dumping all messages for now.

### Documentation
- Comprehensive README.md with full feature overview
- QUICK_SETUP.md for fast installation
- MODEL_DOWNLOAD_GUIDE.md with detailed model information
- BUILD_INSTRUCTIONS.md for development setup
- CONTRIBUTING.md with contribution guidelines
- PRE_PUBLICATION_CHECKLIST.md for maintainers

### Configuration
- Flexible LLM configuration (Ollama local/cloud)
- Whisper model selection (tiny to large-v3)
- Multiple TTS engine options
- Image generation customization
- Image explainer customization
- WebSocket tuning parameters

### Known Issues
- First run requires large model downloads (10-40GB), if one wishes to truely run everythin locally
- High VRAM requirements for full features (12GB recommended: I can run comfortably everything in decent speed with my Nvidia 5070Ti 12GB)
- Piper TTS voices require manual download of voices
- Some models may not work on older GPUs
- Limited browser compatibility (modern browsers only)
- UI is not the best in the world.

### Future Plans
- 3D/Live2D avatar integration (think controlNet, image ot 3D Ai models, etc) : rquires significant effeort to do a POC. Feel free to take it up if it interests you
- More LLM providers (OpenAI, Anthropic, etc.)
- More TTS providers with voice cloning
- ComfyUI integration for image generation
- Video input processing
- Video generation capabilities
- Advanced character profiles
- Conversation history export/import
- Plugin system for custom engines
- Mobile app support
- Multi-user support
- Cloud deployment options

---

## Version History

- **0.1.0** (2026-01-01) - Initial public release

---

## How to Use This Changelog

### For Users
Check this file to see what's new, changed, or fixed in each version.

### For Contributors
When submitting a PR, add your changes to the [Unreleased] section under the appropriate category:
- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

### Categories

- **Added**: New features, functionality, or documentation
- **Changed**: Changes to existing features or behavior
- **Deprecated**: Features marked for removal in future versions
- **Removed**: Removed features or functionality
- **Fixed**: Bug fixes
- **Security**: Security-related fixes or improvements

### Version Numbers

This project uses [Semantic Versioning](https://semver.org/):
- **MAJOR** version (X.0.0) - Incompatible API changes
- **MINOR** version (0.X.0) - New functionality (backwards-compatible)
- **PATCH** version (0.0.X) - Backwards-compatible bug fixes
