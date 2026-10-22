# Contributing to MCP BORME

Thank you for your interest in contributing to MCP BORME!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`

The test suite runs entirely against `src/__tests__/mock-client.ts` and a stubbed
global `fetch` — no OpenMercantil account, API key or network access is required to develop
or test this project.

## Code Style

This project uses ESLint and Prettier for code formatting. Before committing:

```bash
npm run lint        # Check for linting errors
npm run lint:fix    # Fix linting errors
npm run format      # Format code with Prettier
```

Pre-commit hooks will automatically run linting on staged files.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation.

Format: `<type>(<scope>): <description>`

Types:
- `feat`: New feature (triggers minor version bump)
- `fix`: Bug fix (triggers patch version bump)
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(companies): add officers tool
fix(daily): match provinces regardless of accents
docs: update sandbox setup instructions
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Ensure linting passes: `npm run lint`
5. Commit using conventional commits
6. Push and create a pull request

## Testing

Run tests with:

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

`src/__tests__/tools.test.ts` checks that every tool calls the right endpoint with the right
parameters against `mock-client.ts`; `openmercantil-client.test.ts` and `tools-http.test.ts`
exercise the real HTTP client with a stubbed global `fetch`; `shape.test.ts` covers response
trimming and `validation.test.ts` the input bounds. Tests never need an API key.

## Working against the real OpenMercantil API

This repository does not include API credentials or recorded responses. The anonymous tier
allows 200 requests per day per IP, so keep live checks small:

```bash
npm run build
node scripts/smoke.mjs        # about 10 requests
```

Pass a key inline (`OPENMERCANTIL_API_KEY=... node ...`), never write it to a file. See
`docs/api-notes.md` for the observed behaviour of each endpoint.

## Questions?

Feel free to open an issue for any questions or concerns.
