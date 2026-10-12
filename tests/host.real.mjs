// T8 真实 cordis 激活守卫（防 A3 类回归）：
// 精简宿主（无 workingDirectory/sessionProjections）上插件必须照常激活（降级路径）；
// 提供这两个服务后同样必须激活。任何抛错都是激活回归。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-real-'))
process.env.DSH_MEMORY_USER_DIR = path.join(tmp, 'user')
delete process.env.DSH_MEMORY_PROJECT_DIR
await fs.mkdir(path.join(tmp, 'proj'), { recursive: true })
process.chdir(path.join(tmp, 'proj')) // 无 .git 祖先 → cwd 兜底路径（同时验证优雅降级）

const { Context } = await import('@deepseek-ai/cordis')
const SP = (await import('@deepseek-ai/dsh-system-prompt')).default
const TR = (await import('@deepseek-ai/dsh-tools')).default
const plugin = await import('../lib/index.js')

// 每个场景独立 Context：避免同一 ctx 上重复注册同名工具的干扰
const activate = async services => {
  const ctx = new Context()
  await ctx.plugin(SP) // dsh-tools 声明 inject ['systemPrompt']，先装
  await ctx.plugin(TR)
  for (const [name, value] of Object.entries(services ?? {})) ctx.provide(name, value)
  await assert.doesNotReject(async () => { await ctx.plugin(plugin) }, '插件激活不得抛错（A3 类回归）')
}

test('T8 真实 cordis：精简宿主与提供服务两种场景都激活', async () => {
  await activate() // 精简宿主：workingDirectory/sessionProjections 缺席 → 纯降级
  await activate({
    workingDirectory: { get: () => path.join(tmp, 'proj') },
    sessionProjections: { register: () => () => {}, stateOf: () => [] },
  })
})
