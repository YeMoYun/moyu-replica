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
