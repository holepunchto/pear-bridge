# pear-bridge

> Local HTTP Bridge for Pear Desktop Applications

For use with Pear User Interface libraries, such as `pear-electron`.

## Install

```sh
npm install pear-bridge
```

## Usage

The application entrypoint needs to instantiate the bridge and pass its info to the Pear User Interface Runtime Library.

The following example is with `pear-electron` but any compatible Pear UI Runtime Library should work in the same way:

```js
import Runtime from 'pear-electron'
import Bridge from 'pear-bridge'

const runtime = new Runtime()
await runtime.ready()

const server = new Bridge()
await server.ready()

const pipe = runtime.start({ info: server.info() })
Pear.teardown(() => pipe.end())
```

## API

### `new Bridge(opts) -> bridge`

#### Options

- `mount` - String. Mount path for lookups. Given `mount = '/ui` a URL pathname of `/foo` would be fetched from `/ui/foo`.
- `waypoint` - String. Catch all HTML file for any unmatched pathnames. Use this for not found screens or in-app routing. Specify relative to `mount`.
- `bypass` - Array. Default ['/node_modules']. Advanced. Mount bypass, allows dependency discovery from application root.

#### Methods

- `ready()` - returns a promise that resolves when the server is listening
- `close()` - closes the server

#### Properties

- `closed` - boolean indicating if server is closed
- `opened` - boolean indicating if server is opened
- `closing` - promise that resolves when server closes
- `opening` - promise that resolves when server opens

## License

Apache-2.0
