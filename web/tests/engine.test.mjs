import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const createEngine = (await import(pathToFileURL(process.argv[2]).href)).default;
const messages = [], commands = [];
const engine = await createEngine({
  host: { log: message => messages.push(message), audio: command => commands.push(command) },
  print: console.log, printErr: console.error,
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const execute = source => assert.equal(engine.ccall('rbx_engine_execute', 'number', ['string'], [source]), 0, messages.join('\n'));
const snapshot = () => {
  const pointer = engine._rbx_engine_snapshot();
  return new Float32Array(engine.HEAPU8.buffer, pointer, engine._rbx_engine_part_count() * 20).slice();
};
function bytesCall(name, bytes, prefix = []) {
  const pointer = engine._malloc(bytes.length);
  engine.HEAPU8.set(bytes, pointer);
  try { return engine.ccall(name, 'number', [...prefix.map(() => 'string'), 'number', 'number'], [...prefix, pointer, bytes.length]); }
  finally { engine._free(pointer); }
}
try {
  assert.equal(engine._rbx_engine_init(), 0);
  execute(`base=Instance.new('Part'); base.Name='Floor'; base.Anchored=true; base.Size=Vector3.new(64,1,64); base.Parent=workspace
brick=Instance.new('Part'); brick.Position=Vector3.new(0,20,0); brick.Parent=workspace`);
  assert.equal(snapshot().length, 40);
  engine._rbx_engine_run(1);
  await sleep(2200);
  const scene = snapshot();
  assert.ok(scene[21] < 10 && scene[21] > 0.5, `Expected a falling brick resting above the floor; y=${scene[21]}`);
  engine._rbx_engine_run(0);
  const pausedTime = engine._rbx_engine_time();
  await sleep(120);
  assert.equal(engine._rbx_engine_time(), pausedTime);
  execute(`base:Remove(); brick:Remove()`);
  const xml = new TextEncoder().encode('<roblox version="4"><Item class="Workspace"><Properties><string name="Name">Workspace</string></Properties><Item class="Part"><Properties><string name="Name">LoadedPart</string><bool name="Anchored">true</bool></Properties></Item></Item></roblox>');
  assert.equal(bytesCall('rbx_engine_load', xml), 0, messages.join('\n'));
  assert.equal(snapshot().length, 20);
  execute(`assert(workspace.LoadedPart.Anchored == true)`);
  const wav = new Uint8Array(2044), view = new DataView(wav.buffer);
  for (const [offset, text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']]) for(let i=0;i<text.length;i++) wav[offset+i]=text.charCodeAt(i);
  view.setUint32(4,wav.length-8,true); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,8000,true); view.setUint32(28,16000,true); view.setUint16(32,2,true); view.setUint16(34,16,true); view.setUint32(40,2000,true);
  assert.equal(bytesCall('rbx_engine_asset', wav, ['/content/test.wav']), 0);
  execute(`sound=Instance.new('Sound'); sound.SoundId='file:///content/test.wav'; sound.Parent=workspace; sound:Play()`);
  engine._rbx_engine_run(1);
  for(let i=0;i<30 && !commands.some(command => command.operation === 1);i++) await sleep(100);
  assert.ok(commands.some(command => command.operation === 0 && command.bytes.length === wav.length), 'Sound bytes must reach the Web Audio bridge');
  const playing = commands.find(command => command.operation === 1);
  assert.ok(playing, messages.join('\n'));
  engine._rbx_engine_audio_ended(playing.id);
  await sleep(150);
  console.log('Engine integration passed: original Lua APIs, physics, pause, XML place loading, Sound playback bridge.');
  engine._rbx_engine_destroy();
  process.exit(0);
} catch(error) {
  console.error(error, messages.join('\n'));
  process.exit(1);
}
