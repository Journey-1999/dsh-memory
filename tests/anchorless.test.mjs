// BUG B 回归（v0.11.4）：服务从守护目录启动（chdir $HOME → home 护栏 →
// 模块级 PROJECT_DIR=undefined），会话工作区保存的记忆必须对同一会话的
// list/search 以及下个会话的注入可见——域准入跟随会话桶，而非服务锚点。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

process.chdir(os.homedir()) // 守护目录启动场景
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-anchorless-'))
process.env.DSH_MEMORY_USER_DIR = tmp
const plugin = await import('../lib/index.js')

const registered = []
const sections = []
const ctx = {
  tools: { register: t => registered.push(t) },
  systemPrompt: { section: s => sections.push(s), getSectionOrder: () => 1 },
  inject: () => {},
}
await plugin.apply(ctx)
const tool = n => registered.find(t => t.name === n)
const agentExec = { signal: new AbortController().signal, agent: { session: { header: { cwd: '' } } } }

test('BUG B：守护目录启动 → 会话桶对 list / search / 注入全部可见', async () => {
  const ws = path.join(tmp, 'session-ws')
  mkdirSync(path.join(ws, '.git'), { recursive: true })
  agentExec.agent.session.header.cwd = ws
  const r = await tool('memory_save').execute({ title: 'Anchorless memory', content: 'Saved from a guarded-directory host.' }, agentExec)
  assert.ok(r.saved === true && r.file.startsWith(ws), '会话保存应落进会话工作区')
  const list = await tool('memory_list').execute({}, agentExec)
  assert.ok(list.project !== undefined, 'project 域应存在（修复前整个消失）')
  assert.ok(list.project.entries.some(l => l.includes('Anchorless memory')), 'list 应含会话桶记忆')
  const search = await tool('memory_search').execute({ query: 'Anchorless' }, agentExec)
  assert.ok(search.matches.length >= 1, 'search 应找到（修复前默认搜不到）')
  const text = sections.find(s => s.name === 'dsh-memory:auto').text({ agent: agentExec.agent })
  assert.ok(text.includes('Anchorless memory'), '下个会话注入应含该记忆（存得进也读得出）')
})
