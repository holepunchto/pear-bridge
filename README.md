# pear-bridge

> Local HTTP Bridge for Pear Desktop Applications

For use with Pear User Interface libraries, such as `pear-electron`.

## Install

```sh
npm install pear-bridge
```

## Usage

On the UI side, load `pear-bridge` as soon as possible. For example, with `pear-electron`, 
provide a preload file to run at the beginning of the renderer process with at least the following:


```js
import `pear-bridge`
```

This will setup script-linker/runtime to configure the module system to load dependencies over HTTP. 
It will also perform warmup steps, so that the HTTP bridge is only used for dependencies in dynamic scenarios (for example: `require(expression)`). 

The application entrypoint needs to instantiate the bridge and pass its info to the Pear User Interface Runtime Library.
The following example is with `pear-electron` but any compatible Pear UI Runtime Library should work the same:

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

## LICENSE

Apachae-2.0

