import fetch from 'bare-fetch'
import { test, hook } from 'brittle'

import Bridge from '../index.js'
import Helper from './helper/index.mjs'

const noop = () => {}

const entries = new Map()
const files = new Map()
files.find = ({ seq }) => {
  for (const [k, v] of files.entries()) { if (k.seq === seq) return v }
  return null
}
const headers = { 'x-pear': 'Pear 0' }

const teardowns = []
hook('setup rig', async function (t) {
  await Helper.startIpcServer({
    handlers: {
      reported: noop,
      warmup: noop,
      exists: async (data) => files.has(data.key),
      get: async (data) => (typeof data.key === 'string' ? files.get(data.key) : files.find(data.key)) || null,
      versions: async () => ({ app: { fork: 0, length: 100, key: 'key' } }),
      entry: async (data) => entries.get(data.key) || null
    },
    teardown: (fn) => { teardowns.push(fn) }
  })
  const ipc = await Helper.startIpcClient()

  teardowns.push(await Helper.rig({ ipc, state: { config: { name: 'pear-bridge' } } }))
})

test('should get existing file', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/index.html', 'hello world')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`, { headers })

  t.is(response.status, 200, 'GET request should return status 200')
  t.is(await response.text(), 'hello world', 'GET request should return correct content')
})

test('should return 404 with missing file', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`, { headers })

  t.is(response.status, 404, 'should return status 404')
  const text = await response.text()
  t.is(text, 'null', 'should return no content')
})

test('should return 404 with missing file and not-found fallback', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('node_modules/pear-bridge/not-found.html', 'not found fallback')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`, { headers })

  t.is(response.status, 404, 'should return status 404')
  t.is(await response.text(), 'not found fallback', 'should return no content')
})

test('should handle missing x-pear header', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`)

  console.log('response status', response.status)

  t.is(response.status, 400, 'should return status 400 for missing x-pear header')
  t.ok(response.headers.get('content-type').includes('text/plain'), 'should have plain text content type for errors')
})

test('should handle invalid x-pear header', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`, {
    headers: { 'x-pear': 'Invalid' }
  })

  t.is(response.status, 400, 'should return status 400 for invalid x-pear header')
  t.ok(response.headers.get('content-type').includes('text/plain'), 'should have plain text content type for errors')
})

test('should handle devtools requests (+app+map)', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/index.js', 'console.log("hello")')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.js+app+map`)

  t.ok(response.status >= 200 && response.status < 600, 'devtools request should return a valid HTTP status')
})

test('should handle unknown protocol', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html+unknown+type`, { headers })

  t.is(response.status, 400, 'should return status 400 for unknown protocol')
  t.ok(response.headers.get('content-type').includes('text/plain'), 'should have plain text content type for errors')
})

test('should serve javascript files with correct content type', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/script.js', 'console.log("test")')
  const fileNode = { seq: 1, key: '/index.js', value: { metadata: { type: 'commonjs', resolutions: [] } } }
  files.set(fileNode, 'console.log("test")')
  entries.set('/script.js', fileNode)
  t.teardown(() => { files.clear() })
  t.teardown(() => { entries.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/script.js`, { headers })

  t.ok(response.status === 200, 'should return status 200')
  t.ok(response.headers.get('content-type').includes('application/javascript'), 'should have correct content type')

  t.ok((await response.text()).includes('sourceURL'), 'should have processed the js file')
})

test('should serve HTML files with correct content type', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/page.html', '<html><body>test</body></html>')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/page.html`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.ok(response.headers.get('content-type').includes('text/html'), 'should have correct content type')
})

test('should serve CSS files with correct content type', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/style.css', 'body { color: red; }')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/style.css`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.ok(response.headers.get('content-type').includes('text/css'), 'should have correct content type')
})

test('should handle root path redirect to index.html', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/index.html', '<html><body>root page</body></html>')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.is(await response.text(), '<html><body>root page</body></html>', 'should serve index.html for root path')
})

test('should handle file extension fallback (.html)', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/page.html', '<html><body>page content</body></html>')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/page`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.is(await response.text(), '<html><body>page content</body></html>', 'should serve .html file for path without extension')
})

test('should handle index.html fallback for directories', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/folder/index.html', '<html><body>folder index</body></html>')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/folder`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.is(await response.text(), '<html><body>folder index</body></html>', 'should serve index.html for directory path')
})

test('should handle resolve protocol', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/test.js', 'console.log("test")')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/test.js+resolve`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.ok(response.headers.get('content-type').includes('text/plain'), 'should have plain text content type')
})

test('should handle binary files', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47])
  files.set('/image.png', binaryData)
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/image.png`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.ok(response.headers.get('content-type').includes('image/png'), 'should have correct content type for PNG')
})

test('should handle files with no extension', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/LICENSE', 'MIT License content')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/LICENSE`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.ok(response.headers.get('content-type').includes('application/octet-stream'), 'should default to octet-stream')
})

test('should handle JSON files with correct content type', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/data.json', '{"test": "value"}')
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/data.json`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.ok(response.headers.get('content-type').includes('application/json'), 'should have correct content type for JSON')
  t.ok(response.headers.get('content-type').includes('charset=utf-8'), 'should include UTF-8 charset')
})

test('should handle large file requests', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  const largeContent = 'x'.repeat(100_000_000)
  files.set('/large.txt', largeContent)
  t.teardown(() => { files.clear() })

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/large.txt`, { headers })

  t.is(response.status, 200, 'should return status 200')
  t.is((await response.text()).length, 100_000_000, 'should serve complete large file')
})

test('should handle concurrent requests', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/file1.txt', 'content1')
  files.set('/file2.txt', 'content2')
  files.set('/file3.txt', 'content3')
  t.teardown(() => { files.clear() })

  const requests = [
    fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/file1.txt`, { headers }),
    fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/file2.txt`, { headers }),
    fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/file3.txt`, { headers })
  ]

  const responses = await Promise.all(requests)

  t.is(responses[0].status, 200, 'first request should succeed')
  t.is(responses[1].status, 200, 'second request should succeed')
  t.is(responses[2].status, 200, 'third request should succeed')

  t.is(await responses[0].text(), 'content1', 'first response should have correct content')
  t.is(await responses[1].text(), 'content2', 'second response should have correct content')
  t.is(await responses[2].text(), 'content3', 'third response should have correct content')
})

test('should handle malformed URLs gracefully', async function (t) {
  const bridge = new Bridge({ ipc: Helper.socketPath })
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/%invalid%url%`, { headers })

  t.ok(response.status, 400, 'should return 400 for malformed URLs')
  t.ok((await response.text()).includes('Malformed URL:'), 'should return error message for malformed URL')
})

hook('teardown', async function (t) {
  for (const teardown of teardowns) {
    try {
      await teardown()
    } catch (err) {
      t.fail(`teardown should not throw: ${err.message}`)
    }
  }
})
