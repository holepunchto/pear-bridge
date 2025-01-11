'use strict'
const test = require('brittle')
const Mime = require('../mime')

const testMappings = [
  { file: '', mimeType: 'application/javascript; charset=utf-8' }, // default to js
  { file: '/path/to/file.aaa', mimeType: 'application/octet-stream' }, // unknown extension
  { file: '/path/to/file.js', mimeType: 'application/javascript; charset=utf-8' }, // from text/javascript
  { file: '/path/to/file.mjs', mimeType: 'application/javascript; charset=utf-8' }, // from text/javascript
  { file: '/path/to/file.cjs', mimeType: 'application/javascript; charset=utf-8' }, // from application/node
  { file: '/path/to/file.html', mimeType: 'text/html; charset=utf-8' }, // append charset=utf-8
  { file: '/path/to/file.htm', mimeType: 'text/html; charset=utf-8' }, // append charset=utf-8
  { file: '/path/to/file.shtml', mimeType: 'text/html; charset=utf-8' }, // append charset=utf-8
  { file: '/path/to/file.json', mimeType: 'application/json; charset=utf-8' }, // append charset=utf-8
  { file: '/path/to/file.map', mimeType: 'application/json; charset=utf-8' }, // append charset=utf-8
  { file: '/path/to/file.mp4', mimeType: 'video/mp4' } // no change
]

test('check mimeType', async (t) => {
  t.plan(testMappings.length)
  const mime = new Mime()
  testMappings.forEach(({ file, mimeType }) => {
    t.is(mime.type(file), mimeType)
  })
})
