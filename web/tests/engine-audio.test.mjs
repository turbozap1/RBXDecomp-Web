import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EngineAudio } from '../engine-audio.mjs';

class Context {
  constructor() { this.state='running'; this.currentTime=0; this.sources=[]; this.destination={}; this.listener={setPosition(){},setOrientation(){}}; }
  async resume() {}
  async decodeAudioData() { return {duration:5}; }
  createBufferSource() {
    const source={connect(){},disconnect(){},start(time,offset){this.offset=offset;},stop(){this.stopped=true;}};
    this.sources.push(source);
    return source;
  }
  createGain() { return {gain:{value:1},connect(){return this;},disconnect(){}}; }
  createPanner() { return {connect(){return this;},disconnect(){},setPosition(...position){this.position=position;}}; }
}
const flush = () => new Promise(resolve=>setImmediate(resolve));

test('Sound playback preserves position, volume, looping and pause offset; delivers completion once', async()=>{
  const ended=[];
  const audio=new EngineAudio(()=>{},id=>ended.push(id),Context);
  await audio.unlock();
  audio.handle({operation:0,id:1,bytes:new Uint8Array([1,2,3])});
  audio.handle({operation:6,id:2,a:10,b:20,c:30});
  audio.handle({operation:10,a:10,b:2,c:1});
  audio.handle({operation:1,id:2,a:1,b:0.4,c:1});
  await flush();
  const channel=audio.channels.get(2), first=channel.source;
  assert.deepEqual(channel.panner.position,[1,2,3]);
  assert.equal(channel.panner.rolloffFactor,2);
  assert.equal(channel.gain.gain.value,0.4);
  assert.equal(first.loop,true);
  audio.context.currentTime=1.25;
  audio.handle({operation:2,id:2});
  first.onended();
  assert.deepEqual(ended,[]);
  audio.handle({operation:9,id:2});
  await flush();
  assert.equal(channel.source.offset,1.25);
  audio.handle({operation:5,id:2,a:0});
  audio.handle({operation:4,id:2,a:0.7});
  assert.equal(channel.source.loop,false);
  assert.equal(channel.gain.gain.value,0.7);
  channel.source.onended();
  assert.deepEqual(ended,[2]);
  assert.equal(audio.channels.size,0);
});

test('Reset cancels a Sound that is still decoding',async()=>{
  const audio=new EngineAudio(()=>{},()=>{},Context);
  await audio.unlock();
  let decoded;
  audio.context.decodeAudioData=()=>new Promise(resolve=>{decoded=resolve;});
  audio.handle({operation:0,id:1,bytes:new Uint8Array([1])});
  audio.handle({operation:1,id:2,a:1,b:1,c:0});
  audio.stopAll();
  decoded({duration:5});
  await flush();
  assert.equal(audio.context.sources.length,0);
  assert.equal(audio.channels.size,0);
  assert.equal(audio.buffers.size,0);
});
