# Contributing to AniMessenger

AniMessenger is an early local-first project. Bug reports, focused fixes, documentation improvements, and accessibility feedback are welcome.

## Before opening an issue

- Check that the problem still occurs with the latest code.
- Do not attach private conversations, character profiles, generated images, configuration files, logs, or machine paths without carefully removing personal information.
- For setup problems, include the relevant software versions and exact error text. Redact usernames, tokens, and local paths.
- For character-quality feedback, describe the general behavior and model used. A short sanitized example is usually enough.

Security problems should not be filed as public issues. Follow [SECURITY.md](SECURITY.md) instead.

## Pull requests

Keep changes focused and explain what they change from a user's perspective. Before submitting, run:

    pnpm check
    pnpm release:audit

Pull requests must not include files from `data/`, `logs/`, `outputs/`, `work/`, `backups/`, `.codex/`, `.agents/`, or a local `animessenger.config.json`.

By contributing, you agree that your contribution may be distributed under the project's [MIT License](LICENSE).

## Character and model changes

Avoid fixes that narrowly script one conversation or one local model at the expense of other characters and models. Prefer durable profile structure, clear context, and broadly useful dialogue guidance. Do not add copyrighted datasets, model weights, generated conversations, or third-party assets unless their redistribution terms clearly allow it.
