'use strict'

class PearError extends require('pear-api/errors') {
  static ERR_HTTP_GONE = ERR_HTTP_GONE
  static ERR_HTTP_BAD_REQUEST = ERR_HTTP_BAD_REQUEST
  static ERR_HTTP_NOT_FOUND = ERR_HTTP_NOT_FOUND
}

function ERR_HTTP_GONE () {
  const err = new PearError('Gone', 'ERR_HTTP_GONE', ERR_HTTP_GONE)
  err.status = 410
  return err
}

function ERR_HTTP_BAD_REQUEST (msg = 'Bad Request') {
  const err = new PearError(msg, 'ERR_HTTP_BAD_REQUEST', ERR_HTTP_BAD_REQUEST)
  err.status = 400
  return err
}

function ERR_HTTP_NOT_FOUND (msg) {
  const err = new PearError(msg, 'ERR_HTTP_NOT_FOUND', ERR_HTTP_NOT_FOUND)
  err.status = 404
  return err
}

module.exports = PearError