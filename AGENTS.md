# Repository Guidelines

## Project Structure & Module Organization

Sand Bucket is a TypeScript/PixiJS browser game and offline PWA, built with Vite and hosted on GitHub Pages.

- `src/game.ts` owns simulation and rules; `renderer.ts`, `belt-view.ts`, and `field-view.ts` render gameplay.
- `src/generator.ts`, `level-mechanics.ts`, and `scripts/campaign/` prepare and certify levels offline. `src/campaign.ts` loads the ready `src/levels/campaign.json`; the browser does not generate levels.
- `src/progress.ts` persists local progress; `art-catalog.ts` and `art-scenes.ts` define artwork.
- `tests/` contains Vitest tests; `public/` contains icons and the PWA manifest; `scripts/` contains generation and build checks.
- Root preview pages such as `interface.html` and `review.html` support visual development. `dist/` is generated output.

## Build, Test, and Development Commands

Use Node.js 22.12 or newer; CI uses Node.js 24.

- `npm ci`: install locked dependencies.
- `npm run dev`: start the Vite development server.
- `npm test`: run the default Vitest suite.
- `npm run check`: type-check and run default tests.
- `npm run build`: type-check, build production assets, and verify offline assets.
- `npm run preview`: serve the production build locally.
- `npm run test:full`: manually run the extensive generator sweep.
- `npm run campaign:pilot`: prepare 20 representative campaign positions.
- `npm run campaign:generate`: prepare all 400 levels, resume from cache, and atomically publish a complete catalog.
- `npm run campaign:verify`: replay all catalog proofs from the preparation cache.
- `npm run generate:level`: regenerate legacy fallback fixtures used by regression tests.

## Coding Style & Naming Conventions

Follow surrounding code: two-space indentation, single quotes, semicolons, and strict TypeScript. Use kebab-case filenames, PascalCase types/classes, camelCase functions/variables, and UPPER_SNAKE_CASE constants. No formatter or linter is configured. Reuse existing simulation and rendering helpers; avoid unrelated formatting changes.

## Testing Guidelines

Place behavior-focused tests in `tests/*.test.ts`. No numerical coverage threshold is configured. Cover changed mechanics, physics, generation, and persistence. Preserve deterministic generation and solvability at both belt speeds. Run `npm run check` and `npm run build` before submitting code changes; keep the full sweep manual. After a failed command, ensure its process has exited before retrying.

## Commit & Pull Request Guidelines

Fetch current `origin/main` before starting work and preserve existing local changes. Prefer `feat/<description>` branches and concise, imperative commit subjects; history does not enforce Conventional Commits.

Describe the behavior changed, validation performed, and relevant issues. Include screenshots for visible UI changes. Obtain explicit user approval before merging. Pushes to `main` deploy through `.github/workflows/pages.yml`; preserve the `/sand-bucket/` base path and offline support.
