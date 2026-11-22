# Working agreement

## Every change ships with a changelog entry and a push

When you change anything in this repository:

1. Add the change to `CHANGELOG.md` under a version heading (`## X.Y.Z - YYYY-MM-DD`).
   Raise the version in `package.json` and `api-server/package.json` when the
   change is user-visible; `BOT_VERSION` reads from `package.json`.
2. Commit the changelog together with the code, never on its own.
3. Push to `origin` (`https://github.com/ov010/SergeantGuruV2.git`) and confirm
   the working tree is clean and in sync (`git status` shows no unpushed work).

Do not leave local-only commits behind. If the push fails, say so explicitly
and explain what is blocking it.

## Things that must never be committed

- `.env` holds live Discord and Roblox credentials. It is gitignored; keep it
  that way and never echo its contents into logs, commits, or chat.
- `node_modules/`, `api-server/dist/`, and runtime `data/` files.

## This project runs from an exFAT USB drive on Linux

exFAT cannot store symlinks, which shapes several settings:

- `pnpm-workspace.yaml` sets `nodeLinker: hoisted` and
  `verifyDepsBeforeRun: false`. Do not revert these.
- `pnpm install` ends with `ERR_PNPM_CMD_SHIM_SYMLINK_BIN` even though the
  packages installed correctly; only the `.bin` shims fail.
- Local shims may be needed after a clean install:

  ```bash
  printf '#!/bin/sh\nexec node "$(dirname "$0")/../typescript/bin/tsc" "$@"\n' > node_modules/.bin/tsc
  printf '#!/bin/sh\nexec node "$(dirname "$0")/../esbuild/bin/esbuild" "$@"\n' > node_modules/.bin/esbuild
  chmod +x node_modules/.bin/tsc node_modules/.bin/esbuild
  ```

- Run the bot with `bash "Start SergeantGuruV2.sh"`; `./` is unreliable here.

## Quality gate before committing

```bash
cd api-server
node ../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   # typecheck
node build.mjs                                                     # bundle
node --test bot/bot.test.mjs                                      # tests
```

All tests must pass. The AI path (Alt Risk) must be checked against the live
local Ollama when it changes.

## Local AI model

`OLLAMA_MODEL` defaults to `qwen2.5:1.5b`. Use a non-thinking instruct model:
reasoning models such as `qwen3:4b` consume the entire response budget on
reasoning and return no usable JSON. The AI feature is optional; without Ollama
the bot falls back to the rule-based Alt Risk score.
