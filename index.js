/* global Pear */
'use strict'
const http = require('bare-http1')
const ScriptLinker = require('script-linker')
const ReadyResource = require('ready-resource')
const streamx = require('streamx')
const listen = require('listen-async')
const gunk = require('pear-api/gunk')
const transform = require('pear-api/transform')
const Mime = require('./mime')
const { ERR_HTTP_BAD_REQUEST, ERR_HTTP_NOT_FOUND } = require('./errors')
const mime = new Mime()
const IPC = Pear[Pear.constructor.IPC]

class PearDrive {
  constructor (ipc) {
    this.ipc = ipc
  }

  get (key) {
    return this.ipc.get({ key })
  }

  entry (key) {
    return this.ipc.entry({ key })
  }

  compare (keyA, keyB) {
    return this.ipc.compare({ keyA, keyB })
  }
}

module.exports = class Http extends ReadyResource {
  constructor (opts = {}) {
    super()
    this.opts = opts
    this.mount = this.opts.mount ?? ''
    this.waypoint = this.opts.waypoint ?? null
    if (this.mount && this.mount[0] !== '/') this.mount = '/' + this.mount
    this.ipc = Pear[Pear.constructor.IPC]
    this.drive = new PearDrive(this.ipc)
    this.linker = new ScriptLinker(this.drive, {
      builtins: gunk.builtins,
      map: gunk.app.map,
      mapImport: gunk.app.mapImport,
      symbol: gunk.app.symbol,
      protocol: gunk.app.protocol,
      runtimes: gunk.app.runtimes
    })
    this.connections = new Set()
    this.server = http.createServer(async (req, res) => {
      try {
        const xPear = req.headers['x-pear']
        let isDevMode = false
        let config = null
        if (!xPear) {
          config = await IPC.config()
          // Devtools send header over user-agent
          console.log(config)
          isDevMode = ( req.headers['user-agent']?.includes('pear-runtime')) && config.dev
        }
        if ((!xPear || !xPear.startsWith('Pear')) && !isDevMode) throw ERR_HTTP_BAD_REQUEST()
        const [url, protocol = 'app', type = 'app'] = req.url.split('+')
        req.url = (url === '/') ? '/index.html' : url
        if (protocol !== 'app' && protocol !== 'resolve') {
          throw ERR_HTTP_BAD_REQUEST('Unknown protocol')
        }
        
        let id = null
        if (isDevMode) id = config.id
        else id = xPear.slice(5)

        await this.lookup(id, protocol, type, req, res)
      } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
          err.status = err.status || 404
        } else if (err.code === 'ERR_HTTP_NOT_FOUND') {
          err.status = err.status || 404
        } else if (err.code === 'SESSION_CLOSED') {
          err.status = err.status || 503
        } else {
          console.error('Unknown HTTP Server Error', err)
          err.status = 500
        }
        res.setHeader('Content-Type', 'text/plain')
        res.statusCode = err.status
        res.end(err.message)
      }
    })

    this.server.on('connection', (c) => {
      this.connections.add(c)
      c.on('close', () => this.connections.delete(c))
    })

    this.port = null
    this.unref()
  }

  unref () {
    this.server.unref()
  }

  ref () {
    this.server.ref()
  }

  async #notFound (req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.statusCode = 404
    const name = Pear.config.name
    const { app } = await Pear.versions()
    const locals = { url: req.url, name, version: `v.${app.fork}.${app.length}.${app.key}` }
    const stream = transform.stream(await this.ipc.get({ key: 'node_modules/pear-bridge/not-found.html' }), locals)
    return await streamx.pipelinePromise(stream, res)
  }

  async lookup (id, protocol, type, req, res) {
    try {
      const [, startId] = id.split('@')
      const reported = await this.ipc.reported({ startId })
      if (reported?.err) throw ERR_HTTP_NOT_FOUND('Not Found - ' + (reported.err.code || 'ERR_UNKNOWN') + ' - ' + reported.err.message)
      return await this.#lookup(protocol, type, req, res)
    } catch (err) {
      if (err.code === 'ERR_HTTP_NOT_FOUND') return await this.#notFound(req, res)
      throw err
    }
  }

  async #lookup (protocol, type, req, res) {
    const url = `${protocol}://${type}${req.url}`
    let link = null
    try { link = ScriptLinker.link.parse(url) } catch { throw ERR_HTTP_BAD_REQUEST(`Bad Request (Malformed URL: ${url})`) }
    if (link.filename !== null) link.filename = this.mount + link.filename
    const isImport = link.transform === 'esm' || link.transform === 'app'

    let builtin = false
    if (link.filename === null) {
      link.filename = await this.linker.resolve(link.resolve, link.dirname, { isImport })
      builtin = link.filename === link.resolve && this.linker.builtins.has(link.resolve)
    }

    let isJS = false
    if (protocol !== 'resolve') {
      const ct = mime.type(link.filename)

      // esm import of wasm returns the wasm file url
      if (ct === 'application/wasm' && link.transform === 'esm') {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        link.transform = 'wasm'
        const out = await this.linker.transform(link)
        res.end(out)
        return
      }

      res.setHeader('Content-Type', ct)
      if (link.transform === 'app') link.transform = 'esm'
      isJS = ct.slice(0, 22) === 'application/javascript'
      if (builtin) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        const out = await this.linker.transform(link)
        res.end(out)
        return
      }
    }

    if (await this.ipc.exists({ key: link.filename }) === false) {
      if (link.filename.endsWith('.html')) {
        if (this.waypoint) return this.#lookup(protocol, type, { __proto__: req, url: this.waypoint }, res)
      } else {
        const file = this.#lookup(protocol, type, { __proto__: req, url: req.url + '.html' }, res)
        const index = this.#lookup(protocol, type, { __proto__: req, url: req.url + '/index.html' }, res)
        const matches = await Promise.allSettled([file, index])
        if (matches[0].status === 'fulfilled' && this.waypoint !== matches[0].value) return matches[0]
        if (matches[1].status === 'fulfilled' && this.waypoint !== matches[1].value) return matches[1]
      }
      throw ERR_HTTP_NOT_FOUND(`Not Found: "${link.filename}"`)
    }

    if (protocol === 'resolve') {
      res.setHeader('Content-Type', 'text/plain; charset=UTF-8')
      if (!link.resolve && !link.dirname && !link.filename) throw ERR_HTTP_NOT_FOUND(`Not Found: "${req.url}"`)
      res.end(link.filename)
      return
    }

    const isSourceMap = link.transform === 'map'
    if (isJS || isSourceMap) {
      const out = await this.linker.transform(link)
      if (isSourceMap) res.setHeader('Content-Type', 'application/json')
      res.end(out)
    } else {
      if (protocol === 'app' && (link.filename.endsWith('.html') || link.filename.endsWith('.htm'))) {
        const mods = await this.linker.warmup(link.filename)
        const batch = []
        for (const [filename, mod] of mods) {
          if (mod.type === 'module') continue
          const source = mod.toCJS()
          batch.push({ filename, source })
        }
        await this.ipc.warmup({ protocol, batch })
      }

      const buffer = await this.ipc.get({ key: link.filename })
      if (buffer === null) throw new ERR_HTTP_NOT_FOUND(`Not Found: "${link.filename}"`)

      res.end(buffer)
    }
  }

  async _open () {
    await listen(this.server, 0, '127.0.0.1')
    this.port = this.server.address().port
    this.addr = 'http://localhost:' + this.port
  }

  async _close () {
    const serverClosing = new Promise((resolve) => this.server.close(resolve))
    for (const c of this.connections) c.destroy()
    await serverClosing
  }
}
