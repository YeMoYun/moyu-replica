# WeChat Official Account QR Login Proof-of-Concept Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated, real WeChat Official Account test-account proof of concept that turns a genuine parameterized QR scan event into a one-time local login success without modifying the production Electron login flow.

**Architecture:** One Node.js process owns two HTTP listeners and one in-memory session store. The local listener on `127.0.0.1` serves the validation UI and session API; the callback listener is the only listener exposed through a Cloudflare Quick Tunnel and accepts only WeChat verification and event callbacks. A narrow WeChat API client creates temporary parameterized QR codes, while signature validation, XML extraction, session expiry, replay protection, and redacted logging remain separate testable modules.

**Tech Stack:** Node.js 24 built-ins (`http`, `crypto`, `fs`, `url`), native `fetch`, Node test runner, PowerShell, Cloudflare Quick Tunnel, WeChat Official Account test account APIs.

---

## File map

Create the following focused files:

- `tools/wechat-auth-poc/config.mjs`: strict environment parsing and port/TTL validation.
- `tools/wechat-auth-poc/wechat-signature.mjs`: SHA-1 callback signature verification only.
- `tools/wechat-auth-poc/wechat-event.mjs`: extract the small whitelist of event fields needed by the proof of concept.
- `tools/wechat-auth-poc/session-store.mjs`: short-lived sessions, scene lookup, state transitions, expiry, idempotency, and redacted identifiers.
- `tools/wechat-auth-poc/wechat-client.mjs`: obtain/cached access tokens and request temporary parameterized QR tickets.
- `tools/wechat-auth-poc/server.mjs`: compose dependencies and start/stop the local and callback listeners.
- `tools/wechat-auth-poc/local-handler.mjs`: local-only health, session, status, and static-file routes.
- `tools/wechat-auth-poc/callback-handler.mjs`: WeChat GET verification and POST event handling only.
- `tools/wechat-auth-poc/http-utils.mjs`: bounded request-body reading and JSON/text response helpers.
- `tools/wechat-auth-poc/public/index.html`: validation page structure.
- `tools/wechat-auth-poc/public/app.js`: session creation, polling, expiry countdown, refresh, and Chinese state messages.
- `tools/wechat-auth-poc/public/styles.css`: responsive login preview matching the approved visual direction.
- `tools/wechat-auth-poc/.env.example`: names of required local secrets and safe defaults.
- `tools/wechat-auth-poc/start-tunnel.ps1`: launch the already-installed `cloudflared` against the callback-only port.
- `tools/wechat-auth-poc/README.md`: exact test-account, callback, startup, scan, and shutdown procedure.

Create the following tests:

- `tests/wechat-auth-config.test.mjs`
- `tests/wechat-auth-signature.test.mjs`
- `tests/wechat-auth-event.test.mjs`
- `tests/wechat-auth-session.test.mjs`
- `tests/wechat-auth-client.test.mjs`
- `tests/wechat-auth-server.test.mjs`
- `tests/wechat-auth-ui.test.mjs`

Modify only:

- `.gitignore`: ignore the real proof-of-concept `.env`.
- `package.json`: add isolated proof-of-concept start and test commands.

Do not modify `src/renderer/src/views/WxLoginView.vue`, `LoginView.vue`, the Electron main process, preload bridges, or existing token persistence in this plan.

---

### Task 1: Lock down configuration and secret handling

**Files:**
- Create: `tools/wechat-auth-poc/config.mjs`
- Create: `tools/wechat-auth-poc/.env.example`
- Create: `tests/wechat-auth-config.test.mjs`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Write failing configuration tests**

Create `tests/wechat-auth-config.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../tools/wechat-auth-poc/config.mjs'

const valid = {
  WECHAT_APP_ID: 'wx-test-app',
  WECHAT_APP_SECRET: 'local-secret',
  WECHAT_CALLBACK_TOKEN: 'callback-token'
}

test('wechat auth POC rejects missing secrets by name', () => {
  assert.throws(() => loadConfig({}), /WECHAT_APP_ID, WECHAT_APP_SECRET, WECHAT_CALLBACK_TOKEN/)
})

test('wechat auth POC binds the private and callback listeners to loopback', () => {
  const config = loadConfig(valid)
  assert.equal(config.localHost, '127.0.0.1')
  assert.equal(config.callbackHost, '127.0.0.1')
  assert.equal(config.localPort, 8787)
  assert.equal(config.callbackPort, 8788)
  assert.equal(config.sessionTtlMs, 300_000)
})

test('wechat auth POC rejects unsafe ports and TTL values', () => {
  assert.throws(() => loadConfig({ ...valid, WECHAT_LOCAL_PORT: '0' }), /WECHAT_LOCAL_PORT/)
  assert.throws(() => loadConfig({ ...valid, WECHAT_SESSION_TTL_SECONDS: '30' }), /WECHAT_SESSION_TTL_SECONDS/)
})
```

- [ ] **Step 2: Run the test and confirm the module is absent**

Run:

```powershell
node --test tests/wechat-auth-config.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tools/wechat-auth-poc/config.mjs`.

- [ ] **Step 3: Implement strict configuration parsing**

Create `tools/wechat-auth-poc/config.mjs`:

```js
function integer(env, name, fallback, min, max) {
  const raw = env[name] ?? String(fallback)
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} 必须是 ${min}-${max} 的整数`)
  }
  return value
}

