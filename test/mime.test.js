'use strict'
const test = require('brittle')
const Mime = require('../mime')
const db = require('mime-db')

// ref. https://cdn.jsdelivr.net/gh/jshttp/mime-db@master/db.json
const mime = new Mime()

test('default to js', async (t) => {
  t.plan(1)
  t.is(mime.type(''), 'application/javascript; charset=utf-8')
})

test('unknown extension', async (t) => {
  t.plan(1)
  t.is(mime.type('/path/to/file.aaa'), 'application/octet-stream')
})

test('convert application/node to application/javascript', async (t) => {
  t.plan(1)
  t.is(mime.type('/path/to/file.cjs'), 'application/javascript; charset=utf-8')
})

test('convert text/javascript to application/javascript', async (t) => {
  const files = ['/path/to/file.js', '/path/to/file.mjs']
  t.plan(files.length)
  files.forEach((file) => {
    t.is(mime.type(file), 'application/javascript; charset=utf-8')
  })
})

test('append charset=utf-8 for application/javascript', async (t) => {
  const files = ['', '/path/to/file.cjs', '/path/to/file.js', '/path/to/file.mjs']
  t.plan(files.length)
  files.forEach((file) => {
    t.is(mime.type(file), 'application/javascript; charset=utf-8')
  })
})

test('append charset=utf-8 for text/html', async (t) => {
  const files = ['/path/to/file.html', '/path/to/file.htm', '/path/to/file.shtml']
  t.plan(files.length)
  files.forEach((file) => {
    t.is(mime.type(file), 'text/html; charset=utf-8')
  })
})

test('append charset=utf-8 for application/json', async (t) => {
  const files = ['/path/to/file.json', '/path/to/file.map']
  t.plan(files.length)
  files.forEach((file) => {
    t.is(mime.type(file), 'application/json; charset=utf-8')
  })
})

test('no change for others', async (t) => {
  const files = [
    { file: '/path/to/file.pdf', mimeType: 'application/pdf' },
    { file: '/path/to/file.zip', mimeType: 'application/zip' },
    { file: '/path/to/file.mp4', mimeType: 'video/mp4' }
  ]
  t.plan(files.length)
  files.forEach(({ file, mimeType }) => {
    t.is(mime.type(file), mimeType)
  })
})
