const Helper = require('./helper') // must be first
const sodium = require('sodium-native')
const fetch = require('bare-fetch')
const { test, hook } = require('brittle')
const Bridge = require('..')

const noop = () => {}

const entries = new Map()
const files = new Map()
const findFile = ({ seq }) => {
  for (const [k, v] of files.entries()) {
    if (k.seq === seq) return v
  }
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
      get: async (data) =>
        (typeof data.key === 'string'
          ? files.get(data.key)
          : findFile(data.key)) || null,
      versions: async () => ({ app: { fork: 0, length: 100, key: 'key' } }),
      entry: async (data) => entries.get(data.key) || null
    },
    teardown: (fn) => {
      teardowns.push(fn)
    }
  })
  const ipc = await Helper.startIpcClient()

  teardowns.push(
    await Helper.rig({
      ipc,
      state: { config: { id: '0@a', name: 'pear-bridge' } }
    })
  )
})

test('should get existing file', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/index.html', 'hello world')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`,
    { headers }
  )

  t.is(response.status, 200, 'GET request should return status 200')
  t.is(
    await response.text(),
    'hello world',
    'GET request should return correct content'
  )
})

test('should return 404 with missing file', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`,
    { headers }
  )

  t.is(response.status, 404, 'should return status 404')
  const text = await response.text()
  t.is(text, 'null', 'should return no content')
})

test('should return 404 with missing file and not-found fallback', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('node_modules/pear-bridge/not-found.html', 'not found fallback')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`,
    { headers }
  )

  t.is(response.status, 404, 'should return status 404')
  t.is(await response.text(), 'not found fallback', 'should return no content')
})

test('should handle missing x-pear header', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`
  )

  t.is(
    response.status,
    400,
    'should return status 400 for missing x-pear header'
  )
  t.ok(
    response.headers.get('content-type').includes('text/plain'),
    'should have plain text content type for errors'
  )
})

test('should handle invalid x-pear header', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`,
    {
      headers: { 'x-pear': 'Invalid' }
    }
  )

  t.is(
    response.status,
    400,
    'should return status 400 for invalid x-pear header'
  )
  t.ok(
    response.headers.get('content-type').includes('text/plain'),
    'should have plain text content type for errors'
  )
})

test('should handle devtools requests (+app+map)', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/index.js', 'console.log("test")')
  const fileNode = {
    seq: 1,
    key: '/index.js',
    value: { metadata: { type: 'commonjs', resolutions: [] } }
  }
  files.set(fileNode, 'console.log("test")')
  entries.set('/index.js', fileNode)
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.js+app+map`
  )

  t.is(response.status, 200, 'devtools request should return 200')
})

test('should handle unknown protocol', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html+unknown+type`,
    { headers }
  )

  t.is(response.status, 400, 'should return status 400 for unknown protocol')
  t.ok(
    response.headers.get('content-type').includes('text/plain'),
    'should have plain text content type for errors'
  )
})

test('should serve javascript files with correct content type', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/script.js', 'console.log("test")')
  const fileNode = {
    seq: 1,
    key: '/script.js',
    value: { metadata: { type: 'commonjs', resolutions: [] } }
  }
  files.set(fileNode, 'console.log("test")')
  entries.set('/script.js', fileNode)
  t.teardown(() => {
    files.clear()
  })
  t.teardown(() => {
    entries.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/script.js`,
    { headers }
  )

  t.ok(response.status === 200, 'should return status 200')
  t.ok(
    response.headers.get('content-type').includes('application/javascript'),
    'should have correct content type'
  )

  t.ok(
    (await response.text()).includes('sourceURL'),
    'should have processed the js file'
  )
})

test('should serve HTML files with correct content type', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/page.html', '<html><body>test</body></html>')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/page.html`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.ok(
    response.headers.get('content-type').includes('text/html'),
    'should have correct content type'
  )
  t.is(
    await response.text(),
    '<html><body>test</body></html>',
    'should return correct HTML content'
  )
})

test('should serve CSS files with correct content type', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/style.css', 'body { color: red; }')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/style.css`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.ok(
    response.headers.get('content-type').includes('text/css'),
    'should have correct content type'
  )
  t.is(
    await response.text(),
    'body { color: red; }',
    'should return correct CSS content'
  )
})

