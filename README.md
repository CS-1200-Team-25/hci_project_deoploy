# Planning study prototype

Static React + TypeScript frontend scaffold built with Vite. `ARCHITECTURE.md`
defines the intended study architecture; this scaffold implements only its shared
screen layout and TypeScript contracts.

## Development

Use Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

```sh
npm run typecheck
npm run build
npm run preview
```

The screen contains a placeholder workspace, a persistent assistant panel, an
inactive elapsed-time display, and a disabled completion button. It has no task
state, navigation, surveys, timers, assignment logic, interventions, logging,
persistence, or API calls. No backend is needed for this static scaffold.

## Layout

- `src/app/experiment/`: Vite-rendered experiment entry (no framework routing).
- `src/components/experiment/`: shared static screen and future controller seam.
- `src/components/agent/`: assistant UI and future intervention-card seam.
- `src/components/tasks/`: reserved task workspace modules.
- `src/types/`: architecture contracts only.
- `src/experiment/`, `src/tasks/`, `src/agent/`: empty module placeholders for
  future study logic. No policies, sequences, or stub behavior are implemented.

No behavioral tests are included because application behavior is not implemented.
Typechecking and the production build verify the scaffold.