export function loadConfig(env = process.env) {
  const required = ['WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'WECHAT_CALLBACK_TOKEN']
  const missing = required.filter((name) => !String(env[name] || '').trim())
  if (missing.length) throw new Error(`缺少环境变量：${missing.join(', ')}`)
  return Object.freeze({
    appId: env.WECHAT_APP_ID.trim(),
    appSecret: env.WECHAT_APP_SECRET.trim(),
    callbackToken: env.WECHAT_CALLBACK_TOKEN.trim(),
    localHost: '127.0.0.1',
    callbackHost: '127.0.0.1',
    localPort: integer(env, 'WECHAT_LOCAL_PORT', 8787, 1, 65535),
    callbackPort: integer(env, 'WECHAT_CALLBACK_PORT', 8788, 1, 65535),
    sessionTtlMs: integer(env, 'WECHAT_SESSION_TTL_SECONDS', 300, 60, 1800) * 1000
  })
}
```

Create `tools/wechat-auth-poc/.env.example`:

```dotenv
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_CALLBACK_TOKEN=
WECHAT_LOCAL_PORT=8787
WECHAT_CALLBACK_PORT=8788
WECHAT_SESSION_TTL_SECONDS=300
```

Append this exact entry to `.gitignore`:

```gitignore
tools/wechat-auth-poc/.env
```

Add these scripts to `package.json`:

```json
"wechat-auth:poc": "node --env-file=tools/wechat-auth-poc/.env tools/wechat-auth-poc/server.mjs",
"wechat-auth:tunnel": "powershell -NoProfile -ExecutionPolicy Bypass -File tools/wechat-auth-poc/start-tunnel.ps1",
"test:wechat-auth-poc": "node --test tests/wechat-auth-*.test.mjs"
```

- [ ] **Step 4: Run the focused configuration test**

Run:

```powershell
node --test tests/wechat-auth-config.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 5: Confirm the secret file is ignored**

Run:

```powershell
Copy-Item tools/wechat-auth-poc/.env.example tools/wechat-auth-poc/.env
git check-ignore -v tools/wechat-auth-poc/.env
```

Expected: output points to the new `.gitignore` rule. Leave the copied `.env` untracked and ignored for the later manual credential step.

- [ ] **Step 6: Commit the configuration boundary**

```powershell
git add .gitignore package.json tests/wechat-auth-config.test.mjs tools/wechat-auth-poc/config.mjs tools/wechat-auth-poc/.env.example
git commit -m "test: define WeChat auth POC configuration"
```

---

### Task 2: Validate callback signatures and parse only required XML fields

**Files:**
- Create: `tools/wechat-auth-poc/wechat-signature.mjs`
- Create: `tools/wechat-auth-poc/wechat-event.mjs`
- Create: `tests/wechat-auth-signature.test.mjs`
- Create: `tests/wechat-auth-event.test.mjs`

- [ ] **Step 1: Write failing signature and event tests**

Create `tests/wechat-auth-signature.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyWechatSignature } from '../tools/wechat-auth-poc/wechat-signature.mjs'

test('verifies the sorted WeChat callback signature', () => {
  const token = 'callback-token'
  const timestamp = '1720000000'
  const nonce = '839201'
  const signature = createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex')
  assert.equal(verifyWechatSignature({ token, timestamp, nonce, signature }), true)
  assert.equal(verifyWechatSignature({ token, timestamp, nonce, signature: `${signature.slice(0, -1)}0` }), false)
})

test('rejects missing or malformed callback signature fields', () => {
  assert.equal(verifyWechatSignature({ token: 'a', timestamp: '', nonce: 'b', signature: 'c' }), false)
  assert.equal(verifyWechatSignature({ token: 'a', timestamp: '1', nonce: 'b', signature: 'not-hex' }), false)
})
```

Create `tests/wechat-auth-event.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseWechatScanEvent } from '../tools/wechat-auth-poc/wechat-event.mjs'

test('normalizes subscribed and already-following scan events', () => {
  const subscribed = '<xml><FromUserName><![CDATA[openid-a]]></FromUserName><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[subscribe]]></Event><EventKey><![CDATA[qrscene_scene-a]]></EventKey></xml>'
  const scanned = '<xml><FromUserName><![CDATA[openid-b]]></FromUserName><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[SCAN]]></Event><EventKey><![CDATA[scene-b]]></EventKey></xml>'
  assert.deepEqual(parseWechatScanEvent(subscribed), { openId: 'openid-a', scene: 'scene-a', event: 'subscribe' })
  assert.deepEqual(parseWechatScanEvent(scanned), { openId: 'openid-b', scene: 'scene-b', event: 'SCAN' })
})

test('ignores non-event messages, missing scenes and oversized XML', () => {
  assert.equal(parseWechatScanEvent('<xml><MsgType><![CDATA[text]]></MsgType></xml>'), null)
  assert.equal(parseWechatScanEvent('<xml><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[SCAN]]></Event></xml>'), null)
  assert.throws(() => parseWechatScanEvent('x'.repeat(65_537)), /过大/)
})
```

- [ ] **Step 2: Run both tests and confirm they fail**

Run:

```powershell
node --test tests/wechat-auth-signature.test.mjs tests/wechat-auth-event.test.mjs
```

Expected: both test files fail with missing-module errors.

- [ ] **Step 3: Implement constant-time signature comparison**

Create `tools/wechat-auth-poc/wechat-signature.mjs`:

```js
import { createHash, timingSafeEqual } from 'node:crypto'

export function verifyWechatSignature({ token, timestamp, nonce, signature }) {
  if (![token, timestamp, nonce, signature].every((value) => typeof value === 'string' && value.length)) return false
  if (!/^[a-f0-9]{40}$/i.test(signature)) return false
  const expected = createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest()
  const supplied = Buffer.from(signature, 'hex')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
```

- [ ] **Step 4: Implement the narrow event parser**

Create `tools/wechat-auth-poc/wechat-event.mjs`:

```js
const MAX_XML_BYTES = 65_536

function field(xml, name) {
  const match = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${name}>`, 'i'))
  return (match?.[1] ?? match?.[2] ?? '').trim()
}

export function parseWechatScanEvent(xml) {
  if (typeof xml !== 'string') return null
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) throw new Error('微信回调 XML 过大')
  if (field(xml, 'MsgType').toLowerCase() !== 'event') return null
  const event = field(xml, 'Event')
  const eventKey = field(xml, 'EventKey')
  const openId = field(xml, 'FromUserName')
  if (!openId || !eventKey) return null
  if (event === 'subscribe' && eventKey.startsWith('qrscene_')) {
    return { openId, scene: eventKey.slice('qrscene_'.length), event }
  }
  if (event === 'SCAN') return { openId, scene: eventKey, event }
  return null
}
```

- [ ] **Step 5: Run the focused tests**

Run:

```powershell
node --test tests/wechat-auth-signature.test.mjs tests/wechat-auth-event.test.mjs
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit callback validation primitives**

