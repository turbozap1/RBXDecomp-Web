import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Audio, Network } from '../platform.mjs';

class Socket {
  constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; }
  send(data) { this.sent = data; }
  close() { this.closed = true; }
}

test('network handles binary messages, reconnects, and backpressure', () => {
  const events = [];
  const network = new Network((...args) => events.push(args), Socket);
  assert.equal(network.connect('https://example.com'), 0);
  assert.equal(network.connect('ws://localhost:8765'), 1);
  const old = network.socket;
  assert.equal(network.send(new Uint8Array([1])), 0);
  old.readyState = 1;
  old.onopen();
  assert.equal(network.send(new Uint8Array([0,255])), 1);
  assert.deepEqual([...old.sent], [0,255]);
  old.onmessage({ data: new Uint8Array([0,255]).buffer });
  assert.deepEqual([...events[1][1]], [0,255]);
  old.bufferedAmount = 1048576;
  assert.equal(network.send(new Uint8Array([1])), 0);
  assert.equal(network.send(new Uint8Array(65508)), 0);
  network.connect('ws://localhost:9999');
  assert.ok(old.closed);
  old.onmessage({ data: 'stale' });
  assert.equal(events.length, 2);
  network.disconnect();
  assert.equal(network.socket, null);
});

class Context {
  state = 'suspended';
  destination = {};
  async resume() { this.state = 'running'; }
  async decodeAudioData(data) { return data; }
  createBufferSource() {
    this.source = { connect: (node) => node, start() { this.started = true; }, stop() { this.stopped = true; }, disconnect() {} };
    return this.source;
  }
  createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
}
const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };

test('audio unlock, gain, looping, stop, and failed loads', async () => {
  const errors = [];
  const audio = new Audio((error) => errors.push(error), Context, async () => response);
  await audio.play(1, 'test.wav', .3, true);
  assert.match(errors.pop(), /Enable audio/);
  await audio.unlock();
  await audio.play(2, 'test.wav', .3, true);
  const sound = audio.sounds.get(2);
  assert.equal(sound.gain.gain.value, .3);
  assert.equal(sound.source.loop, true);
  assert.equal(sound.source.started, true);
  audio.stop(2);
  assert.equal(sound.source.stopped, true);
  assert.equal(audio.sounds.size, 0);
  audio.fetchAudio = async () => { throw new Error('failed load'); };
  await audio.play(3, 'bad.wav', 1, false);
  assert.equal(errors.pop(), 'failed load');
  assert.equal(audio.sounds.size, 0);
});

test('stopping a pending sound prevents late playback', async () => {
  let finish;
  const audio = new Audio(() => {}, Context, () => new Promise((resolve) => { finish = resolve; }));
  await audio.unlock();
  const pending = audio.play(1, 'slow.wav', 1, false);
  audio.stopAll();
  finish(response);
  await pending;
  assert.equal(audio.context.source, undefined);
  assert.equal(audio.sounds.size, 0);
});

test('default audio fetch retains the browser global receiver', async () => {
  const original = globalThis.fetch;
  const errors = [];
  globalThis.fetch = async function () {
    assert.equal(this, globalThis);
    return response;
  };
  try {
    const audio = new Audio((error) => errors.push(error), Context);
    await audio.unlock();
    await audio.play(1, 'sound.wav', 1, false);
    assert.equal(audio.context.source.started, true);
    assert.deepEqual(errors, ['Playing audio channel 1']);
    audio.stopAll();
  } finally { globalThis.fetch = original; }
});
