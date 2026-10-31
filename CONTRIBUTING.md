# Contributing to Melodify

Thank you for your interest in contributing!

## How to contribute

1. Fork the repository and clone it locally.
2. Create a new branch for your feature or fix:
    ```bash
    git checkout -b feature/your-feature-name
    ```
3. Install dependencies with `npm ci`.
4. Make your changes, following the existing code style.
5. Run the checks relevant to your change:
    ```bash
    npx tsc --noEmit
    npm run lint
    npm run validate-translations
    npm run test:config   # plus the other test:* suites that cover your change
    ```
    There is no aggregate `npm test` script and no `npm run build` script. Focused suites are defined in `package.json`: `test:kick`, `test:spotify`, `test:config`, `test:ui-states`, `test:twitch`, `test:permissions`, `test:logging`, `test:i18n`, `test:security`, `test:routing`.
    Full-repo lint still reports pre-existing `@/` path-alias resolution errors; treat lint on changed files as the practical gate and do not introduce new warnings.
6. Commit and push your branch.
7. Open a pull request with a clear description of your changes.

## Code style

- Use Prettier and ESLint (see `.prettierrc` and `.eslintrc.json`).
- Use TypeScript types; avoid `any` where practical.
- Write clear, descriptive commit messages.
- Do not include credentials, tokens, or personal data in commits, tests or screenshots.

## Issues

- Use GitHub Issues for bugs, features and questions.
- Search existing issues before opening a new one.

## Code of Conduct

Be respectful and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