```powershell
git add tests/wechat-auth-signature.test.mjs tests/wechat-auth-event.test.mjs tools/wechat-auth-poc/wechat-signature.mjs tools/wechat-auth-poc/wechat-event.mjs
git commit -m "feat: validate WeChat scan callbacks"
```

---

### Task 3: Implement expiring one-time login sessions

**Files:**
- Create: `tools/wechat-auth-poc/session-store.mjs`
- Create: `tests/wechat-auth-session.test.mjs`

- [ ] **Step 1: Write failing session lifecycle tests**

Create `tests/wechat-auth-session.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessionStore } from '../tools/wechat-auth-poc/session-store.mjs'

test('creates unpredictable sessions and resolves scenes exactly once', () => {
  let now = 1_000
  const store = createSessionStore({ now: () => now, ttlMs: 300_000, settleMs: 350 })
  const session = store.create()
  assert.match(session.id, /^[A-Za-z0-9_-]{40,}$/)
  assert.match(session.scene, /^[a-f0-9]{24}$/)
  assert.equal(store.status(session.id).status, 'waiting')
  assert.equal(store.markScanned(session.scene, 'openid-secret'), true)
  assert.equal(store.markScanned(session.scene, 'openid-secret'), false)
  assert.equal(store.status(session.id).status, 'scanned')
  now += 351
  const complete = store.status(session.id)
  assert.equal(complete.status, 'success')
  assert.match(complete.user, /^[a-f0-9]{12}$/)
  assert.equal(JSON.stringify(complete).includes('openid-secret'), false)
})

test('expires sessions and refuses unknown scenes', () => {
  let now = 5_000
  const store = createSessionStore({ now: () => now, ttlMs: 60_000 })
  const session = store.create()
  assert.equal(store.markScanned('not-a-scene', 'openid'), false)
  now += 60_001
  assert.equal(store.status(session.id).status, 'expired')
  assert.equal(store.markScanned(session.scene, 'openid'), false)
})

test('never returns secrets, scenes or full identifiers from public status', () => {
  const store = createSessionStore({ ttlMs: 60_000 })
  const session = store.create()
  const status = store.status(session.id)
  assert.deepEqual(Object.keys(status).sort(), ['expiresAt', 'status'])
  assert.equal(JSON.stringify(status).includes(session.scene), false)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
node --test tests/wechat-auth-session.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the in-memory session store**

Create `tools/wechat-auth-poc/session-store.mjs`:

```js
import { createHash, randomBytes } from 'node:crypto'

const publicStatus = (session, now, settleMs) => {
  if (session.status === 'waiting' && now >= session.expiresAt) session.status = 'expired'
  if (session.status === 'scanned' && now - session.scannedAt >= settleMs) session.status = 'success'
  const result = { status: session.status, expiresAt: session.expiresAt }
  if (session.status === 'success') result.user = session.userHash
  return result
}

export function createSessionStore({ now = Date.now, ttlMs = 300_000, settleMs = 1_500 } = {}) {
  const byId = new Map()
  const byScene = new Map()

  function create() {
    const id = randomBytes(32).toString('base64url')
    const scene = randomBytes(12).toString('hex')
    const session = { id, scene, status: 'waiting', expiresAt: now() + ttlMs, scannedAt: 0, userHash: '' }
    byId.set(id, session)
    byScene.set(scene, id)
    return { id, scene, expiresAt: session.expiresAt }
  }

  function markScanned(scene, openId) {
    const id = byScene.get(scene)
    const session = id && byId.get(id)
    if (!session || session.status !== 'waiting' || now() >= session.expiresAt) return false
    session.status = 'scanned'
    session.scannedAt = now()
    session.userHash = createHash('sha256').update(openId).digest('hex').slice(0, 12)
    byScene.delete(scene)
    return true
  }

  function status(id) {
    const session = byId.get(id)
    if (!session) return { status: 'missing' }
    return publicStatus(session, now(), settleMs)
  }

  return Object.freeze({ create, markScanned, status })
}
```

- [ ] **Step 4: Run the session tests**

Run:

```powershell
node --test tests/wechat-auth-session.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit session semantics**

```powershell
git add tests/wechat-auth-session.test.mjs tools/wechat-auth-poc/session-store.mjs
git commit -m "feat: add one-time WeChat login sessions"
```

---

### Task 4: Create and cache genuine WeChat parameterized QR tickets

**Files:**
- Create: `tools/wechat-auth-poc/wechat-client.mjs`
- Create: `tests/wechat-auth-client.test.mjs`

- [ ] **Step 1: Write failing API-client tests with a local fetch stub**

Create `tests/wechat-auth-client.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createWechatClient } from '../tools/wechat-auth-poc/wechat-client.mjs'

test('requests a temporary string-scene QR code and caches the access token', async () => {
  const requests = []
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    if (String(url).includes('/cgi-bin/token')) return Response.json({ access_token: 'access-a', expires_in: 7200 })
    return Response.json({ ticket: 'ticket value', expire_seconds: 300, url: 'http://weixin.qq.com/q/example' })
  }
  const client = createWechatClient({ appId: 'wx-a', appSecret: 'secret-a', fetchImpl, now: () => 1000 })
  const first = await client.createLoginQr('abcdef0123456789abcdef01', 300)
  const second = await client.createLoginQr('abcdef0123456789abcdef02', 300)
  assert.equal(requests.filter((request) => request.url.includes('/cgi-bin/token')).length, 1)
  assert.equal(first.imageUrl, 'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=ticket%20value')
  const body = JSON.parse(requests[1].options.body)
  assert.deepEqual(body, {
    expire_seconds: 300,
    action_name: 'QR_STR_SCENE',
    action_info: { scene: { scene_str: 'abcdef0123456789abcdef01' } }
  })
  assert.equal(second.expiresIn, 300)
})

test('surfaces WeChat API error codes without exposing the app secret', async () => {
  const fetchImpl = async () => Response.json({ errcode: 40013, errmsg: 'invalid appid' })
  const client = createWechatClient({ appId: 'wx-b', appSecret: 'do-not-print', fetchImpl })
  await assert.rejects(client.createLoginQr('abcdef0123456789abcdef01', 300), (error) => {
    assert.match(error.message, /40013/)
    assert.equal(error.message.includes('do-not-print'), false)
    return true
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
node --test tests/wechat-auth-client.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the API client**

Create `tools/wechat-auth-poc/wechat-client.mjs`:

```js
const API_BASE = 'https://api.weixin.qq.com'
const QR_IMAGE_BASE = 'https://mp.weixin.qq.com/cgi-bin/showqrcode'

