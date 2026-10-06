# Contributing to TKeeper

Keep changes focused and explain their effect on behavior, compatibility, and security.

## Where to post what

- **Security issues:** do **NOT** open a public issue or discussion. See [SECURITY](SECURITY.md) and email us at `security@tkeeper.org`.
- **Questions / support:** use **GitHub Discussions** (Q&A).
- **Bugs / actionable work:** use **GitHub Issues** (only after you can describe a reproducible problem).
- **Design proposals / larger changes:** start in **Discussions** first (Ideas), then open an issue/PR.

## Reporting a bug (Issues)

Before opening an issue:

- Search existing issues/discussions.
- Test on the latest release (or `main` if you can).

Include:

- Expected vs actual behavior
- TKeeper version / commit SHA
- Minimal reproduction steps
- Logs/stack traces
- Environment (OS, JDK)

If you can provide a minimal failing test, even better.

## Feature requests (Discussions → Issues)

Start in Discussions with:

- The real problem you're solving
- Proposed API/behavior
- Compatibility notes (breaking vs non-breaking)
- Any relevant standards/papers/RFCs

If the direction is agreed, convert it to an issue.

## Testing expectations

- If your change affects behavior, **add or update an integration test**. See [integration tests](integration-tests).
- If you're not sure whether something is behavioral, assume it is and add the test.

## Code style

- Prefer small PRs with one clear purpose.
- Add tests for behavior changes when practical.
- Don’t mix large refactors with bug fixes. Keep fixes small and reviewable.
- Keep public API changes explicit.

## Documentation

- Keep the existing section layout and write for the task the reader is completing.
- Explain behavior, required inputs, results, and relevant limits. Include a detail only if it helps the reader act, verify a result, or make a decision.
- Name dependencies or internal classes only when the reader needs them to build, configure, troubleshoot, or assess a specific security assumption.
- Use direct sentences and concrete examples. Remove promotional claims, slogans, rhetorical contrasts, generic introductions, and repeated summaries.
- Use lists for steps or parallel items and tables for comparisons; use prose for connected explanations. Avoid mechanical bold labels and unnecessary emphasis.
- Document stable behavior. Avoid vague status words and predictions; include versions when compatibility depends on them.
- Check claims against code and the API contract. Preserve security assumptions and residual risks, and verify examples, relative links, and heading anchors after editing.

## Commit messages

Use short, clear commit messages that describe the change. Prefixes such as `feat:`, `fix:`, or `chore:` are not required.

Good examples:

- `Fix Java SDK signature validation`
- `Add integration test for expired keys`
- `Update dependency versions`
- `Document key rotation behavior`

Keep each commit focused on one logical change.

## Pull requests

A PR should include:

- What changed (short summary)
- Why it changed (rationale)
- Tests added/updated (or why not)
- Notes on compatibility and security impact (if applicable)

## License

By contributing, you agree that your contributions will be licensed under the project [Apache 2.0](LICENSE.md) license.
