import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')

test('builder emits only a Windows x64 unpacked directory', () => {
  assert.match(config, /productName:\s*摸鱼大师/)
  assert.match(config, /executableName:\s*摸鱼大师/)
  assert.match(config, /target:\s*dir/)
  assert.match(config, /-\s*x64/)
  assert.doesNotMatch(config, /nsis|portable|appx|msix/i)
  assert.match(config, /asar:\s*true/)
})

test('builder places the release Qt runtime outside app.asar and excludes debug files', () => {
  assert.match(config, /from:\s*\.artifacts\/qtscrcpy-custom-runtime/)
  assert.match(config, /to:\s*qtscrcpy/)
  assert.match(config, /!\*\*\/\*\.pdb/)
  assert.match(config, /!\*\*\/\*\.lib/)
  assert.match(config, /QtScrcpy-LICENSE\.txt/)
  assert.match(config, /QtScrcpy-UPSTREAM\.md/)
})

test('packager is pinned and generated releases stay untracked', () => {
  assert.equal(packageJson.devDependencies['electron-builder'], '26.15.3')
  assert.match(packageJson.scripts['package:win'], /package-portable\.ps1/)
  assert.match(gitignore, /^release\/$/m)
})

test('Chinese guide explains extraction, wireless-only use, hashes and unsigned warnings', () => {
  const guide = readFileSync(new URL('../build/使用说明.txt', import.meta.url), 'utf8')
  for (const text of [
    'Windows 10/11 64 位',
    '完整解压',
    '摸鱼大师.exe',
    '无线调试',
    '不提供 USB 模式',
    'SHA256',
    '未知发布者',
    '不要关闭安全软件',
    '退出摸鱼大师'
  ]) assert.ok(guide.includes(text), `使用说明缺少：${text}`)
})
