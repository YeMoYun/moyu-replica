import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync(new URL('../scripts/package-portable.ps1', import.meta.url), 'utf8')
const scriptBytes = readFileSync(new URL('../scripts/package-portable.ps1', import.meta.url))

test('release script includes a UTF-8 BOM for Windows PowerShell 5.1', () => {
  assert.deepEqual([...scriptBytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF])
})

test('release script checks platform, clean Git state and required Qt files', () => {
  assert.match(script, /RuntimeInformation.*OSArchitecture.*X64/)
  assert.match(script, /git status --porcelain/)
  for (const file of ['QtScrcpy.exe', 'adb.exe', 'scrcpy-server', 'platforms\\qwindows.dll']) {
    assert.ok(script.includes(file), `missing runtime check: ${file}`)
  }
})

test('release script validates exact versioned targets before removal', () => {
  assert.match(script, /GetFullPath/)
  assert.match(script, /StartsWith/)
  assert.match(script, /Remove-Item -LiteralPath/)
  assert.doesNotMatch(script, /Remove-Item\s+[^\r\n]*\*/)
  assert.doesNotMatch(script, /rm\s+-rf/i)
})

test('release script builds, packages, checks exclusions, zips and hashes', () => {
  assert.match(script, /npm run build/)
  assert.match(script, /electron-builder.*--win.*--x64.*--dir/)
  assert.match(script, /\.pdb|\.lib/)
  assert.match(script, /Compress-Archive/)
  assert.match(script, /SHA256\]::Create/)
  assert.match(script, /File\]::OpenRead/)
  assert.doesNotMatch(script, /Get-FileHash/)
  assert.match(script, /package-manifest\.txt/)
})
