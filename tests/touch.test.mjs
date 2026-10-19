// v0.13 CLAUDE.md 语义：读写触碰激活子目录记忆注入（touch activation）。
// T1 读写触发 / T2 未触碰不注入 / T3 删除第三条件（行为变更）
// T4 跨工作区隔离 / T5 相对路径 / T6 降级（无 workingDirectory/sessionProjections）
// T7 保存侧有效 cwd + fold 卫生（同引用契约、去重、200 上限）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-touch-'))
const root = path.join(tmp, 'ws') // 项目根（.git 锚定）
const base = path.join(root, '.dsh', 'memory')
process.env.DSH_MEMORY_USER_DIR = path.join(tmp, 'user')
process.env.DSH_MEMORY_PROJECT_DIR = root // env 直指项目根：projectBaseFor 确定性解析

mkdirSync(path.join(root, '.git'), { recursive: true })
mkdirSync(path.join(base, 'memories'), { recursive: true })
const mem = (id, title, tag) => {
  writeFileSync(path.join(base, 'memories', `${id}.md`),
    `---\nid: ${id}\nscope: project\npath: ${tag}\nsaved_at: 2026-10-12T00:00:00.000Z\ntags: \n---\n\n# ${title}\n\nBody of ${title}.\n`)
  return `- [${title}](memories/${id}.md) — Body of ${title}. (2026-10-12)${tag !== '' ? ` [${tag}]` : ''}`
}
writeFileSync(path.join(base, 'MEMORY.md'), '# Memory Index\n\n'
  + mem('20261012-000001-frontend-area', 'Frontend area memory', 'frontend') + '\n'
  + mem('20261012-000002-frontend-src', 'Frontend src memory', 'frontend/src') + '\n'
  + mem('20261012-000003-backend', 'Backend memory', 'backend') + '\n')

const plugin = await import('../lib/index.js')

const sections = [], projectionDefs = []
const projectionsStub = {
  register: def => { projectionDefs.push(def); return () => {} },
  stateOf: (session, key) => key === 'dsh-memory:touched-dirs' ? (session.__touched ?? []) : undefined,
}
const ctx = {
  tools: { register: () => {} },
  systemPrompt: { section: s => sections.push(s), getSectionOrder: () => 42 },
  inject: (names, cb) => { if (names.includes('webServer')) cb({ webServer: { register: () => () => {} } }) },
  get: name => name === 'workingDirectory' ? { get: s => s.__cwd } : name === 'sessionProjections' ? projectionsStub : undefined,
}
await plugin.apply(ctx)
const auto = sections.find(s => s.name === 'dsh-memory:auto')
const agent = (cwd, touched) => ({ session: { header: { cwd }, __cwd: cwd, __touched: touched ?? [] } })
const touchedViaFold = events => {
  const def = projectionDefs[0]
  let st = def.init({}, 0)
  for (const e of events) st = def.apply(st, e)
  return st
}

test('T1 读写触发：read frontend/src/x.ts → [frontend] 与 [frontend/src] 都注入', () => {
  assert.ok(auto !== undefined, '注入段应已注册')
  const st = touchedViaFold([{ type: 'tool/call', name: 'read', arguments: { file_path: path.join(root, 'frontend', 'src', 'x.ts') } }])
  assert.deepEqual(st, [path.join(root, 'frontend', 'src', 'x.ts')], 'fold 应原样记录绝对路径')
  const text = auto.text({ agent: agent(root, st) })
  assert.ok(text.includes('Frontend area memory'), '[frontend] 祖先链应注入')
  assert.ok(text.includes('Frontend src memory'), '[frontend/src] 触碰目录自身应注入')
})

test('T2 未触碰不注入：[backend] 隐藏并计入两段式提示', () => {
  const st = touchedViaFold([{ type: 'tool/call', name: 'read', arguments: { file_path: path.join(root, 'frontend', 'src', 'x.ts') } }])
  const text = auto.text({ agent: agent(root, st) })
  assert.ok(!text.includes('Backend memory'), '未触碰区域不应注入正文')
  assert.ok(text.includes("+1 more tagged to areas you haven't touched"), '提示应计数且用新措辞')
})

test('T3 删除第三条件（行为变更）：cwd 在 frontend → [frontend/src] 不再因"更深"注入', () => {
  const text = auto.text({ agent: agent(path.join(root, 'frontend')) })
  assert.ok(text.includes('Frontend area memory'), 'cwd 自身/祖先标签照常注入')
  // 旧实现（tag 比 cwd 深也注入）在此会注入 Frontend src memory —— 新语义必须不注入
  assert.ok(!text.includes('Frontend src memory'), '比 cwd 更深的标签必须已触碰才注入')
})