async function json(response) {
  const body = await response.json()
  if (!response.ok || body.errcode) {
    throw new Error(`微信接口失败：${body.errcode ?? response.status} ${body.errmsg ?? response.statusText}`)
  }
  return body
}

export function createWechatClient({ appId, appSecret, fetchImpl = fetch, now = Date.now }) {
  let cached = null

  async function accessToken() {
    if (cached && now() < cached.expiresAt) return cached.value
    const url = new URL('/cgi-bin/token', API_BASE)
    url.searchParams.set('grant_type', 'client_credential')
    url.searchParams.set('appid', appId)
    url.searchParams.set('secret', appSecret)
    const body = await json(await fetchImpl(url))
    cached = { value: body.access_token, expiresAt: now() + Math.max(60, body.expires_in - 300) * 1000 }
    return cached.value
  }

  async function createLoginQr(scene, expireSeconds) {
    const token = await accessToken()
    const url = new URL('/cgi-bin/qrcode/create', API_BASE)
    url.searchParams.set('access_token', token)
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expire_seconds: expireSeconds,
        action_name: 'QR_STR_SCENE',
        action_info: { scene: { scene_str: scene } }
      })
    })
    const body = await json(response)
    return {
      imageUrl: `${QR_IMAGE_BASE}?ticket=${encodeURIComponent(body.ticket)}`,
      expiresIn: body.expire_seconds,
      issuedUrl: body.url
    }
  }

  return Object.freeze({ createLoginQr })
}
```

- [ ] **Step 4: Run the client tests**

Run:

```powershell
node --test tests/wechat-auth-client.test.mjs
```

Expected: 2 tests pass and no real network request is made.

- [ ] **Step 5: Commit the WeChat API client**

```powershell
git add tests/wechat-auth-client.test.mjs tools/wechat-auth-poc/wechat-client.mjs
git commit -m "feat: create WeChat parameterized QR tickets"
```

---

### Task 5: Expose separate local and public HTTP surfaces

**Files:**
- Create: `tools/wechat-auth-poc/http-utils.mjs`
- Create: `tools/wechat-auth-poc/local-handler.mjs`
- Create: `tools/wechat-auth-poc/callback-handler.mjs`
- Create: `tools/wechat-auth-poc/server.mjs`
- Create: `tests/wechat-auth-server.test.mjs`

- [ ] **Step 1: Write failing integration tests for listener isolation**

Create `tests/wechat-auth-server.test.mjs` with a fake QR client and ephemeral ports:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createPocServer } from '../tools/wechat-auth-poc/server.mjs'

const signature = (token, timestamp, nonce) => createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex')

test('keeps session APIs private and accepts a signed scan on the callback listener', async (t) => {
  const token = 'callback-token'
  const app = createPocServer({
    config: { appId: 'wx-test', appSecret: 'secret', callbackToken: token, localHost: '127.0.0.1', callbackHost: '127.0.0.1', localPort: 0, callbackPort: 0, sessionTtlMs: 60_000 },
    wechatClient: { createLoginQr: async () => ({ imageUrl: 'https://mp.weixin.qq.com/qr-test', expiresIn: 300 }) },
    logger: { info() {}, warn() {}, error() {} }
  })
  const addresses = await app.start()
  t.after(() => app.stop())

  const created = await fetch(`${addresses.local}/api/sessions`, { method: 'POST' }).then((response) => response.json())
  assert.equal(created.status, 'waiting')
  assert.equal((await fetch(`${addresses.callback}/api/sessions/${created.id}`)).status, 404)

  const timestamp = '1720000000'
  const nonce = '9090'
  const xml = `<xml><FromUserName><![CDATA[openid-real]]></FromUserName><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[SCAN]]></Event><EventKey><![CDATA[${created.sceneForTest}]]></EventKey></xml>`
  const callback = new URL('/wechat/callback', addresses.callback)
  callback.searchParams.set('timestamp', timestamp)
  callback.searchParams.set('nonce', nonce)
  callback.searchParams.set('signature', signature(token, timestamp, nonce))
  assert.equal((await fetch(callback, { method: 'POST', body: xml })).status, 200)

  const status = await fetch(`${addresses.local}/api/sessions/${created.id}`).then((response) => response.json())
  assert.equal(status.status, 'scanned')
  assert.equal(JSON.stringify(status).includes('openid-real'), false)
})

test('rejects invalid signatures and oversized callback bodies', async (t) => {
  const app = createPocServer({
    config: { appId: 'wx-test', appSecret: 'secret', callbackToken: 'token', localHost: '127.0.0.1', callbackHost: '127.0.0.1', localPort: 0, callbackPort: 0, sessionTtlMs: 60_000 },
    wechatClient: { createLoginQr: async () => ({ imageUrl: 'https://mp.weixin.qq.com/qr-test', expiresIn: 300 }) },
    logger: { info() {}, warn() {}, error() {} }
  })
  const addresses = await app.start()
  t.after(() => app.stop())
  const invalid = await fetch(`${addresses.callback}/wechat/callback?timestamp=1&nonce=2&signature=${'0'.repeat(40)}`, { method: 'POST', body: '<xml />' })
  assert.equal(invalid.status, 403)
  const large = await fetch(`${addresses.callback}/wechat/callback?timestamp=1&nonce=2&signature=${'0'.repeat(40)}`, { method: 'POST', body: 'x'.repeat(70_000) })
  assert.ok([403, 413].includes(large.status))
})
```

