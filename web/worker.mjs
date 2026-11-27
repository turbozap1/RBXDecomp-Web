import createRuntime from './rbx-runtime.mjs';
import { Network } from './platform.mjs';

let runtime;
let soundId = 0;
const report = (message) => postMessage({ type: 'log', message });
const bytes = (value) => typeof value === 'string' ? new TextEncoder().encode(value) : value;

function withBytes(value, action) {
  const data = bytes(value);
  const pointer = runtime._malloc(data.length + 1);
  if (!pointer) throw new Error('WebAssembly allocation failed');
  try {
    runtime.HEAPU8.set(data, pointer);
    return action(pointer, data.length);
  } finally {
    runtime._free(pointer);
  }
}

const network = new Network((event, data) => {
  try {
    withBytes(data, (pointer, length) => {
      runtime.ccall('rbx_event', 'number', ['string', 'number', 'number'], [event, pointer, length]);
    });
  } catch (error) {
    report(String(error));
  }
});

try {
  runtime = await createRuntime({
    host: {
      log: report,
      connect: (url) => network.connect(url),
      send: (data) => network.send(data),
      disconnect: () => network.disconnect(),
      play: (url, volume, loop) => {
        const id = ++soundId;
        postMessage({ type: 'play', id, url, volume, loop });
        return id;
      },
      stop: (id) => postMessage({ type: 'stop', id }),
    },
    printErr: report,
    onAbort: (message) => postMessage({ type: 'fatal', message: String(message) }),
  });
  if (runtime._rbx_init() !== 0) throw new Error('Lua initialization failed');
  postMessage({ type: 'ready' });
} catch (error) {
  postMessage({ type: 'fatal', message: String(error) });
}

self.onmessage = ({ data }) => {
  if (!runtime || data.type !== 'execute') return;
  try {
    const status = withBytes(data.source, (pointer, length) => runtime._rbx_execute(pointer, length));
    postMessage({ type: 'executed', status });
  } catch (error) {
    postMessage({ type: 'fatal', message: String(error) });
  }
};
