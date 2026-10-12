# dsh-memory

![npm](https://img.shields.io/npm/v/@fooxe/dsh-memory) ![license](https://img.shields.io/badge/license-MIT-blue) ![node](https://img.shields.io/badge/node-%3E%3D22.19-green)

**English** | [**中文版**](#中文版)

## English

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

---

# 中文版

**给 DeepSeek Harness 装上跨会话持久记忆——Claude Code 的记忆模型：你的 agent 记得住、醒得来、项目之间不串味。纯文件、零依赖。**（[English](#english)）

## 这个插件做什么

> 你的 DSH agent 每次开会话都是"初次见面"。
> 装上 dsh-memory，它记得你。

```text
会话 1   你："记住——这个项目用 pnpm，不用 npm。"
         Agent：memory_save 已保存

会话 2   你："我们用什么包管理器？"
         Agent："pnpm——你昨天告诉我的。"   <- 从此不用重复解释
```

无服务端、无账号、无 embedding——只有纯 markdown 文件，删掉目录就是彻底遗忘。

## 亮点

### 🖥️ 可视化记忆管理器，不是一堆 markdown

打开 **Settings → Memory**：双域全部记忆一屏可搜、工作区树形展开（嵌套子项目自动发现）、子文件夹分组、护栏仪表实时可见（行数 / KB / 文件数）。**面板内直接**新增、改写、打标签、删除任意记忆——和 agent 工具调用走同一条带护栏管线，你在界面改的就是模型下次看到的。

### 👆 触碰激活——CLAUDE.md 语义（v0.13）

项目记忆带子目录标签。标签命中会话工作目录（含祖先链）时注入——**会话触碰它的那一刻也注入**：一次 `read`/`edit`/`write`/`grep`/`glob`/`bash`/`pwsh` 调用进了 `frontend/src`，`[frontend]` 和 `[frontend/src]` 立即激活并保持到会话结束。单调递增、会话恢复后仍在——和嵌套 CLAUDE.md 完全同理，由你实际做了什么触发，而不只是启动时 `cd` 在哪。

未触碰区域不静默隐藏，始终提示：`+3 more tagged to areas you haven't touched — memory_search surfaces them.`

### 🧠 会话级——读写同桶

每个会话的提示词携带**它自己工作区**的记忆，保存也落进同一个工作区——多会话 web 宿主零串味。

### 📉 天生防膨胀

根级记忆恒注入；区域记忆工作/触碰才加载；注入 25 条上限 + 硬护栏（每域 200 行 / 25KB 索引、500 条）——记得再多也不撑爆上下文。

### 🔒 管线内置安全

原子写入（崩溃不留半截文件）· **所有**写入路径拒存密钥（面板也算）· 面板 API 跨源 + method 双栅栏 · 防 id 路径穿越 · `$HOME`、盘符根、tmp 目录永不成为项目作用域（Windows 感知）。

### 🪶 零依赖

没有要部署的、没有会坏的。精简宿主优雅降级——可选宿主服务全部防御式读取，缺了工具照常工作。

## 快速开始

**前置**：先装 DSH 本体——`npm install -g @deepseek-ai/dsh`（源码检出则命令加 `pnpm` 前缀）。

```sh
dsh plugin --profile web add @fooxe/dsh-memory        # 已装 DSH CLI
pnpm dsh plugin --profile web add @fooxe/dsh-memory   # 源码检出方式
```

`--profile` **必填**且放在 `add` 前面——填你实际启动的 profile（Web 界面就是 `web`；已有哪些看 `~/.dsh/profiles/`）。

装完**必须重启 DSH**（工具只在启动时注册），再开新会话说*"记住我喜欢 pnpm"*验证。`~/.dsh/memory/MEMORY.md` 随之出现；项目内决策落在 `<项目根>/.dsh/memory/`——提交版本库全组共享。

### 安装排障（每行来自真实安装实测）

| 症状 | 解法 |
|---|---|
| `dsh: command not found` | DSH 本体没装，看前置步骤 |
| `required option '--profile <name>'` | 参数放在子命令**前面**：`dsh plugin --profile web add ...` |
| pnpm `ERR_P..._STORE: Unexpected store location` | 终端 pnpm 与 DSH 自带（11.7.0）不一致——删掉整个 profile 目录（`~/.dsh/profiles/web`）重跑 `plugin add`，全新重建 |
| 装了也重启了还是没有记忆工具 | 看启动日志 `warning: ... did not activate`；跑 `dsh --profile web --dump-config \| grep fooxe` 确认在插件树里；仍在就把日志发 issue |
| `ERR_PNPM_IGNORED_BUILDS` | 对本插件无害（零原生依赖）；profile 目录跑 `pnpm approve-builds` 清掉 |
| `plugin add` 装到**旧版本** | 默认源（镜像）滞后。显式官方源：`npx pnpm@11.7.0 add @fooxe/dsh-memory@latest --registry=https://registry.npmjs.org`；或 `~/.npmrc` 加 `@fooxe:registry=https://registry.npmjs.org` |

## 四个工具

| 工具 | 作用 |
|---|---|
| `memory_save` | 保存持久记忆；项目内默认存项目级，否则存用户级 |
| `memory_search` | 大小写不敏感关键词检索（id/标题/标签/正文，跨双域） |
| `memory_read` | 完整读取——字段与 Claude Code 官方 `project_memory_read` 一致（`content?`、`local_file?`、`size_bytes`、`updated_at`、`truncated`） |
| `memory_list` | 双域最近记忆列表（新→旧） |

工具描述内置主动保存指引——偏好、决策、关键数字不用吩咐就存，密钥永不存。

**写入规则（移植自 Claude Code / Gemini CLI 实践）：**
- **强证据门槛**——存前自问"一个月后还有用吗？"，不确定就跳过（噪音比缺口更贵）
- **去重更新**——同主题再存 → 原地更新（内容替换、时间戳刷新），不追加重复
- **日期索引**——每条带 YYYY-MM-DD，注入时模型可推理新旧
- **密钥拒存**——凭据/令牌/密码一律拒绝并明说，覆盖所有写入路径

## 何时记 · 记什么 · 记哪级

**何时记**：偏好/纠正出现（纠正是最高价值记忆）、决策诞生、关键数字/ID 出现、踩坑+解法闭环。**永不记**：密钥、临时状态、代码里直接能读到的、未证实的猜测。

**记哪级**——一句话判定：关于"这个人"还是"这个工程"？

| 记用户级 `~/.dsh/memory` | 记项目级 `<项目根>/.dsh/memory` |
|---|---|
| 个人偏好（我用 pnpm、注释用中文） | 技术决策（用 A 方案，因为 C） |
| 工作习惯（先跑测试再提交） | 项目约定（目录结构、命名、构建命令） |
| 跨项目经验（"这类库都有 X 坑"） | 关键数字/ID（端口、服务器、AppID） |
| 沟通风格 | 一切该随版本库共享给团队的 |

换个项目这条还成立？→ 用户级。只在这里成立？→ 项目级。

## 工作原理

**两个物理隔离的存储域**——用户级 `~/.dsh/memory` + 项目级 `<项目根>/.dsh/memory`——永不混淆。项目根按优先级链自动判定，越明确的信号越优先：

1. `DSH_MEMORY_PROJECT_DIR` 环境变量
2. 向上找已存在的 `.dsh/memory` 标记（支持嵌套子项目）
3. 向上找任意 VCS 根：`.git` / `.svn` / `.hg`
4. 宿主 workspace 注册表（DSH 官方项目注册表）
5. 当前目录兜底——无 VCS 项目也拥有自己的作用域

**存储布局**

```
~/.dsh/memory/                      <- 用户级（个人，跨项目）
|-- MEMORY.md                       <- 护栏索引，新→旧
|-- memories/20261004-181500-prefer-pnpm.md
<项目根>/.dsh/memory/               <- 项目级（团队共享，随版本库提交）
```

**注入**发生在会话启动时（`ctx.systemPrompt`）：user 域记忆恒注入；项目根级恒注入；带路径标签的按"命中工作目录链 **或 触碰目录链**"注入（见上方触碰激活）；未触碰的计数进提示行；注入另有 25 条上限叠在域级护栏之上。

## 验证

```sh
npm install && npm run build && npm test   # 64 项测试，0 类型错误
```

单元 + 对官方类型真实编译 + 运行时冒烟（真实 `defineTool`，save → search → read → list 端到端）+ 真实 cordis 激活守卫；CI 跑 Ubuntu **和** Windows。

与 DSH 官方 MCP 记忆方案完全共存——按工作流任选，或两者同用。MIT 协议，与 DeepSeek、Anthropic 无关联。