test('should serve JSON files with correct content type', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/data.json', '{"test": "value"}')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/data.json`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.ok(
    response.headers.get('content-type').includes('application/json'),
    'should have correct content type for JSON'
  )
  t.ok(
    response.headers.get('content-type').includes('charset=utf-8'),
    'should include UTF-8 charset'
  )
  t.is(
    await response.text(),
    '{"test": "value"}',
    'should return correct JSON content'
  )
})

test('should handle root path redirect to index.html', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/index.html', '<html><body>root page</body></html>')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.is(
    await response.text(),
    '<html><body>root page</body></html>',
    'should serve index.html for root path'
  )
})

test('should handle file extension fallback (.html)', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/page.html', '<html><body>page content</body></html>')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/page`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.is(
    await response.text(),
    '<html><body>page content</body></html>',
    'should serve .html file for path without extension'
  )
})

test('should handle index.html fallback for directories', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/folder/index.html', '<html><body>folder index</body></html>')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/folder`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.is(
    await response.text(),
    '<html><body>folder index</body></html>',
    'should serve index.html for directory path'
  )
})

test('should handle resolve protocol', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/test.js', 'console.log("test")')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/test.js+resolve`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.ok(
    response.headers.get('content-type').includes('text/plain'),
    'should have plain text content type'
  )
  t.is(
    await response.text(),
    '/test.js',
    'should return file path for resolve protocol'
  )
})

test('should handle binary files', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  files.set('/image.png', binaryData)
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/image.png`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.ok(
    response.headers.get('content-type').includes('image/png'),
    'should have correct content type for PNG'
  )
  t.is(
    await response.text(),
    binaryData.toString(),
    'should return correct binary data'
  )
})

test('should handle files with no extension', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/LICENSE', 'MIT License content')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/LICENSE`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.ok(
    response.headers.get('content-type').includes('application/octet-stream'),
    'should default to octet-stream'
  )
  t.is(
    await response.text(),
    'MIT License content',
    'should return correct content'
  )
})

test('should use mount option for file lookups', async function (t) {
  const bridge = new Bridge({
    ipc: Helper.socketPath,
    mount: '/ui'
  })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/ui/index.html', 'mounted content')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/index.html`,
    { headers }
  )

  t.is(response.status, 200, 'should find file with under mount prefix')
  t.is(
    await response.text(),
    'mounted content',
    'should return correct content'
  )
})

test('should use bypass option to skip mount for certain paths', async function (t) {
  const bridge = new Bridge({
    ipc: Helper.socketPath,
    mount: '/ui',
    bypass: ['/node_modules']
  })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/node_modules/package.json', '{"name": "test-package"}')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/node_modules/package.json`,
    { headers }
  )

  t.is(response.status, 200, 'should find file bypassing mount prefix')
  t.is(
    await response.text(),
    '{"name": "test-package"}',
    'should return content from bypassed location'
  )
})

test('should use waypoint for unmatched HTML requests', async function (t) {
  const bridge = new Bridge({
    ipc: Helper.socketPath,
    waypoint: '/fallback.html'
  })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/fallback.html', '<html><body>Not Found Page</body></html>')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/nonexistent.html`,
    { headers }
  )

  t.is(response.status, 200, 'should return waypoint for missing HTML files')
  t.is(
    await response.text(),
    '<html><body>Not Found Page</body></html>',
    'should return waypoint content'
  )
})

test('should combine mount and waypoint options', async function (t) {
  const bridge = new Bridge({
    ipc: Helper.socketPath,
    mount: '/app',
    waypoint: '/index.html'
  })
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/app/index.html', '<html><body>App SPA</body></html>')
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/some/route.html`,
    { headers }
  )

  t.is(
    response.status,
    200,
    'should return waypoint for missing HTML files with mount'
  )
  t.is(
    await response.text(),
    '<html><body>App SPA</body></html>',
    'should return waypoint content from mounted location'
  )
})

test('should handle large file requests', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  const largeContent = 'x'.repeat(100_000_000)
  files.set('/large.txt', largeContent)
  t.teardown(() => {
    files.clear()
  })

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/large.txt`,
    { headers }
  )

  t.is(response.status, 200, 'should return status 200')
  t.is(
    (await response.text()).length,
    100_000_000,
    'should serve complete large file'
  )
})

