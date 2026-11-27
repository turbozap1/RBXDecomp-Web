export class Network {
  constructor(emit, Socket = globalThis.WebSocket) {
    this.emit = emit;
    this.Socket = Socket;
    this.socket = null;
  }

  connect(url) {
    try {
      const address = new URL(url);
      if (!['ws:', 'wss:'].includes(address.protocol)) return 0;
      this.disconnect();
      const socket = new this.Socket(address.href);
      this.socket = socket;
      socket.binaryType = 'arraybuffer';
      const current = (callback) => (event) => {
        if (this.socket === socket) callback(event);
      };
      socket.onopen = current(() => this.emit('onopen', ''));
      socket.onmessage = current(({ data }) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
        if (bytes.length <= 65507) this.emit('onmessage', bytes);
        else this.emit('onerror', 'Incoming datagram exceeds 65507 bytes');
      });
      socket.onerror = current(() => this.emit('onerror', 'WebSocket connection failed'));
      socket.onclose = current(({ code }) => {
        this.socket = null;
        this.emit('onclose', String(code));
      });
      return 1;
    } catch {
      return 0;
    }
  }

  send(bytes) {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1 || bytes.length > 65507 || socket.bufferedAmount + bytes.length > 1048576) return 0;
    try {
      socket.send(bytes);
      return 1;
    } catch {
      return 0;
    }
  }

  disconnect() {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

export class Audio {
  constructor(report, Context = globalThis.AudioContext, fetchAudio = (...args) => globalThis.fetch(...args)) {
    this.report = report;
    this.Context = Context;
    this.fetchAudio = fetchAudio;
    this.context = null;
    this.sounds = new Map();
  }

  async unlock() {
    this.context ??= new this.Context();
    await this.context.resume();
  }

  async play(id, url, volume, loop) {
    this.stop(id);
    if (!this.context || this.context.state !== 'running') {
      this.report('Enable audio before playing a sound');
      return;
    }
    if (this.sounds.size >= 64) {
      this.report('The 64 sound channel limit has been reached');
      return;
    }
    const sound = { controller: new AbortController(), source: null, gain: null };
    this.sounds.set(id, sound);
    try {
      const response = await this.fetchAudio(url, { signal: sound.controller.signal });
      if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      if (this.sounds.get(id) !== sound) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      sound.source = source;
      sound.gain = gain;
      source.buffer = buffer;
      source.loop = loop;
      gain.gain.value = volume;
      source.connect(gain).connect(this.context.destination);
      source.onended = () => {
        if (this.sounds.get(id) === sound) this.sounds.delete(id);
        source.disconnect();
        gain.disconnect();
      };
      source.start();
      this.report(`Playing audio channel ${id}`);
    } catch (error) {
      if (this.sounds.get(id) === sound) {
        this.sounds.delete(id);
        this.report(String(error.message));
      }
    }
  }

  stop(id) {
    const sound = this.sounds.get(id);
    if (!sound) return;
    this.sounds.delete(id);
    sound.controller.abort();
    sound.source?.stop();
    sound.source?.disconnect();
    sound.gain?.disconnect();
  }

  stopAll() {
    for (const id of this.sounds.keys()) this.stop(id);
  }
}
