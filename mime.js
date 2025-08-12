'use strict'
const getMimeType = require('get-mime-type')

module.exports = function getType (filepath) {
  let contentType = getMimeType(filepath.split('.').pop() || 'js')

  if (!contentType) return 'application/octet-stream'

  contentType = contentType.replace('application/node', 'application/javascript').replace('text/javascript', 'application/javascript')
  if (contentType === 'application/javascript' || contentType === 'text/html') contentType += '; charset=utf-8'

  return contentType
}
