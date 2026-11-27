import { Renderer } from './renderer.mjs';
import { EngineAudio } from './engine-audio.mjs';

const element = id => document.getElementById(id);
const output = element('output');
function log(message) {
  const text = String(message).replace(/^<font[^>]*>([\s\S]*)<\/font>$/, '$1');
  output.textContent = `${output.textContent}${text.slice(0,16000)}\n`.slice(-64000);
  output.scrollTop = output.scrollHeight;
}

const demo = `local old = workspace:FindFirstChild("BrowserDemo")
if old then old:Remove() end
local scene = Instance.new("Model")
scene.Name = "BrowserDemo"
scene.Parent = workspace
local base = Instance.new("Part")
base.Name = "Baseplate"
base.Size = Vector3.new(64, 1, 64)
base.Anchored = true
base.BrickColor = BrickColor.new(37)
base.Parent = scene
for i = 1, 8 do
    local brick = Instance.new("Part")
    brick.Name = "Brick" .. i
    brick.Size = Vector3.new(4, 2, 4)
    brick.Position = Vector3.new((i % 3) * 6 - 6, 5 + i * 3, 0)
    brick.BrickColor = BrickColor.new(21 + i)
    brick.Parent = scene
end
print("Created real engine Parts. Click Run simulation.")
`;

let worker, ready = false, pendingSnapshot = false, pendingRender = false, triangles = 0, watchdog, assetId = 0, joinOnReady = false, requestCharacterOnExecute = false;
const audio = new EngineAudio(log, id => worker?.postMessage({ type: 'audio-ended', id }));
let renderer;
try {
  renderer = new Renderer(element('viewport'), event => {
    if (ready) worker.postMessage({type:'mouse',event});
  });
} catch (error) { log(error.message); }

function controls(enabled) {
  for (const id of ['run','demo','play','pause','network','join-local']) element(id).disabled = !enabled;
}

function fail(message) {
  clearTimeout(watchdog);
  ready = false;
  controls(false);
  worker?.terminate();
  audio.stopAll();
  element('status').textContent = 'Stopped — reset to restart';
  log(message);
}

