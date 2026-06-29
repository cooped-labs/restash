# Contributing to Restash

Thanks for your interest in improving Restash!

## Contributor License Agreement (required)

Restash is dual-licensed (AGPL-3.0 + commercial). To keep that model possible, every
contributor must agree to the **[Contributor License Agreement](CLA.md)** before their
contribution can be merged. The CLA confirms you have the right to contribute your code
and grants Progress with Puello LLC the rights needed to license the project (including
commercially).

How to accept: open your first PR and add a comment stating:

> I have read and agree to the Restash CLA.

(We will move to an automated CLA check, e.g. CLA Assistant, as the project grows.)

## Development

```bash
npm install
npm start        # dev build (Electron)
npm run dist     # build Restash.app + DMG (macOS / Apple Silicon)
```

- macOS only for now (Apple Silicon).
- Keep PRs focused; run `npm run lint` and `npm run typecheck` before pushing.
- By submitting a PR you also certify the [Developer Certificate of Origin](https://developercertificate.org/).
