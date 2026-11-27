import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { default: createRuntime } = await import(pathToFileURL(process.argv[2]));
const messages = [];
const calls = [];
const runtime = await createRuntime({ host: {
  log: (message) => messages.push(message),
  connect: (url) => { calls.push(['connect', url]); return 1; },
  send: (bytes) => { calls.push(['send', [...bytes]]); return 1; },
  disconnect: () => calls.push(['disconnect']),
  play: (...args) => { calls.push(['play', ...args]); return 7; },
  stop: (id) => calls.push(['stop', id]),
} });
function data(value, callback) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const pointer = runtime._malloc(bytes.length + 1);
  try {
    runtime.HEAPU8.set(bytes, pointer);
    return callback(pointer, bytes.length);
  } finally { runtime._free(pointer); }
}
const run = (source) => data(source, (p, n) => runtime._rbx_execute(p, n));
assert.equal(runtime._rbx_init(), 0);
assert.equal(run('print(_VERSION); x = 40; print(x + 2)'), 0);
assert.deepEqual(messages.splice(0), ['Lua 5.1', '42']);
assert.equal(run('print(x); local c = coroutine.create(function() return 17 end); print(coroutine.resume(c))'), 0);
assert.deepEqual(messages.splice(0), ['40', 'true\t17']);
assert.equal(run('print(string.rep("x", 10000), "tail")'), 0);
assert.equal(messages.pop(), 'x'.repeat(10000) + '\ttail');
assert.equal(run('print("日本語 café")'), 0);
assert.equal(messages.pop(), '日本語 café');
assert.notEqual(run('this is not Lua'), 0);
assert.notEqual(run('error("expected error")'), 0);
assert.equal(run('print("recovered")'), 0);
assert.equal(messages.pop(), 'recovered');
assert.equal(run('assert(io == nil and os == nil and package == nil and debug == nil); assert(dofile == nil and loadfile == nil and load == nil)'), 0);
assert.notEqual(run(new Uint8Array([27, 76, 117, 97])), 0);
assert.notEqual(run('loadstring(string.char(27) .. "Lua")'), 0);
assert.equal(run('browser.connect("ws://localhost:8765"); browser.send(string.char(0, 255, 1)); browser.disconnect(); local id = browser.play("sound.wav", .5, true); browser.stop(id)'), 0);
assert.deepEqual(calls, [['connect', 'ws://localhost:8765'], ['send', [0,255,1]], ['disconnect'], ['play','sound.wav',.5,true], ['stop',7]]);
assert.equal(run('browser.onmessage = function(data) assert(#data == 3); print(string.byte(data, 1, 3)) end'), 0);
assert.equal(data(new Uint8Array([0, 255, 1]), (p,n) => runtime.ccall('rbx_event', 'number', ['string','number','number'], ['onmessage',p,n])), 0);
assert.equal(messages.pop(), '0\t255\t1');
assert.equal(run('browser.onmessage = nil; setmetatable(browser, {__index = function() error("callback lookup failed") end})'), 0);
assert.notEqual(data('', (p,n) => runtime.ccall('rbx_event', 'number', ['string','number','number'], ['onmessage',p,n])), 0);
assert.match(messages.pop(), /callback lookup failed/);
assert.equal(run('setmetatable(browser, nil)'), 0);
assert.notEqual(run('while true do end'), 0);
assert.match(messages.pop(), /execution budget/);
assert.notEqual(run('local s = string.rep("x", 40 * 1024 * 1024)'), 0);
assert.equal(run('print("after limits")'), 0);
assert.equal(messages.pop(), 'after limits');
runtime._rbx_destroy();
assert.equal(runtime._rbx_init(), 0);
assert.equal(run('assert(x == nil)'), 0);
runtime._rbx_destroy();
console.log('Original Lua WASM: scripts, coroutines, errors, binary events, audio bindings, limits, and reset passed');