test('T4 跨工作区隔离：触碰其他工作区路径不激活任何标签', () => {
  const foreign = path.join(os.tmpdir(), 'dsh-touch-foreign', 'x.ts') // root 之外
  const st = touchedViaFold([{ type: 'tool/call', name: 'edit', arguments: { file_path: foreign } }])
  const text = auto.text({ agent: agent(root, st) })
  for (const m of ['Frontend area memory', 'Frontend src memory', 'Backend memory']) {
    assert.ok(!text.includes(m), `${m} 不应注入`)
  }
  assert.ok(text.includes("all 3 memories in this project are tagged to areas you haven't touched"), '全部计入提示')
})

test('T5 相对路径：触碰 frontend/src/x.ts 按有效 cwd 解析激活两级标签', () => {
  const st = touchedViaFold([{ type: 'tool/call', name: 'grep', arguments: { path: 'frontend/src/x.ts' } }])
  const text = auto.text({ agent: agent(root, st) })
  assert.ok(text.includes('Frontend area memory') && text.includes('Frontend src memory'),
    '相对路径应按会话有效 cwd 解析（不提前在 reducer 里解析）')
})

test('T8 目录型参数：grep/glob/pwsh 传目录 → 最深一级也激活（F1）', () => {
  const evs = [
    { type: 'tool/call', name: 'grep', arguments: { path: path.join(root, 'frontend', 'src') } },
    { type: 'tool/call', name: 'glob', arguments: { path: path.join(root, 'frontend', 'src') } },
    { type: 'tool/call', name: 'pwsh', arguments: { workdir: path.join(root, 'frontend', 'src') } },
  ]
  for (const ev of evs) {
    const text = auto.text({ agent: agent(root, touchedViaFold([ev])) })
    assert.ok(text.includes('Frontend area memory'), `${ev.name}: [frontend] 应注入`)
    assert.ok(text.includes('Frontend src memory'), `${ev.name}: [frontend/src] 最深一级应注入`)
  }
  // 尾分隔符 + 相对目录路径
  const sep = touchedViaFold([{ type: 'tool/call', name: 'glob', arguments: { path: path.join(root, 'frontend', 'src') + path.sep } }])
  assert.ok(auto.text({ agent: agent(root, sep) }).includes('Frontend src memory'), '尾分隔符目录同样激活最深一级')
  const rel = touchedViaFold([{ type: 'tool/call', name: 'grep', arguments: { path: 'frontend/src' } }])
  assert.ok(auto.text({ agent: agent(root, rel) }).includes('Frontend src memory'), '相对目录路径按有效 cwd 解析')
})

test('P1 丢标签：cd 前触碰的相对路径不被组装时 cwd 重解析（单调性保持）', () => {
  // 会话冻结 cwd = root；cd 进 frontend 后触碰相对 "src"（真实 = frontend/src）；再 cd 回 root
  const evs = [
    { type: 'tool/call', name: 'working_directory', arguments: { cd: path.join(root, 'frontend') } },
    { type: 'tool/call', name: 'grep', arguments: { path: 'src' } },
    { type: 'tool/call', name: 'working_directory', arguments: { cd: root } },
  ]
  const text = auto.text({ agent: agent(root, touchedViaFold(evs)) })
  assert.ok(text.includes('Frontend src memory'), '触碰时刻 cwd=frontend → "src"=frontend/src；cd 回 root 后仍应注入（触碰保持到会话结束）')
})

test('P2 串桶：backend 下触碰的 "src" 在 cd 到 frontend 后不得重解析成 frontend/src', () => {
  // 会话冻结 cwd = <root>/backend；触碰相对 "src"（真实 = backend/src）；cd 到 frontend
  const evs = [
    { type: 'tool/call', name: 'grep', arguments: { path: 'src' } },
    { type: 'tool/call', name: 'working_directory', arguments: { cd: path.join(root, 'frontend') } },
  ]
  const agentB = { session: { header: { cwd: path.join(root, 'backend') }, __cwd: path.join(root, 'frontend'), __touched: touchedViaFold(evs) } }
  const text = auto.text({ agent: agentB })
  assert.ok(!text.includes('Frontend src memory'), '从未触碰 frontend/src——"src" 不得在组装时刻被重解析成 frontend/src（串桶）')
  assert.ok(text.includes('Backend memory'), 'backend/src 的祖先标签 [backend] 应因触碰激活')
})