test('should handle concurrent requests', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  files.set('/file1.txt', 'content1')
  files.set('/file2.txt', 'content2')
  files.set('/file3.txt', 'content3')
  t.teardown(() => {
    files.clear()
  })

  const requests = [
    fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/file1.txt`, {
      headers
    }),
    fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/file2.txt`, {
      headers
    }),
    fetch(`http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/file3.txt`, {
      headers
    })
  ]

  const responses = await Promise.all(requests)

  t.is(responses[0].status, 200, 'first request should succeed')
  t.is(responses[1].status, 200, 'second request should succeed')
  t.is(responses[2].status, 200, 'third request should succeed')

  t.is(
    await responses[0].text(),
    'content1',
    'first response should have correct content'
  )
  t.is(
    await responses[1].text(),
    'content2',
    'second response should have correct content'
  )
  t.is(
    await responses[2].text(),
    'content3',
    'third response should have correct content'
  )
})

test('should handle malformed URLs gracefully', async function (t) {
  const bridge = new Bridge()
  await bridge.ready()
  t.teardown(() => bridge.close())

  const response = await fetch(
    `http://${bridge.host ?? '127.0.0.1'}:${bridge.port}/%invalid%url%`,
    { headers }
  )

  t.ok(response.status, 400, 'should return 400 for malformed URLs')
  t.ok(
    (await response.text()).includes('Malformed URL:'),
    'should return error message for malformed URL'
  )
})

test('server port is deterministic with app key', async function (t) {
  const buf = Buffer.allocUnsafe(32)
  sodium.randombytes_buf(buf)
  global.Pear.app.key = buf
  global.Pear.app.dir = null

  const bridgeA = new Bridge()
  await bridgeA.ready()
  const portA = bridgeA.port
  await bridgeA.close()

  const bridgeB = new Bridge()
  await bridgeB.ready()
  const portB = bridgeB.port
  await bridgeB.close()

  t.is(portA, portB)

  const bufB = Buffer.allocUnsafe(32)
  sodium.randombytes_buf(bufB)
  global.Pear.app.key = bufB

  const bridgeC = new Bridge()
  await bridgeC.ready()
  const portC = bridgeC.port
  await bridgeC.close()

  t.not(portC, portB)

  t.teardown(() => {
    global.Pear.app.key = null
    global.Pear.app.dir = null
  })
})

test('server port is deterministic without app key', async function (t) {
  global.Pear.app.key = null
  global.Pear.app.dir = '/app/path'

  const bridgeA = new Bridge()
  await bridgeA.ready()
  const portA = bridgeA.port
  await bridgeA.close()

  const bridgeB = new Bridge()
  await bridgeB.ready()
  const portB = bridgeB.port
  await bridgeB.close()

  t.is(portA, portB)

  global.Pear.app.dir = '/app/path-b'

  const bridgeC = new Bridge()
  await bridgeC.ready()
  const portC = bridgeC.port
  await bridgeC.close()

  t.not(portC, portB)

  t.teardown(() => {
    global.Pear.app.key = null
    global.Pear.app.dir = null
  })
})

test('can run two bridges with key', async function (t) {
  const buf = Buffer.allocUnsafe(32)
  sodium.randombytes_buf(buf)
  global.Pear.app.key = buf
  global.Pear.app.dir = null

  const bridgeA = new Bridge()
  await bridgeA.ready()
  const portA = bridgeA.port

  const bridgeB = new Bridge()
  await bridgeB.ready()
  const portB = bridgeB.port

  t.not(portA, portB)

  t.teardown(() => {
    bridgeA.close()
    bridgeB.close()
    global.Pear.app.key = null
    global.Pear.app.dir = null
  })
})

test('can run two bridges without key', async function (t) {
  const buf = Buffer.allocUnsafe(32)
  sodium.randombytes_buf(buf)
  global.Pear.app.key = null
  global.Pear.app.dir = '/app/path'

  const bridgeA = new Bridge()
  await bridgeA.ready()
  const portA = bridgeA.port

  const bridgeB = new Bridge()
  await bridgeB.ready()
  const portB = bridgeB.port

  t.not(portA, portB)

  t.teardown(() => {
    bridgeA.close()
    bridgeB.close()
    global.Pear.app.key = null
    global.Pear.app.dir = null
  })
})

test('bridge port is random if key and dir are null', async function (t) {
  global.Pear.app.key = null
  global.Pear.app.dir = null

  const bridge = new Bridge()
  await bridge.ready()

  t.ok(bridge.port > 1000 && bridge.port < 65536)

  t.teardown(() => {
    bridge.close()
    global.Pear.app.key = null
    global.Pear.app.dir = null
  })
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
