# dsh-memory

![npm](https://img.shields.io/npm/v/@fooxe/dsh-memory) ![license](https://img.shields.io/badge/license-MIT-blue) ![node](https://img.shields.io/badge/node-%3E%3D22.19-green)

**English** | [**中文**](docs/README.zh.md)

**Persistent memory for DeepSeek Harness — the Claude Code memory model: your agents remember across sessions, wake up with context, and never mix projects. Pure files, zero dependencies.**

## What it does

> Your DSH agent meets you for the "first time" — **every single session**.
> With dsh-memory, it remembers.

```text
Session 1   You: "Remember — this project uses pnpm, not npm."
            Agent: saved via memory_save

Session 2   You: "Which package manager do we use?"
            Agent: "pnpm — you told me yesterday."   <- no re-asking, ever
```

No server, no account, no embedding provider. Just plain markdown files — delete the directory and that scope forgets everything.

## Highlights

### 🖥️ A visual memory manager, not a markdown dump

**Settings → Memory** opens a full manager: every memory from both scopes in one searchable list, workspaces as an expandable tree (nested sub-project scopes discovered automatically), sub-folder grouping, and live guard gauges (index lines / KB / file count). Add, rewrite, tag, or delete any memory **right in the panel** — through the exact same guarded pipeline as the agent's own tool calls, so what you fix in the UI is precisely what the model sees next session.

### 👆 Touch activation — CLAUDE.md semantics (v0.13)

Project memories carry sub-directory tags. A tag injects when the session's working directory sits inside it — **or the moment the session touches it**: one `read`/`edit`/`write`/`grep`/`glob`/`bash`/`pwsh` call into `frontend/src` activates `[frontend]` and `[frontend/src]` for the rest of the session. Activation is monotone and survives session resume — exactly like nested CLAUDE.md files, triggered by what you actually do, not just where you `cd`'d at launch.

Untouched areas are hinted, never silently hidden: `+3 more tagged to areas you haven't touched — memory_search surfaces them.`

### 🧠 Session-scoped — reads and writes agree

Each session's prompt carries ITS workspace's memories, and `memory_save` lands in that same workspace. Multi-session web hosts get zero cross-workspace bleed.

### 📉 Bounded by design

Root-level memories always inject; area memories load on work/touch; a 25-entry injection cap plus hard limits — 200 lines / 25 KB index, 500 memories per scope — keep the prompt flat no matter how much you remember.

### 🔒 Safety in the plumbing

Atomic writes (a crash never leaves half a file) · secrets refused on **every** write path, panel included · cross-origin + method gate on the panel API · traversal-proof ids · `$HOME`, drive roots and tmp dirs can never become a project scope (Windows-aware guards).

### 🪶 Zero dependencies

Nothing to provision, nothing to break. Lean hosts degrade gracefully — every optional host service is read defensively, tools keep working without them.

## Quick start

**Prerequisite**: the DSH CLI — `npm install -g @deepseek-ai/dsh`. From a source checkout, prefix commands with `pnpm`.

**1 · Install (one command)**

```sh
dsh plugin --profile web add @fooxe/dsh-memory        # DSH CLI installed
pnpm dsh plugin --profile web add @fooxe/dsh-memory   # from a source checkout
```

`--profile` is **required** and goes **before** `add` — pick the profile you actually boot (`web` for the Web UI; see `~/.dsh/profiles/`). Manual `npm i -g @fooxe/dsh-memory` + `dsh web --patch ./overlay/dsh-memory.cordis.yml` also works, but `plugin add` is the recommended path.

**2 · Restart DSH — the step everyone misses**

Tools register **only at service startup**. Stop the service (Ctrl+C), start it again, then open a **new** chat.

**3 · Verify (30 seconds)**

Say *"Remember that I prefer pnpm over npm."* → a `memory_save` call appears. Open a **new** session and ask *"Which package manager do I prefer?"* → answered from the injected index. `~/.dsh/memory/MEMORY.md` now exists; inside a project, decisions land in `<project-root>/.dsh/memory/` — commit it and the whole team shares it.

### Troubleshooting (every row battle-tested on a real install)

| Symptom | Fix |
|---|---|
| `dsh: command not found` | Install the DSH CLI first — see Prerequisite |
| `required option '--profile <name>'` | It goes **before** the subcommand: `dsh plugin --profile web add ...` |
| pnpm `ERR_P..._STORE: Unexpected store location` | Your terminal pnpm differs from DSH's bundled one (11.7.0). Delete the profile dir (`~/.dsh/profiles/web`) and re-run `plugin add` — it rebuilds cleanly |
| Installed + restarted, still no memory tools | Check startup logs for `warning: ... did not activate`, and `dsh --profile web --dump-config \| grep fooxe` to confirm the tree entry; file an issue with the log if it persists |
| `ERR_PNPM_IGNORED_BUILDS` after install | Harmless here (zero native deps); `pnpm approve-builds` in the profile dir clears it |
| `plugin add` installs an **old version** | Your default registry (a mirror) lags behind npmjs. Pin explicitly: `npx pnpm@11.7.0 add @fooxe/dsh-memory@latest --registry=https://registry.npmjs.org`, or add `@fooxe:registry=https://registry.npmjs.org` to `~/.npmrc` |

## Tools

| Tool | Purpose |
|---|---|
| `memory_save` | Save a durable memory; scope defaults to project inside a detected project root, user elsewhere |
| `memory_search` | Case-insensitive keyword search across both scopes (ids, titles, tags, content) |
| `memory_read` | Read one full memory — Claude Code's `project_memory_read` field contract (`content?`, `local_file?`, `size_bytes`, `updated_at`, `truncated`) |
| `memory_list` | Recent memories per scope, newest first |

Tool descriptions embed proactive-save guidance — preferences, decisions and key facts get saved without being asked; secrets never do.

**Write rules (ported from Claude Code / Gemini CLI practice):**
- **Strong-evidence gate** — before saving, the model asks *"will this still matter a month from now?"*; unsure → skip (noise costs more than gaps)
- **Dedupe-and-update** — same-topic saves update the memory in place instead of appending duplicates
- **Dated index lines** — every entry carries `YYYY-MM-DD`, so the model reasons fresh-vs-stale at injection time
- **Secret refusal** — credentials/tokens/passwords are refused out loud, on every write path

## When · what · which scope

**Save when**: a preference or correction is stated (corrections are the highest-value memories), a decision is made, a key number/ID appears, an error+fix closes. **Never**: secrets, transient state, anything directly readable from the repo, unconfirmed guesses.

**Which scope** — the one-line test: is this fact about *the person* or about *this project*?

| User scope `~/.dsh/memory` | Project scope `<project-root>/.dsh/memory` |
|---|---|
| Personal preferences (pnpm, Chinese comments) | Technical decisions (A over B, because C) |
| Working habits (test before commit) | Conventions (layout, naming, build commands) |
| Cross-project lessons | Key numbers / IDs (ports, servers, app IDs) |
| Communication style | Anything the team should share through the repo |

Still true in a different project? → user scope. Only true here? → project scope.

## How it works

**Two physically isolated stores** — user `~/.dsh/memory` and project `<project-root>/.dsh/memory` — that can never mix. The project root is auto-detected by a priority chain, clearest signal first:

1. `DSH_MEMORY_PROJECT_DIR` env override
2. An existing `.dsh/memory` marker above (supports nested sub-project scopes)
3. Any VCS root above: `.git` / `.svn` / `.hg`
4. The host workspace registry (DSH's official project registry)
5. The current directory itself — VCS-less projects get their own scope

**Storage layout**

```
~/.dsh/memory/                      <- user scope (personal, cross-project)
|-- MEMORY.md                       <- guarded index, newest first
|-- memories/20261004-181500-prefer-pnpm.md
<project-root>/.dsh/memory/         <- project scope (team-shared, commit it)
```

**Injection** happens at session start via `ctx.systemPrompt`: user memories always; project root-level memories always; path-tagged memories when the tag hits the session's working-directory chain **or a touched directory's chain** (see Touch activation above); untouched tags counted in the hint line; 25-entry cap on top of the scope-level guards.

## Verification

```sh
npm install && npm run build && npm test   # 64 tests, zero type errors
```

Unit + type compile against the shipped official types + runtime smoke (real `defineTool`, end-to-end save → search → read → list) + a real-cordis activation guard, with CI on Ubuntu **and** Windows.

dsh-memory happily coexists with DSH's official MCP memory options — pick whichever fits your workflow, or use both.

## License

MIT. Not affiliated with DeepSeek or Anthropic.
