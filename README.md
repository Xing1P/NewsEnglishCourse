# News English Course

News English Course is a desktop app that turns real news articles into Khmer-supported English lessons. It is built for Khmer-speaking learners and teachers who want practical English study material from current, authentic text instead of generic textbook examples.

The app lets you paste an article or enter a news URL, choose a CEFR level, and generate a structured course with translations, grammar support, vocabulary, exercises, and review tools. Course data stays on your computer in a local SQLite database.

## Purpose

Many English learners understand classroom examples but struggle with real news writing: long sentences, journalistic grammar, tense shifts, idioms, collocations, and unfamiliar vocabulary. Khmer-speaking learners also need explanations that connect English structure to Khmer meaning.

News English Course solves this by converting a news article into a guided English lesson. Each generated course helps learners read the article, understand difficult sentences, study useful vocabulary, practice with exercises, and review bookmarked words over time.

## Main Features

- Generate lessons from pasted article text or supported news URLs.
- Choose a learner level: `A2-B1`, `B1-B2`, or `B2-C1`.
- Crawl article content with a Fresh News Asia crawler plus a generic article extractor.
- Create course summaries, simplified summaries, key ideas, grammar focus, tense overview, discussion questions, and writing prompts.
- Break articles into sentence-level study cards with Khmer translation, Khmer grammar explanation, tense analysis, simplified English, IPA pronunciation, register, collocations, idioms, phrasal verbs, verb forms, and Khmer-speaker pitfall notes.
- Extract useful vocabulary with Khmer meaning, part of speech, simple English definition, examples, IPA, CEFR level, frequency, synonyms, antonyms, and collocations.
- Bookmark vocabulary and review due cards with spaced repetition grades: `again`, `hard`, `good`, and `easy`.
- Regenerate extra exercises by type, including quiz, cloze, matching, true/false, reorder, and translation tasks.
- Ask follow-up grammar questions about a sentence.
- Export a course to Markdown or export vocabulary cards to Anki-compatible TSV.
- Use light or dark mode.
- Store courses, vocabulary, reviews, and progress locally with SQLite.

## How It Works

1. Paste a full news article or enter an article URL.
2. Select the target CEFR level.
3. The app checks that Gemini CLI is available.
4. If you entered a URL, the app extracts the article text.
5. Gemini CLI generates course metadata, sentence enrichments, vocabulary, and exercises.
6. The app saves the generated course to the local library.
7. Learners can open the course, study sentences, bookmark words, review due vocabulary, and export materials.

## Requirements

- Node.js and npm.
- Gemini CLI installed and authenticated.
- Windows is the primary packaging target in the current scripts.

To check Gemini CLI inside the app, open **Settings** and use **Check**. Generation is disabled when Gemini CLI is not available.

## Development Setup

Install dependencies:

```bash
npm install
```

Start the Electron development app:

```bash
npm run dev
```

Run type-checking and build the app:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Create an unpacked Windows build:

```bash
npm run pack:win
```

Create a packaged Windows build:

```bash
npm run build:win
```

## Data Storage

The app stores data locally in an Electron user-data SQLite database named `news-english-course.db`. It uses `better-sqlite3` with migrations for courses, sentences, vocabulary, exercises, and spaced repetition review state.

No generated course library data is sent to a custom server by this app. Course generation is performed through the locally installed Gemini CLI.

## Architecture

- **Electron main process** handles the SQLite database, migrations, repositories, article crawling, Gemini CLI calls, exports, spaced repetition logic, and IPC handlers.
- **Preload layer** exposes a typed `window.newsEnglish` API to the renderer through Electron IPC.
- **React renderer** provides the course generator, course library, course detail view, vocabulary bookmarks, spaced repetition review, settings, dark mode, and export actions.
- **Shared schemas** use Zod to define and validate course, sentence, vocabulary, exercise, Gemini status, review, and IPC data contracts.

## Project Structure

```text
src/
  main/        Electron main process, database, repositories, crawlers, Gemini integration, exports
  preload/     Secure bridge that exposes the app API to the renderer
  renderer/    React UI and styles
  shared/      Shared TypeScript types, Zod schemas, and IPC API types
scripts/       Development helper scripts
build/         App assets used by packaging
```

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Electron Vite development app. |
| `npm run build` | Type-check and build the app. |
| `npm run preview` | Preview the built Electron app. |
| `npm test` | Rebuild native dependencies, run Vitest, then rebuild Electron dependencies. |
| `npm run pack:win` | Build an unpacked Windows app directory. |
| `npm run build:win` | Build a packaged Windows app. |
| `npm run rebuild:node` | Rebuild `better-sqlite3` for the Node.js test runtime. |
| `npm run rebuild:electron` | Rebuild native dependencies for Electron. |

## Testing

The project uses Vitest for main-process utilities, repository behavior, crawler extraction, export formatting, Gemini parsing helpers, spaced repetition logic, and renderer tests.

Run the full test suite with:

```bash
npm test
```

## Notes For Contributors

- Keep generated lessons validated through the shared Zod schemas.
- Keep app data local unless a future feature explicitly documents otherwise.
- When adding new generated fields, update the schema, repository persistence, export output, and UI together.
- When adding a new crawler, implement it as a site crawler and keep the generic crawler as fallback.
