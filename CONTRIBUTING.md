# Contributing

Thanks for your interest in improving News English Course. This project is a desktop app for generating Khmer-supported English lessons from news articles, so contributions should keep learner clarity, local data ownership, and reliable generation in mind.

## Ways To Help

- Report bugs with clear reproduction steps.
- Suggest features that improve English learning, Khmer support, article extraction, exports, or review workflows.
- Improve tests, documentation, accessibility, and packaging reliability.
- Add or improve article crawlers while keeping the generic crawler as a fallback.

## Development Setup

Install dependencies:

```bash
npm install
```

Start the app in development:

```bash
npm run dev
```

Run the build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Contribution Guidelines

- Keep changes focused and explain the user-facing reason for them.
- Update shared Zod schemas, persistence, exports, and UI together when adding generated course fields.
- Add or update tests for behavior changes.
- Avoid committing generated outputs from `dist`, `out`, coverage, local databases, logs, or dependency folders.
- Do not include secrets, API keys, private article data, or generated learner data in issues or pull requests.

## Pull Requests

Before opening a pull request:

- Run the relevant tests or explain why they were not run.
- Confirm `npm run build` passes for code changes.
- Update documentation when commands, setup, or workflows change.
- Link related issues when applicable.