Expose `sceneForTest` only when `config.localPort === 0`, so production-style runs never reveal scenes through the local API.

- [ ] **Step 2: Run the server tests and confirm they fail**

Run:

```powershell
node --test tests/wechat-auth-server.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Add bounded HTTP helpers**

Create `tools/wechat-auth-poc/http-utils.mjs`:

```js
export function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' })
  response.end(body)
}

export function sendText(response, status, value) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  response.end(value)
}

export async function readBody(request, limit = 65_536) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('请求体过大'), { statusCode: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}
```

- [ ] **Step 4: Implement the callback-only handler**

Create `tools/wechat-auth-poc/callback-handler.mjs` exporting `createCallbackHandler({ callbackToken, sessionStore, logger })`. Its complete route behavior must be:

```js
import { verifyWechatSignature } from './wechat-signature.mjs'
import { parseWechatScanEvent } from './wechat-event.mjs'
import { readBody, sendText } from './http-utils.mjs'

export function createCallbackHandler({ callbackToken, sessionStore, logger }) {
  return async function callbackHandler(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname !== '/wechat/callback' || !['GET', 'POST'].includes(request.method)) return sendText(response, 404, 'Not Found')
    const signed = verifyWechatSignature({
      token: callbackToken,
      timestamp: url.searchParams.get('timestamp') || '',
      nonce: url.searchParams.get('nonce') || '',
      signature: url.searchParams.get('signature') || ''
    })
    if (!signed) return sendText(response, 403, 'Forbidden')
    if (request.method === 'GET') return sendText(response, 200, url.searchParams.get('echostr') || '')
    try {
      const event = parseWechatScanEvent(await readBody(request))
      if (event) {
        const accepted = sessionStore.markScanned(event.scene, event.openId)
        logger.info(accepted ? '收到并匹配微信扫码事件' : '收到未匹配或重复的微信扫码事件')
      }
      return sendText(response, 200, 'success')
    } catch (error) {
      logger.warn(`微信回调被拒绝：${error.message}`)
      return sendText(response, error.statusCode || 400, 'Bad Request')
    }
  }
}
```

- [ ] **Step 5: Implement the local-only handler**

Create `tools/wechat-auth-poc/local-handler.mjs`:

```js
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sendJson } from './http-utils.mjs'

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
])

function safeDetail(error) {
  return String(error?.message || '未知错误')
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .replace(/ticket=[^&\s]+/gi, 'ticket=[redacted]')
}

export function createLocalHandler({ sessionStore, wechatClient, publicDirectory, exposeTestScene = false }) {
  return async function localHandler(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { ok: true })

    if (request.method === 'POST' && url.pathname === '/api/sessions') {
      const session = sessionStore.create()
      try {
        const qr = await wechatClient.createLoginQr(session.scene, Math.round((session.expiresAt - Date.now()) / 1000))
        const body = { id: session.id, status: 'waiting', expiresAt: session.expiresAt, imageUrl: qr.imageUrl }
        if (exposeTestScene) body.sceneForTest = session.scene
        return sendJson(response, 201, body)
      } catch (error) {
        return sendJson(response, 502, { error: '无法生成微信登录二维码', detail: safeDetail(error) })
      }
    }

    const statusMatch = request.method === 'GET' && url.pathname.match(/^\/api\/sessions\/([A-Za-z0-9_-]+)$/)
    if (statusMatch) {
      const status = sessionStore.status(statusMatch[1])
      return sendJson(response, status.status === 'missing' ? 404 : 200, status)
    }

    const staticFile = request.method === 'GET' && staticFiles.get(url.pathname)
    if (staticFile) {
      try {
        const body = await readFile(join(publicDirectory, staticFile[0]))
        response.writeHead(200, { 'content-type': staticFile[1], 'content-length': body.length, 'cache-control': 'no-store' })
        return response.end(body)
      } catch {
        return sendJson(response, 500, { error: '验证页面文件缺失' })
      }
    }

    return sendJson(response, 404, { error: 'Not Found' })
  }
}
```

- [ ] **Step 6: Compose both listeners in `server.mjs`**

Create `tools/wechat-auth-poc/server.mjs`:

```js
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadConfig } from './config.mjs'
import { createSessionStore } from './session-store.mjs'
import { createWechatClient } from './wechat-client.mjs'
import { createLocalHandler } from './local-handler.mjs'
import { createCallbackHandler } from './callback-handler.mjs'
import { sendJson, sendText } from './http-utils.mjs'

const publicDirectory = fileURLToPath(new URL('./public', import.meta.url))

function listener(server, port, host) {
  return new Promise((resolveStart, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      const address = server.address()
      resolveStart(`http://${host}:${address.port}`)
    })
  })
}

function close(server) {
  return new Promise((resolveClose, reject) => {
    if (!server.listening) return resolveClose()
    server.close((error) => error ? reject(error) : resolveClose())
  })
}

export function createPocServer({ config, wechatClient, logger = console }) {
  const sessionStore = createSessionStore({ ttlMs: config.sessionTtlMs })
  const localHandler = createLocalHandler({
    sessionStore,
    wechatClient,
    publicDirectory,
    exposeTestScene: config.localPort === 0
  })
  const callbackHandler = createCallbackHandler({ callbackToken: config.callbackToken, sessionStore, logger })
  const localServer = createServer((request, response) => {
    Promise.resolve(localHandler(request, response)).catch((error) => {
      logger.error(`本地服务错误：${error.message}`)
      if (!response.headersSent) sendJson(response, 500, { error: '本地验证服务异常' })
      else response.destroy()
    })
  })
  const callbackServer = createServer((request, response) => {
    Promise.resolve(callbackHandler(request, response)).catch((error) => {
      logger.error(`回调服务错误：${error.message}`)
      if (!response.headersSent) sendText(response, 500, 'Internal Server Error')
      else response.destroy()
    })
  })

  return Object.freeze({
    async start() {
      const [local, callback] = await Promise.all([
        listener(localServer, config.localPort, config.localHost),
        listener(callbackServer, config.callbackPort, config.callbackHost)
      ])
      return { local, callback }
    },
    stop() {
      return Promise.all([close(localServer), close(callbackServer)])
    }
  })
}

