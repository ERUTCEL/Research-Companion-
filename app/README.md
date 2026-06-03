# Research Companion App

Research Companion is a local-first research decision app for students and
researchers. It is not meant to be only a paper search box. The app uses a
personal library of papers and notes to help users decide what to pursue,
refine, park, or kill.

## Product Focus

The app should help answer questions like:

- What is the real contribution gap across these papers and my notes?
- Is this project thesis-sized, paper-sized, or only a class exercise?
- Which assumption is most likely to make the project fail?
- What should I test in the next 1-2 weeks before investing more time?
- If the idea is weak, what can be salvaged or pivoted?

## Differentiators

| Capability | Product behavior |
|------------|------------------|
| Evidence-to-contribution mapping | Separates source evidence from the user's possible contribution. |
| Decision-first answers | Starts with a bottom line instead of a long source dump. |
| Research risk detection | Calls out novelty, feasibility, and evaluation risks directly. |
| One-week validation plans | Ends serious recommendations with a concrete next test. |
| Local-first library | Keeps the user's papers and notes close to the app experience. |

## Distribution Model

This Electron app is the main path for non-technical students and researchers.
Plugin-style integrations can still serve power users, but the product should
also support document-centered workflows:

1. Desktop app for local paper and note libraries.
2. Web app for easier onboarding and sharing.
3. Zotero, Google Drive, Notion, or Google Docs integrations for existing
   research workflows.

Across every surface, the core workflow should stay the same:

```text
evidence -> gap -> contribution -> risk -> decision -> validation plan
```

## Development

```bash
npm install
npm run dev
```
