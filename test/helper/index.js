const { isWindows } = require('which-runtime')
const IPC = require('pear-ipc')
const path = require('path')

const noop = () => {}

global.Pear = new (class API {
  static REF = null
})()
global.Pear.constructor.REF = require('pear-ref')

module.exports = class Helper {
  static socketPath = isWindows ? '\\\\.\\pipe\\pear-api-test-ipc' : 'test.sock'

  static async startIpcServer({ handlers, teardown }) {
    const server = new IPC.Server({ socketPath: this.socketPath, handlers })
    teardown(() => server.close())
    await server.ready()
    return server
  }

  static async startIpcClient() {
    const client = new IPC.Client({ socketPath: this.socketPath })
    await client.ready()
    return client
  }

  static async rig({
    ipc = { ref: noop, unref: noop },
    state = {},
    runtimeArgv
  } = {}) {
    if (global.Pear?.constructor?.RTI) {
      throw Error('Prior Pear global not cleaned up')
    }

    class RigAPI {
      static REF = global.Pear.constructor.REF
      static RTI = { checkout: { key: __dirname, length: null, fork: null } }
    }
    global.Pear = new RigAPI()

    const { default: API } = await import('pear-api')
    class TestAPI extends API {
      static RUNTIME = (global.Bare ?? global.process).argv[0]
      static RUNTIME_ARGV = runtimeArgv ?? [path.join(__dirname, 'run.js')]
      static RTI = RigAPI.RTI
    }

    const program = global.Bare ?? global.process
    const argv = [...program.argv]
    program.argv.length = 0
    program.argv.push('pear', 'run', ...argv.slice(1))
    global.Pear = new TestAPI(ipc, state)

    return () => {
      program.argv.length = 0
      program.argv.push(...argv)
      global.Pear = null
    }
  }
}