test('T10 跨光标同相对路径：cd 间隔的 "src" 各记一次（F6）', () => {
  // 会话创建于 root：cd backend → grep 'src'（= backend/src）→ cd ../frontend → grep 'src'（= frontend/src）→ cd ..
  const evs = [
    { type: 'tool/call', name: 'working_directory', arguments: { cd: 'backend' } },
    { type: 'tool/call', name: 'grep', arguments: { path: 'src' } },
    { type: 'tool/call', name: 'working_directory', arguments: { cd: '../frontend' } },
    { type: 'tool/call', name: 'grep', arguments: { path: 'src' } },
    { type: 'tool/call', name: 'working_directory', arguments: { cd: '..' } },
  ]
  const st = touchedViaFold(evs)
  assert.equal(st.filter(x => x === 'src').length, 2, '同一相对字符串在不同光标段各记一次（跨段不去重）')
  const text = auto.text({ agent: agent(root, st) }) // 装配时有效 cwd 已回到 root，cwd 链不贡献标签
  assert.ok(text.includes('Backend memory'), 'backend/src 的祖先标签 [backend] 应注入')
  assert.ok(text.includes('Frontend area memory'), 'frontend/src 的祖先标签 [frontend] 应注入')
  assert.ok(text.includes('Frontend src memory'), 'frontend/src 自身标签应注入')
})

test('T6 降级：宿主无 workingDirectory/sessionProjections → 回落 header.cwd 链式过滤', async () => {
  const sections2 = []
  const ctx2 = {
    tools: { register: () => {} },
    systemPrompt: { section: s => sections2.push(s), getSectionOrder: () => 42 },
    inject: () => {},
    get: () => undefined,
  }
  await plugin.apply(ctx2) // 不得抛（A3 类激活回归守卫）
  const a2 = sections2.find(s => s.name === 'dsh-memory:auto')
  const text = a2.text({ agent: { session: { header: { cwd: path.join(root, 'frontend') } } } })
  assert.ok(text.includes('Frontend area memory'), 'header.cwd 链照常生效')
  assert.ok(!text.includes('Frontend src memory'), '无触碰集时深层标签不注入（与 0.12.x 降级路径一致的过滤行为）')
})

test('T7 保存侧：workingDirectory 有效 cwd ≠ 冻结 header.cwd → path 标签按有效 cwd 打', async () => {
  delete process.env.DSH_MEMORY_PROJECT_DIR // 让保存走 .git 锚定解析（本用例自带独立工作区）
  const root2 = path.join(tmp, 'ws2')
  mkdirSync(path.join(root2, '.git'), { recursive: true })
  const tools2 = []
  const ctx2 = {
    tools: { register: t => tools2.push(t) },
    systemPrompt: { section: () => {}, getSectionOrder: () => 42 },
    inject: () => {},
    get: name => name === 'workingDirectory' ? { get: s => s.__cwd } : undefined,
  }
  await plugin.apply(ctx2)
  const save = tools2.find(t => t.name === 'memory_save')
  const exec = {
    signal: new AbortController().signal,
    agent: { session: { header: { cwd: root2 }, __cwd: path.join(root2, 'backend', 'api') } }, // 有效 cwd 已 cd 进子目录
  }
  const r = await save.execute({ title: 'Save side cwd', content: 'tag follows the effective cwd' }, exec)
  assert.equal(r.saved, true, `应保存成功: ${JSON.stringify(r)}`)
  const idx = await fs.readFile(path.join(root2, '.dsh', 'memory', 'MEMORY.md'), 'utf8')
  assert.ok(idx.includes('[backend/api]'), '标签应按 workingDirectory 的有效 cwd（backend/api），而非冻结 header.cwd（根）')
})

test('T9 检索侧：search/read/list 跟随 workingDirectory 有效 cwd（F2）', async () => {
  delete process.env.DSH_MEMORY_PROJECT_DIR // T7 已删过一次，保留同一行防重排
  const wsA = path.join(tmp, 'wsA'), wsB = path.join(tmp, 'wsB')
  for (const w of [wsA, wsB]) {
    mkdirSync(path.join(w, '.git'), { recursive: true })
    mkdirSync(path.join(w, '.dsh', 'memory', 'memories'), { recursive: true })
  }
  writeFileSync(path.join(wsB, '.dsh', 'memory', 'memories', '20261013-000001-wsb-7f3a.md'),
    `---\nid: 20261013-000001-wsb-7f3a\nscope: project\npath: \nsaved_at: 2026-10-13T00:00:00.000Z\ntags: \n---\n\n# wsB unique 7f3a convention\n\nwsB-7f3a-marker.\n`)
  writeFileSync(path.join(wsB, '.dsh', 'memory', 'MEMORY.md'),
    '# Memory Index\n\n- [wsB unique 7f3a convention](memories/20261013-000001-wsb-7f3a.md) — wsB-7f3a-marker. (2026-10-13)\n')
  const tools2 = []
  const ctx2 = {
    tools: { register: t => tools2.push(t) },
    systemPrompt: { section: () => {}, getSectionOrder: () => 42 },
    inject: () => {},
    get: name => name === 'workingDirectory' ? { get: s => s.__cwd } : undefined,
  }
  await plugin.apply(ctx2)
  const search = tools2.find(t => t.name === 'memory_search')
  const read = tools2.find(t => t.name === 'memory_read')
  const list = tools2.find(t => t.name === 'memory_list')
  const exec = {
    signal: new AbortController().signal,
    agent: { session: { header: { cwd: wsA }, __cwd: wsB } }, // 冻结=A，有效=B
  }
  const r = await search.execute({ query: 'wsB-7f3a' }, exec)
  assert.ok(r.matches?.some(m => m.id === '20261013-000001-wsb-7f3a'), `search 应命中 wsB 记忆（跟随有效 cwd）: ${JSON.stringify(r)}`)
  const full = await read.execute({ id: '20261013-000001-wsb-7f3a' }, exec)
  assert.equal(full.id, '20261013-000001-wsb-7f3a', 'read 应读到 wsB 记忆')
  const out = await list.execute({}, exec)
  assert.ok(out.project?.entries?.some(l => l.includes('wsB unique 7f3a convention')), 'list 的 project 桶应含 wsB 记忆')
})

