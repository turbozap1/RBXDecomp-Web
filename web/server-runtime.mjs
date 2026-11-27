import { pathToFileURL } from 'node:url';

const engineURL = process.env.RBX_ENGINE_MODULE ? pathToFileURL(process.env.RBX_ENGINE_MODULE) : new URL('../build-web/web/engine/rbx-engine.mjs', import.meta.url);
const createEngine = (await import(engineURL.href)).default;

const port = Number(process.argv[2] || 53640);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a server port between 1024 and 65535');
const engine = await createEngine({host:{log:console.log,audio:()=>{}},print:console.log,printErr:console.error});
if (engine._rbx_engine_init() !== 0) throw new Error('Engine initialization failed');
const script = `
local scene = Instance.new("Model")
scene.Name = "ServerWorld"
scene.Parent = workspace
local base = Instance.new("Part")
base.Name = "ServerBaseplate"
base.Anchored = true
base.Size = Vector3.new(64,1,64)
base.BrickColor = BrickColor.new(37)
base.Parent = scene
for i = 1, 5 do
    local part = Instance.new("Part")
    part.Name = "ServerBrick" .. i
    part.Anchored = true
    part.Size = Vector3.new(4,2,4)
    part.Position = Vector3.new(i*5-15, i*3, 0)
    part.BrickColor = BrickColor.new(20+i)
    part.Parent = scene
end
game:GetService("NetworkServer"):Start(${port}, 10)
print("Local server world created")
`;
if (engine.ccall('rbx_engine_execute','number',['string'],[script]) !== 0) throw new Error('Game server startup failed');
engine._rbx_engine_run(1);
console.log(`Local 2007 engine server: ws://127.0.0.1:${port}`);
console.log('Set the browser Gateway URL to this address, reset the engine, then run its connection script.');
let stopping = false;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
  if (stopping) return;
  stopping = true;
  try { engine._rbx_engine_destroy(); } finally { process.exit(0); }
});
setInterval(()=>{},1000);
