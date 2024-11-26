'use strict'
const gunk = require('pear-api/gunk')
const runtime = require('script-linker/runtime')

// platform runtime:
const pltsl = runtime({
  builtins: gunk.builtins,
  map: gunk.platform.map,
  mapImport: gunk.platform.mapImport,
  symbol: gunk.platform.symbol,
  protocol: gunk.platform.protocol,
  getSync (url) {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, false)
    xhr.send(null)
    return xhr.responseText
  },
  resolveSync (req, dirname, { isImport }) {
    const xhr = new XMLHttpRequest()
    const type = isImport ? 'esm' : 'cjs'
    const url = `${dirname}/~${req}+platform-resolve+${type}`
    xhr.open('GET', url, false)
    xhr.send(null)
    return xhr.responseText
  }
})

// app runtime:
const appsl = runtime({
  builtins: gunk.builtins,
  map: gunk.app.map,
  mapImport: gunk.app.mapImport,
  symbol: gunk.app.symbol,
  protocol: gunk.app.protocol,
  getSync (url) {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, false)
    xhr.send(null)
    return xhr.responseText
  },
  resolveSync (req, dirname, { isImport }) {
    const xhr = new XMLHttpRequest()
    const type = isImport ? 'esm' : 'cjs'
    const url = `${dirname}/~${req}+resolve+${type}`
    xhr.open('GET', url, false)
    xhr.send(null)
    if (xhr.status !== 200) throw new Error(`${xhr.status} ${xhr.responseText}`)
    return xhr.responseText
  }
})

async function warm () {
  for await (const { batch, protocol } of Pear[Pear.constructor.UI].warming()) {
    let sl = null
    if (protocol === 'pear' || protocol === 'holepunch') sl = pltsl
    if (protocol === 'app') sl = appsl
    if (sl === null) continue
    for (const { filename, source } of batch) sl.sources.set(filename, source)
  }
}

if (Pear.config.isDecal === false) warm().catch(console.error)