function start() {
  clearTimeout(watchdog);
  worker?.terminate();
  audio.stopAll();
  ready = false;
  pendingSnapshot = false;
  pendingRender = false;
  controls(false);
  element('status').textContent = 'Loading engine…';
  if (!crossOriginIsolated) return fail('Shared-memory headers are missing. Run python web/serve.py from the repository root.');
  const gateway = element('endpoint').value;
  if (!/^wss?:\/\//.test(gateway)) return fail('Enter a ws:// or wss:// gateway URL before resetting');
  worker = new Worker(new URL('./engine-worker.mjs',import.meta.url), {type:'module'});
  worker.onmessage = ({data}) => {
    if (data.type === 'ready') {
      ready = true;
      controls(true);
      element('status').textContent = 'Engine ready';
      clearTimeout(watchdog);
      if (joinOnReady) {
        joinOnReady = false;
        element('network').click();
        worker.postMessage({type:'run',running:true});
        execute();
      }
    } else if (data.type === 'executed') {
      clearTimeout(watchdog);
      controls(true);
      element('status').textContent = data.status ? 'Script / load error' : 'Engine ready';
    } else if (data.type === 'frame') {
      pendingRender = false;
      triangles = data.triangles;
      renderer?.draw(data.pixels,data.width,data.height);
    } else if (data.type === 'scene') {
      pendingSnapshot = false;
      element('metrics').textContent = `${data.count} Parts · ${triangles} C++ triangles · ${data.time.toFixed(2)} s${data.character ? ' · Character ready' : ''}`;
    } else if (data.type === 'log') log(data.message);
    else if (data.type === 'engine-audio') audio.handle(data);
    else if (data.type === 'asset') {
      if (data.status) log(`Could not import ${data.path}`);
      else {
        element('source').value = `sound = Instance.new("Sound")\nsound.SoundId = "file://${data.path}"\nsound.Volume = 0.5\nsound.Parent = workspace\nsound:Play()\n-- sound:Pause()\n-- sound:Play()\n-- sound:Stop()\n`;
        log(`Imported sound ${data.path}. Run the generated script.`);
      }
    } else if (data.type === 'fatal') fail(data.message);
  };
  worker.onerror = event => fail(event.message);
  const [width,height] = renderer.size();
  worker.postMessage({type:'init',gateway,width,height});
  watchdog = setTimeout(()=>fail('Engine startup timed out. Reset to retry.'),30000);
}

function execute() {
  if (!ready) return;
  controls(false);
  element('status').textContent = 'Executing';
  worker.postMessage({type:'execute',source:element('source').value,spawnCharacter:requestCharacterOnExecute});
  requestCharacterOnExecute = false;
  watchdog = setTimeout(()=>fail('Script did not return within 5 seconds. Reset to restart the engine.'),5000);
}

element('source').value = demo;
element('run').onclick = execute;
element('demo').onclick = () => { element('source').value = demo; };
element('play').onclick = () => worker.postMessage({type:'run',running:true});
element('pause').onclick = () => worker.postMessage({type:'run',running:false});
element('reset').onclick = () => { joinOnReady = false; start(); };
element('join-local').onclick = () => {
  element('endpoint').value = 'ws://127.0.0.1:53640';
  element('server').value = '127.0.0.1';
  element('port').value = '53640';
  joinOnReady = true;
  start();
};
element('clear').onclick = () => { output.textContent = ''; };
element('audio').onclick = async () => {
  try { await audio.unlock(); element('audio').textContent = 'Audio enabled'; }
  catch (error) { log(error.message); }
};
element('file').onchange = async ({target}) => {
  if (target.files[0]) element('source').value = await target.files[0].text();
};
element('place').onchange = async ({target}) => {
  if (!target.files[0] || !ready) return;
  const bytes = await target.files[0].arrayBuffer();
  controls(false);
  worker.postMessage({type:'place',bytes},[bytes]);
  watchdog = setTimeout(()=>fail('Place loading timed out. Reset to restart.'),15000);
};
element('sound').onchange = async ({target}) => {
  if (!target.files[0] || !ready) return;
  const bytes = await target.files[0].arrayBuffer();
  const extension = target.files[0].name.split('.').pop().replace(/[^a-zA-Z0-9]/g,'').slice(0,8) || 'audio';
  worker.postMessage({type:'asset',path:`/content/upload-${++assetId}.${extension}`,bytes},[bytes]);
};
element('network').onclick = () => {
  requestCharacterOnExecute = true;
  const server = element('server').value;
  const port = Number(element('port').value), user = Number(element('user-id').value);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(server) || server.split('.').some(octet => Number(octet) > 255) || !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isSafeInteger(user) || user < 0 || user > 2147483647) return log('Enter a valid server IPv4 address, port, and player user ID');
  element('source').value = `local client = game:GetService("NetworkClient")\nlocal players = game:GetService("Players")\nlocal player = players:CreateLocalPlayer(${user})\nclient.ConnectionAccepted:connect(function(peer, replicator)\n    print("RakNet connection accepted", peer)\nend)\nclient.ConnectionFailed:connect(function(peer, code)\n    print("Connection failed", peer, code)\nend)\nclient:Connect(${JSON.stringify(server)}, ${port}, 0, 30)\n`;
};
setInterval(() => {
  if (ready && !pendingSnapshot) { pendingSnapshot = true; worker.postMessage({type:'snapshot'}); }
},50);
function draw() {
  if(ready && !pendingRender && renderer) {
    pendingRender = true;
    const [width,height] = renderer.size();
    worker.postMessage({type:'render',width,height});
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
start();

const keys = new Set();
const viewport = element('viewport');
const specialKeys = {Backspace:8,Tab:9,Enter:13,Escape:27,Space:32,Delete:127,ArrowUp:273,ArrowDown:274,ArrowRight:275,ArrowLeft:276,Insert:277,Home:278,End:279,PageUp:280,PageDown:281,ShiftRight:303,ShiftLeft:304,ControlRight:305,ControlLeft:306,AltRight:307,AltLeft:308};
function keyCode(event) {
  if(event.code in specialKeys) return specialKeys[event.code];
  if(/^Key[A-Z]$/.test(event.code)) return event.code.charCodeAt(3)+32;
  if(/^Digit[0-9]$/.test(event.code)) return event.code.charCodeAt(5);
  if(/^F([1-9]|1[0-2])$/.test(event.code)) return 281+Number(event.code.slice(1));
  if(event.key.length===1) return event.key.toLowerCase().charCodeAt(0);
  return null;
}
function sendKey(key,down,event={}) {
  if(!ready) return;
  const modifiers=(event.shiftKey?3:0)|(event.ctrlKey?192:0)|(event.altKey?768:0);
  worker.postMessage({type:'key',key,down,modifiers});
}
viewport.addEventListener('keydown',event=>{
  const key=keyCode(event); if(key===null)return;
  event.preventDefault();keys.add(key);sendKey(key,true,event);
});
viewport.addEventListener('keyup',event=>{
  const key=keyCode(event);if(key===null)return;
  event.preventDefault();keys.delete(key);sendKey(key,false,event);
});
function releaseInput() { for(const key of keys) sendKey(key,false);keys.clear(); }
viewport.addEventListener('blur',releaseInput);
window.addEventListener('blur',releaseInput);

element('source').addEventListener('input',()=>{requestCharacterOnExecute=false;});
