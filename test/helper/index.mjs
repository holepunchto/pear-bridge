import { isWindows } from 'which-runtime'
import IPC from 'pear-ipc'
import path from 'path'

const __filename = import.meta.url.replace('file://', '')
const __dirname = path.dirname(__filename)
const noop = () => {}

export default class Helper {
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
    if (global.Pear) {
      console.error(global.Pear)
      throw Error('Prior Pear global not cleaned up')
    }

    class RigAPI {
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
