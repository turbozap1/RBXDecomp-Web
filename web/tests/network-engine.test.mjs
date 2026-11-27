import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL, fileURLToPath } from 'node:url';

const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const server = spawn(process.execPath, [fileURLToPath(new URL('../server-runtime.mjs', import.meta.url)), String(port)], { windowsHide:true, stdio:['ignore','pipe','pipe'], env:{...process.env,RBX_ENGINE_MODULE:process.argv[2]} });
let output = '';
server.stdout.on('data', data => { output += data; });
server.stderr.on('data', data => { output += data; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition, message) {
  for(let i=0;i<100;i++) { if(condition()) return; if(server.exitCode !== null) throw new Error(output); await sleep(100); }
  throw new Error(`${message}\n${output}`);
}
const clients = [];
try {
  await until(() => output.includes('Local 2007 engine server:'), 'Server startup timed out');
  const createEngine = (await import(pathToFileURL(process.argv[2]).href)).default;
  for(const user of [1,2]) {
    const logs = [];
    const engine = await createEngine({websocket:{url:`ws://127.0.0.1:${port}`,subprotocol:null},host:{log:message=>logs.push(message),audio:()=>{}},print:console.log,printErr:console.error});
    clients.push(engine);
    assert.equal(engine._rbx_engine_init(),0);
    assert.equal(engine._rbx_engine_render_init(320,200),0);
    engine._rbx_engine_run(1);
    assert.equal(engine.ccall('rbx_engine_execute','number',['string'],[`local client=game:GetService('NetworkClient'); game:GetService('Players'):CreateLocalPlayer(${user}); client:Connect('127.0.0.1',${port},0,30)`]),0);
    await until(() => { engine._rbx_engine_snapshot(); assert.equal(engine._rbx_engine_render(320,200),0); return engine._rbx_engine_part_count() === 6; }, `Client ${user} did not receive the server world: ${logs.join('\n')}`);
  }
  assert.equal(clients[0].ccall('rbx_engine_execute','number',['string'],[`workspace.ServerWorld.ServerBrick1.Position=Vector3.new(42,10,0)`]),0);
  await until(() => {
    const client = clients[1], pointer = client._rbx_engine_snapshot();
    const scene = new Float32Array(client.HEAPU8.buffer,pointer,client._rbx_engine_part_count()*20);
    return Array.from(scene).some((value,index) => index%20===0 && Math.abs(value-42)<0.01);
  }, 'A client property change did not replicate through the server to the second client');
  await until(() => clients[0]._rbx_engine_request_character() !== 0, 'The local Player was not serialized before the character request');
  await until(() => { clients[0]._rbx_engine_snapshot(); return clients[0]._rbx_engine_part_count() > 6; }, 'The original character model did not spawn and replicate');
  await until(() => clients[0]._rbx_engine_character_position() !== 0, 'Local player did not acquire the replicated character');
  const characterPosition = () => Array.from(new Float32Array(clients[0].HEAPU8.buffer,clients[0]._rbx_engine_character_position(),3));
  clients[0]._rbx_engine_run(1);
  await sleep(1400);
  const before = characterPosition();
  for(let i=0;i<15;i++) { assert.equal(clients[0]._rbx_engine_input(1,0,0),1); await sleep(50); }
  clients[0]._rbx_engine_input(0,0,0);
  const after = characterPosition();
  assert.ok(Math.hypot(after[0]-before[0],after[2]-before[2]) > 2, `Humanoid did not move: ${before} -> ${after}`);
  await until(() => {
    const client = clients[1], pointer = client._rbx_engine_snapshot();
    const scene = new Float32Array(client.HEAPU8.buffer,pointer,client._rbx_engine_part_count()*20);
    for(let i=0;i<scene.length;i+=20) if(Math.hypot(scene[i]-after[0],scene[i+1]-after[1],scene[i+2]-after[2])<2) return true;
    return false;
  }, `The second client did not receive the moving character near ${after}`);
  clients[0]._rbx_engine_input(0,0,1);
  await sleep(200);
  const jumped = characterPosition();
  assert.ok(jumped[1] > after[1] + 1, `Humanoid did not jump: ${after} -> ${jumped}`);
  assert.equal(clients[0]._rbx_engine_render(320,200),0);
  assert.ok(clients[0]._rbx_engine_render_triangles()>100,'The original renderer must draw the replicated world and character');
  console.log('Multiplayer passed: two-client world/property replication, original character spawning and Humanoid movement.');
  for(const client of clients) client._rbx_engine_destroy();
  server.kill();
  process.exit(0);
} catch(error) {
  console.error(error,output);
  for(const client of clients) {const pointer=client._rbx_engine_snapshot();const count=client._rbx_engine_part_count();const data=new Float32Array(client.HEAPU8.buffer,pointer,count*20);console.error('Client Parts',count,Array.from({length:count},(_,index)=>Array.from(data.subarray(index*20,index*20+3))));}
  server.kill();
  process.exit(1);
}