async function main() {
  const config = loadConfig()
  const client = createWechatClient({ appId: config.appId, appSecret: config.appSecret })
  const app = createPocServer({ config, wechatClient: client })
  const addresses = await app.start()
  console.log(`本地验证页：${addresses.local}`)
  console.log(`微信回调端口：${new URL(addresses.callback).port}`)
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await app.stop()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (executedPath === import.meta.url) main().catch((error) => {
  console.error(`微信扫码验证服务启动失败：${error.message}`)
  process.exitCode = 1
})
```

- [ ] **Step 7: Run the server integration tests**

Run:

```powershell
node --test tests/wechat-auth-server.test.mjs
```

Expected: 2 tests pass; no external request is made.

- [ ] **Step 8: Commit the isolated dual-listener service**

```powershell
git add tests/wechat-auth-server.test.mjs tools/wechat-auth-poc/http-utils.mjs tools/wechat-auth-poc/local-handler.mjs tools/wechat-auth-poc/callback-handler.mjs tools/wechat-auth-poc/server.mjs
git commit -m "feat: add isolated WeChat auth POC service"
```

---

### Task 6: Build the responsive Chinese validation page

**Files:**
- Create: `tools/wechat-auth-poc/public/index.html`
- Create: `tools/wechat-auth-poc/public/app.js`
- Create: `tools/wechat-auth-poc/public/styles.css`
- Create: `tests/wechat-auth-ui.test.mjs`

- [ ] **Step 1: Write a failing structure test**

Create `tests/wechat-auth-ui.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../tools/wechat-auth-poc/public/index.html', import.meta.url), 'utf8')
const js = readFileSync(new URL('../tools/wechat-auth-poc/public/app.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../tools/wechat-auth-poc/public/styles.css', import.meta.url), 'utf8')

test('validation page exposes every approved login state in Chinese', () => {
  for (const text of ['微信扫码登录', '等待扫码', '已扫码', '验证成功', '二维码已过期', '刷新二维码']) {
    assert.ok(html.includes(text) || js.includes(text), `missing ${text}`)
  }
  assert.match(html, /data-role="qr"/)
  assert.match(html, /data-role="status"/)
})

test('validation page polls locally and stops on terminal states', () => {
  assert.match(js, /fetch\('\/api\/sessions'/)
  assert.match(js, /setInterval/)
  assert.match(js, /clearInterval/)
  assert.match(js, /success|expired|error/)
})

test('validation page reflows without a fixed viewport layout', () => {
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.doesNotMatch(css, /100vh/)
  assert.doesNotMatch(css, /position:\s*fixed/)
})
```

- [ ] **Step 2: Run the UI test and confirm it fails**

Run:

```powershell
node --test tests/wechat-auth-ui.test.mjs
```

Expected: FAIL because the public files do not exist.

- [ ] **Step 3: Create the semantic page structure**

Create `tools/wechat-auth-poc/public/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>摸鱼大师 - 微信扫码验证</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="login-shell">
      <section class="brand-panel" aria-label="摸鱼大师登录说明">
        <div class="brand-mark" aria-hidden="true">鱼</div>
        <h1>MoYuMaster</h1>
        <p>扫码验证后继续使用</p>
        <ul>
          <li>二维码短时有效</li>
          <li>一次扫码只对应一次登录</li>
          <li>微信密钥不会进入客户端</li>
        </ul>
      </section>
      <section class="login-panel" aria-labelledby="login-title">
        <h2 id="login-title">微信扫码登录</h2>
        <p class="hint">打开微信，扫描下方公众号二维码</p>
        <div class="qr-frame">
          <img data-role="qr" alt="微信登录二维码" hidden>
          <div class="qr-placeholder" data-role="qr-placeholder">正在生成二维码</div>
          <div class="qr-overlay" data-role="qr-overlay" hidden></div>
        </div>
        <div class="status" data-role="status" role="status" aria-live="polite">
          <strong>正在初始化</strong>
          <span>正在连接本地验证服务</span>
        </div>
        <button data-action="refresh" type="button" hidden>刷新二维码</button>
        <p class="privacy">本验证不会读取昵称、头像或手机号</p>
      </section>
    </main>
    <script type="module" src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Implement deterministic polling and state rendering**

Create `tools/wechat-auth-poc/public/app.js`:

```js
const messages = {
  initializing: ['正在初始化', '正在连接本地验证服务'],
  waiting: ['等待扫码', '二维码将在 5 分钟内失效'],
  scanned: ['已扫码', '正在核对本次登录会话'],
  success: ['验证成功', '微信扫码身份已确认'],
  expired: ['二维码已过期', '请刷新二维码后重新扫描'],
  error: ['验证未完成', '请检查测试号、网络和回调配置']
}

const qr = document.querySelector('[data-role="qr"]')
const placeholder = document.querySelector('[data-role="qr-placeholder"]')
const overlay = document.querySelector('[data-role="qr-overlay"]')
const status = document.querySelector('[data-role="status"]')
const title = status.querySelector('strong')
const detail = status.querySelector('span')
const refresh = document.querySelector('[data-action="refresh"]')

let sessionId = ''
let timer = null

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

function render(state, payload = {}) {
  const message = messages[state] || messages.error
  title.textContent = message[0]
  detail.textContent = payload.detail || (state === 'success' && payload.user ? `微信用户标识：${payload.user}` : message[1])
  const terminal = ['success', 'expired', 'error'].includes(state)
  overlay.hidden = !terminal
  overlay.textContent = terminal ? message[0] : ''
  refresh.hidden = !['expired', 'error'].includes(state)
  document.body.dataset.state = state
  if (terminal) stopPolling()
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail || body.error || `HTTP ${response.status}`)
  return body
}

async function poll() {
  if (!sessionId) return
  try {
    const current = await readJson(await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: 'no-store' }))
    render(current.status, current)
  } catch (error) {
    render('error', { detail: `状态查询失败：${error.message}` })
  }
}

async function createSession() {
  stopPolling()
  sessionId = ''
  qr.hidden = true
  qr.removeAttribute('src')
  placeholder.hidden = false
  overlay.hidden = true
  refresh.hidden = true
  render('initializing')
  try {
    const created = await readJson(await fetch('/api/sessions', { method: 'POST' }))
    sessionId = created.id
    qr.src = created.imageUrl
    qr.hidden = false
    placeholder.hidden = true
    render('waiting', created)
    timer = setInterval(poll, 1000)
  } catch (error) {
    placeholder.hidden = true
    render('error', { detail: `二维码生成失败：${error.message}` })
  }
}

refresh.addEventListener('click', createSession)
window.addEventListener('pagehide', stopPolling)
createSession()
```

Do not use `innerHTML` for server-provided text. Set `textContent` and element attributes only.

- [ ] **Step 5: Implement the approved responsive appearance**

Create `tools/wechat-auth-poc/public/styles.css`:

```css
:root {
  color-scheme: light;
  --page: #eef5f1;
  --panel: #ffffff;
  --brand: #e3f5eb;
  --text: #18231d;
  --muted: #69756e;
  --line: #d9e5de;
  --green: #07c160;
  --green-dark: #068f48;
  --danger: #b42318;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-width: 320px;
  padding: clamp(16px, 4vw, 48px);
  color: var(--text);
  background: var(--page);
  font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
}

button, img { font: inherit; }

.login-shell {
  display: grid;
  grid-template-columns: minmax(240px, .85fr) minmax(360px, 1.15fr);
  width: min(920px, 100%);
  min-height: 540px;
  margin: 0 auto;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 20px 60px rgb(17 45 30 / 12%);
}

.brand-panel, .login-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(28px, 5vw, 52px);
}

.brand-panel { background: var(--brand); }
.brand-mark {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  color: #ffffff;
  background: var(--green);
  border-radius: 16px;
  font-weight: 700;
}

h1, h2 { margin: 16px 0 8px; font-weight: 600; }
p { margin: 0; }
.brand-panel p, .hint, .privacy { color: var(--muted); }
.brand-panel ul { display: grid; gap: 12px; margin: 28px 0 0; padding-left: 20px; }
.login-panel { align-items: center; text-align: center; }

.qr-frame {
  position: relative;
  display: grid;
  width: 210px;
  height: 210px;
  margin: 24px 0 18px;
  place-items: center;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.qr-frame img { display: block; width: 100%; height: 100%; object-fit: contain; }
.qr-placeholder { color: var(--muted); }
.qr-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  color: #ffffff;
  background: rgb(16 24 20 / 82%);
  font-weight: 600;
}
.qr-overlay[hidden], [hidden] { display: none !important; }

.status { display: grid; min-height: 50px; gap: 5px; }
.status strong { font-weight: 600; }
.status span, .privacy { font-size: 14px; color: var(--muted); }
.privacy { margin-top: 18px; }

button {
  min-height: 42px;
  margin-top: 14px;
  padding: 0 20px;
  color: #ffffff;
  background: var(--green);
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}
button:hover { background: var(--green-dark); }
button:focus-visible { outline: 3px solid rgb(7 193 96 / 28%); outline-offset: 2px; }
body[data-state="error"] .status strong { color: var(--danger); }

@media (max-width: 720px) {
  body { padding: 12px; }
  .login-shell { grid-template-columns: 1fr; min-height: 0; }
  .brand-panel { display: none; }
  .login-panel { padding: 28px 18px; }
}
```

- [ ] **Step 6: Run the UI structure tests**

Run:

```powershell
node --test tests/wechat-auth-ui.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit the validation UI**

```powershell
git add tests/wechat-auth-ui.test.mjs tools/wechat-auth-poc/public/index.html tools/wechat-auth-poc/public/app.js tools/wechat-auth-poc/public/styles.css
git commit -m "feat: add WeChat QR validation page"
```

---

### Task 7: Add Windows startup and human-readable operating instructions

**Files:**
- Create: `tools/wechat-auth-poc/start-tunnel.ps1`
- Create: `tools/wechat-auth-poc/README.md`

- [ ] **Step 1: Add the callback-only tunnel script**

Create `tools/wechat-auth-poc/start-tunnel.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$callbackPort = 8788
$envPath = Join-Path $PSScriptRoot '.env'
if (Test-Path -LiteralPath $envPath) {
  $portLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^WECHAT_CALLBACK_PORT=' } | Select-Object -First 1
  if ($portLine) { $callbackPort = [int]($portLine -replace '^WECHAT_CALLBACK_PORT=', '') }
}
$cloudflared = Get-Command cloudflared -ErrorAction Stop
Write-Host "正在创建微信回调临时隧道：http://127.0.0.1:$callbackPort"
Write-Host '看到 https://*.trycloudflare.com 后，请把其后追加 /wechat/callback 配置到测试号后台。'
& $cloudflared.Source tunnel --url "http://127.0.0.1:$callbackPort" --no-autoupdate
```

- [ ] **Step 2: Write the exact operator procedure**

Create `tools/wechat-auth-poc/README.md` with these sections and commands:

1. “此实验会验证什么”和“不代表什么”。
2. 申请微信公众平台接口测试号，记录 AppID 和 AppSecret，但不要发到聊天中。
3. Copy and edit local secrets:

```powershell
Copy-Item tools/wechat-auth-poc/.env.example tools/wechat-auth-poc/.env
notepad tools/wechat-auth-poc/.env
```

4. Generate a random callback token locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
```

5. Start the local service:

```powershell
npm run wechat-auth:poc
```

6. In a second terminal, start the callback tunnel:

```powershell
npm run wechat-auth:tunnel
```

7. Copy the emitted `https://*.trycloudflare.com`, append `/wechat/callback`, and configure that URL plus the same callback token in the test-account interface. Select plaintext mode for the proof of concept.
8. Open `http://127.0.0.1:8787`, scan the displayed QR code, and observe `waiting → scanned → success`.
9. Stop both terminals with `Ctrl+C` and confirm the temporary URL no longer reaches the callback.
10. Troubleshooting table for missing credentials, callback verification failure, WeChat error codes, QR permission rejection, expired QR, and disconnected tunnel.

- [ ] **Step 3: Run PowerShell syntax parsing without launching the tunnel**

Run:

```powershell
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'tools/wechat-auth-poc/start-tunnel.ps1'), [ref]$null, [ref]$errors) | Out-Null
if ($errors.Count) { $errors | Format-List | Out-String | Write-Error } else { 'PowerShell syntax OK' }
```

Expected: `PowerShell syntax OK`. Do not start a tunnel in this automated step.

- [ ] **Step 4: Run every isolated proof-of-concept test**

Run:

```powershell
npm run test:wechat-auth-poc
```

Expected: all `wechat-auth-*` tests pass. No real WeChat API request is made by the automated suite.

- [ ] **Step 5: Commit scripts and operating guide**

```powershell
git add tools/wechat-auth-poc/start-tunnel.ps1 tools/wechat-auth-poc/README.md
git commit -m "docs: add WeChat auth POC runbook"
```

---

### Task 8: Complete the real test-account validation checkpoint

**Files:**
- Create after the run: `.artifacts/wechat-auth-poc/real-validation-summary.md` (ignored by Git)

- [ ] **Step 1: Ask the user to perform the account-owned actions**

The user must personally log into the WeChat test-account interface, obtain the AppID/AppSecret, save them in the local ignored `.env`, and configure the callback URL/token. Never ask them to paste AppSecret into chat or commit it.

- [ ] **Step 2: Start the local service and callback tunnel**

Run the service and tunnel in separate terminals with the commands documented in Task 7. Record the local URL, callback URL hostname, and start time only; do not record query strings, secrets, tokens, tickets, OpenIDs, or session IDs.

- [ ] **Step 3: Verify callback URL ownership**

Save the test-account interface only after the local callback listener and tunnel are both running. Expected: WeChat accepts the callback URL challenge. If it rejects the URL, capture the sanitized local error and stop; do not claim QR login feasibility.

- [ ] **Step 4: Perform the genuine scan**

Open `http://127.0.0.1:8787`, wait for a real WeChat QR image, and have the user scan it in WeChat. Expected visible sequence: `等待扫码 → 已扫码 → 验证成功`. Confirm the service log says the scan event matched without printing a full identifier.

- [ ] **Step 5: Check expiry and replay protection**

Create a second QR code and leave it unscanned beyond its configured validity; expected state is `expired`. Scan an already-consumed QR again or allow WeChat to redeliver the event; expected result is no second successful consumption and no new user record.

- [ ] **Step 6: Check forged callback rejection**

Run:

```powershell
try {
  Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:8788/wechat/callback?timestamp=1&nonce=2&signature=0000000000000000000000000000000000000000' -Body '<xml />' -ContentType 'application/xml'
  throw '伪造回调不应被接受'
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw }
  '伪造回调已按预期返回 403'
}
```

Expected: `伪造回调已按预期返回 403`.

- [ ] **Step 7: Record sanitized evidence**

Create `.artifacts/wechat-auth-poc/real-validation-summary.md` containing only:

```markdown
# 微信公众号扫码登录真实验证记录

- 验证日期：运行 `Get-Date -Format yyyy-MM-dd` 得到的日期
- 测试号回调 URL 校验：通过/失败
- 微信带参二维码生成：通过/失败
- 手机扫码事件送达：通过/失败
- 回调签名校验：通过/失败
- 会话场景匹配：通过/失败
- 页面自动进入成功：通过/失败
- 过期保护：通过/失败
- 重复事件幂等：通过/失败
- 伪造签名拒绝：通过/失败
- 结论：只有全部通过时填写“最小真实链路可行”
```

Write the command result and each observed pass/fail value into the file. Do not include screenshots that expose credentials or complete identifiers.

- [ ] **Step 8: Shut down and confirm temporary exposure is gone**

Stop the service and tunnel with `Ctrl+C`. Request the temporary callback URL once more; expected result is unreachable or a Cloudflare tunnel-not-found response. Confirm no `cloudflared` process launched for this proof of concept remains.

- [ ] **Step 9: Mark the code checkpoint only after real evidence exists**

If and only if all acceptance items pass, create an annotated tag:

```powershell
git tag -a wechat-auth-poc-verified -m "Verified real WeChat test-account QR login callback"
```

If any real acceptance item fails, do not create the tag. Keep the sanitized evidence file, identify the exact external boundary that failed, and decide whether to adjust the proof of concept or stop.

---

## Self-review results

- Spec coverage: isolated code, dual listener boundary, real parameterized QR, callback verification, event normalization, TTL, replay protection, redacted OpenID, Chinese UI states, expiry, failure handling, runbook, genuine scan evidence, and shutdown are each mapped to a task.
- Scope boundary: no task modifies the production Electron login page or token storage.
- Placeholder scan: implementation steps contain concrete paths, APIs, commands, expected results, and code; credentials remain intentionally local and blank in `.env.example`.
- Type consistency: `session.id`, `session.scene`, `expiresAt`, `status`, and the public status values are consistent across store, handlers, UI, and tests.
- External boundary: automated tests use stubs; only Task 8 can prove that the current test account actually grants QR-ticket access and delivers real scan events.
