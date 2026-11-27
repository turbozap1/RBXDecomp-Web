export class EngineAudio {
  constructor(report, ended, Context = globalThis.AudioContext) {
    this.report = report;
    this.ended = ended;
    this.Context = Context;
    this.context = null;
    this.buffers = new Map();
    this.channels = new Map();
    this.distance = 1;
    this.rolloff = 1;
  }

  async unlock() {
    this.context ??= new this.Context();
    await this.context.resume();
  }

  channel(id) {
    if (!this.channels.has(id)) this.channels.set(id, { id, volume: 1, loop: false, paused: true, offset: 0 });
    return this.channels.get(id);
  }

  async begin(channel) {
    if (!this.context || this.context.state !== 'running') {
      this.report('Enable audio before playing a Sound');
      this.stop(channel.id);
      this.ended(channel.id);
      return;
    }
    const asset = this.buffers.get(channel.sound);
    if (!asset) {
      this.report('Sound data is unavailable');
      this.stop(channel.id);
      this.ended(channel.id);
      return;
    }
    try {
      asset.decoded ??= this.context.decodeAudioData(asset.bytes.slice().buffer);
      const buffer = await asset.decoded;
      if (this.channels.get(channel.id) !== channel || channel.paused || channel.source) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      channel.source = source;
      channel.gain = gain;
      channel.duration = buffer.duration;
      source.buffer = buffer;
      source.loop = channel.loop;
      gain.gain.value = channel.volume;
      source.connect(gain);
      if (channel.position) {
        channel.panner = this.context.createPanner();
        channel.panner.distanceModel = 'inverse';
        channel.panner.rolloffFactor = this.rolloff;
        gain.connect(channel.panner).connect(this.context.destination);
        this.position(channel);
      } else gain.connect(this.context.destination);
      const offset = channel.loop ? channel.offset % buffer.duration : Math.min(channel.offset, buffer.duration);
      channel.startedAt = this.context.currentTime;
      source.onended = () => {
        if (channel.source !== source) return;
        this.stop(channel.id);
        this.ended(channel.id);
      };
      source.start(0, offset);
      this.report(`Playing Sound channel ${channel.id}`);
    } catch (error) {
      this.report(`Sound: ${error.message}`);
      if (this.channels.get(channel.id) === channel) {
        this.stop(channel.id);
        this.ended(channel.id);
      }
    }
  }

  position(channel) {
    if (!channel.panner || !channel.position) return;
    const values = channel.position.map((value) => value / this.distance);
    channel.panner.setPosition(...values);
  }

  pause(id) {
    const channel = this.channels.get(id);
    if (!channel) return;
    channel.paused = true;
    if (channel.source) {
      channel.offset += this.context.currentTime - channel.startedAt;
      const source = channel.source;
      channel.source = null;
      source.stop();
      source.disconnect();
      channel.gain.disconnect();
      channel.panner?.disconnect();
      channel.panner = null;
    }
  }

  stop(id) {
    this.pause(id);
    this.channels.delete(id);
  }

  stopAll() {
    for (const id of this.channels.keys()) this.stop(id);
    this.buffers.clear();
  }

  handle({ operation, id, a, b, c, bytes }) {
    if (operation === 0) {
      this.buffers.set(id, { bytes });
    } else if (operation === 1) {
      const channel = this.channel(id);
      Object.assign(channel, { sound: a, volume: b, loop: !!c, paused: false, offset: 0 });
      this.begin(channel);
    } else if (operation === 2) this.pause(id);
    else if (operation === 3) this.stop(id);
    else if (operation === 4) {
      const channel = this.channel(id);
      channel.volume = a;
      if (channel.gain) channel.gain.gain.value = a;
    } else if (operation === 5) {
      const channel = this.channel(id);
      channel.loop = !!a;
      if (channel.source) channel.source.loop = !!a;
    } else if (operation === 6) {
      const channel = this.channel(id);
      channel.position = [a, b, c];
      this.position(channel);
    } else if (operation === 7) this.context?.listener.setPosition(a / this.distance, b / this.distance, c / this.distance);
    else if (operation === 8) this.buffers.delete(id);
    else if (operation === 9) {
      const channel = this.channels.get(id);
      if (channel) {
        channel.paused = false;
        this.begin(channel);
      }
    } else if (operation === 10) {
      this.distance = a > 0 ? a : 1;
      this.rolloff = b;
      for (const channel of this.channels.values()) {
        if (channel.panner) channel.panner.rolloffFactor = b;
        this.position(channel);
      }
    } else if (operation === 11 || operation === 12) {
      const listener = this.context?.listener;
      if (!listener) return;
      if (operation === 11) this.forward = [a, b, c];
      else this.up = [a, b, c];
      listener.setOrientation(...(this.forward || [0, 0, -1]), ...(this.up || [0, 1, 0]));
    }
  }
}