test('fold 卫生：无关事件同引用；路径去重；200 上限丢最旧', () => {
  const def = projectionDefs[0]
  assert.ok(def !== undefined, 'projection 定义应已注册到桩 registry')
  const st0 = def.init({}, 0)
  assert.deepEqual(st0, [])
  const sameA = def.apply(st0, { type: 'turn/start', turn: 1 })
  assert.ok(Object.is(st0, sameA), '非 tool/call 事件必须返回同一引用（注册表零下游工作契约）')
  const sameB = def.apply(st0, { type: 'tool/call', name: 'memory_save', arguments: { path: 'whatever' } })
  assert.ok(Object.is(st0, sameB), '不在触碰表里的工具必须返回同一引用')
  const added = def.apply(st0, { type: 'tool/call', name: 'read', arguments: { file_path: 'a.ts' } })
  const dup = def.apply(added, { type: 'tool/call', name: 'read', arguments: { file_path: 'a.ts' } })
  assert.ok(Object.is(added, dup) && dup.length === 1, '重复路径去重且返回同一引用')
  let st = st0
  for (let i = 0; i < 205; i++) st = def.apply(st, { type: 'tool/call', name: 'write', arguments: { file_path: `f${i}.ts` } })
  assert.equal(st.length, 200, '状态上限 200')
  assert.ok(st.includes('f204.ts') && !st.includes('f0.ts'), '超出上限丢最旧')
  // 结构化 schema：合法状态透传，非法状态抛错（等价 z.array(z.string()) 的 parse 语义）
  assert.deepEqual(def.stateSchema.parse(['a', 'b']), ['a', 'b'])
  assert.deepEqual(def.schema.parse(['a', 'b']), ['a', 'b'])
  assert.throws(() => def.stateSchema.parse('not-an-array'))
  assert.throws(() => def.schema.parse(['ok', 42]))
  assert.deepEqual(def.view(['x']), ['x'], 'rc 一代的 view 应为恒等')
  // v2 状态形状（P1/P2 修复）：cd 标记项与触碰字符串混合；旧纯字符串状态仍然合法（迁移兼容）
  assert.deepEqual(def.stateSchema.parse([{ cd: '/a' }, 'b']), [{ cd: '/a' }, 'b'])
  assert.throws(() => def.stateSchema.parse([{ cd: 42 }]), 'cd 必须是字符串')
  assert.throws(() => def.stateSchema.parse([{ cd: '' }]), 'cd 必须非空')
  assert.throws(() => def.stateSchema.parse(['']), '空字符串不是合法触碰项')
  // fold v2：working_directory 记为标记项；省略 cd（读目录模式）不动状态；逐出策略保 cd
  const cdState = def.apply(st0, { type: 'tool/call', name: 'working_directory', arguments: { cd: '/somewhere' } })
  assert.deepEqual(cdState, [{ cd: '/somewhere' }], 'working_directory 带 cd 记为标记项')
  const cdRead = def.apply(cdState, { type: 'tool/call', name: 'working_directory', arguments: {} })
  assert.ok(Object.is(cdState, cdRead), '省略 cd（读目录模式）返回同一引用')
  let capped = cdState
  for (let i = 0; i < 205; i++) capped = def.apply(capped, { type: 'tool/call', name: 'write', arguments: { file_path: `f${i}.ts` } })
  assert.equal(capped.length, 200, '上限仍为 200')
  assert.deepEqual(capped[0], { cd: '/somewhere' }, '逐出永不吞 cd 标记（否则后续相对触碰的回放游标就错了）')
  assert.ok(capped.includes('f204.ts') && !capped.includes('f0.ts'), '溢出丢最旧的触碰项')
})
