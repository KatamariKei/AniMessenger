# Security policy

AniMessenger is currently pre-release software. Security fixes are accepted for the latest development version.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Once the public repository is available, use GitHub's private vulnerability reporting or security-advisory feature for the repository. Include a concise description, affected version, reproduction steps, and impact without attaching unrelated private data.

Until a private reporting channel is published, keep the details private and open a minimal public issue asking the maintainers to enable a confidential contact path. Do not include exploit instructions, private conversations, local configuration, logs, tokens, or machine paths in that issue.

## Important deployment boundary

AniMessenger's LAN mode is intended for a trusted private network. It does not currently provide user authentication or authorization and must not be exposed directly to the public internet. Ollama and ComfyUI should remain bound to the local computer unless the user has independently secured them.
