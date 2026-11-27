import createEngine from './engine/rbx-engine.mjs';

let engine;
let ready = false;
let pendingCharacterRequest = false;
const report = (message) => postMessage({ type: 'log', message });

function binary(value, callback) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  const pointer = engine._malloc(bytes.length + 1);
  if (!pointer) throw new Error('Engine memory allocation failed');
  try {
    engine.HEAPU8.set(bytes, pointer);
    engine.HEAPU8[pointer + bytes.length] = 0;
    return callback(pointer, bytes.length);
  } finally { engine._free(pointer); }
}

async function initialize(gateway, width, height) {
  try {
    engine = await createEngine({
      host: {
        log: report,
        audio: (message) => postMessage({ type: 'engine-audio', ...message }),
      },
      websocket: { url: gateway, subprotocol: null },
      print: report,
      printErr: report,
      onAbort: (message) => postMessage({ type: 'fatal', message: String(message) }),
    });
    if (engine._rbx_engine_init() !== 0) throw new Error('Engine initialization failed');
    engine._rbx_engine_camera(35, 26, 35, 0, 4, 0);
    if (engine._rbx_engine_render_init(width, height) !== 0) throw new Error('Original renderer initialization failed');
    ready = true;
    postMessage({ type: 'ready' });
  } catch (error) {
    postMessage({ type: 'fatal', message: String(error) });
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init' && !engine) return await initialize(data.gateway, data.width, data.height);
    if (!ready) return;
    if (data.type === 'execute') {
      if (data.source.startsWith('\x1b')) throw new Error('Only Lua source text is supported');
      const status = engine.ccall('rbx_engine_execute', 'number', ['string'], [data.source]);
      if (status === 0 && data.spawnCharacter) pendingCharacterRequest = true;
      postMessage({ type: 'executed', status });
    } else if (data.type === 'render') {
      if (engine._rbx_engine_render(data.width, data.height) !== 0) throw new Error('Original renderer frame failed');
      const pointer = engine._rbx_engine_render_pixels();
      const pixels = engine.HEAPU8.slice(pointer, pointer + data.width * data.height * 4);
      postMessage({type:'frame',pixels:pixels.buffer,width:data.width,height:data.height,triangles:engine._rbx_engine_render_triangles()},[pixels.buffer]);
    } else if (data.type === 'snapshot') {
      if (pendingCharacterRequest && engine._rbx_engine_request_character() !== 0) {
        pendingCharacterRequest = false;
        report('Requested character after local Player serialization');
      }
      engine._rbx_engine_snapshot();
      const count = engine._rbx_engine_part_count();
      const characterPointer = engine._rbx_engine_character_position();
      const character = characterPointer ? Array.from(new Float32Array(engine.HEAPU8.buffer, characterPointer, 3)) : null;
      postMessage({ type: 'scene', count, character, time: engine._rbx_engine_time() });
    } else if (data.type === 'run') engine._rbx_engine_run(data.running ? 1 : 0);
    else if (data.type === 'place') {
      const status = binary(data.bytes, (pointer, length) => engine._rbx_engine_load(pointer, length));
      postMessage({ type: 'executed', status });
    } else if (data.type === 'asset') {
      const status = binary(data.bytes, (pointer, length) => engine.ccall('rbx_engine_asset', 'number', ['string', 'number', 'number'], [data.path, pointer, length]));
      postMessage({ type: 'asset', path: data.path, status });
    } else if (data.type === 'audio-ended') engine._rbx_engine_audio_ended(data.id);
    else if (data.type === 'camera') engine._rbx_engine_camera(...data.values);
    else if (data.type === 'input') engine._rbx_engine_input(data.forward, data.right, data.jump ? 1 : 0);
    else if (data.type === 'key') engine._rbx_engine_key(data.key, data.down ? 1 : 0, data.modifiers);
    else if (data.type === 'mouse') {
      const event = data.event;
      engine._rbx_engine_mouse(event.type,event.x,event.y,event.dx,event.dy);
    }
  } catch (error) {
    postMessage({ type: 'fatal', message: String(error) });
  }
};
