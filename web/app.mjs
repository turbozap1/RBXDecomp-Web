import { Audio } from './platform.mjs';

const element = (id) => document.getElementById(id);
const output = element('output');
function log(message) {
  output.textContent = `${output.textContent}${String(message).slice(0, 16000)}\n`.slice(-64000);
  output.scrollTop = output.scrollHeight;
}
const audio = new Audio(log);
let worker;
let watchdog;
let soundUrl;

function start() {
  clearTimeout(watchdog);
  worker?.terminate();
  audio.stopAll();
  element('run').disabled = true;
  element('network').disabled = true;
  element('status').textContent = 'Loading…';
  worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'ready' || data.type === 'executed') {
      clearTimeout(watchdog);
      element('run').disabled = false;
      element('network').disabled = false;
      element('status').textContent = data.status ? 'Script error' : 'Ready';
    } else if (data.type === 'log') log(data.message);
    else if (data.type === 'play') audio.play(data.id, data.url, data.volume, data.loop);
    else if (data.type === 'stop') audio.stop(data.id);
    else if (data.type === 'fatal') fail(data.message);
  };
  worker.onerror = (event) => fail(event.message);
}

function fail(message) {
  clearTimeout(watchdog);
  worker?.terminate();
  audio.stopAll();
  element('run').disabled = true;
  element('status').textContent = 'Stopped — reset to restart';
  log(message);
}

element('run').onclick = () => {
  element('run').disabled = true;
  element('status').textContent = 'Running';
  worker.postMessage({ type: 'execute', source: element('source').value });
  watchdog = setTimeout(() => fail('VM stopped after 2 seconds. Reset to start a fresh VM.'), 2000);
};
element('reset').onclick = start;
element('clear').onclick = () => { output.textContent = ''; };
element('audio').onclick = async () => {
  try {
    await audio.unlock();
    element('audio').textContent = 'Audio enabled';
  } catch (error) { log(error.message); }
};
element('file').onchange = async ({ target }) => {
  if (target.files[0]) element('source').value = await target.files[0].text();
};
element('sound').onchange = ({ target }) => {
  if (!target.files[0]) return;
  if (soundUrl) URL.revokeObjectURL(soundUrl);
  soundUrl = URL.createObjectURL(target.files[0]);
  element('source').value = `sound = browser.play(${JSON.stringify(soundUrl)}, 0.5, false)\nprint("Sound channel:", sound)\n-- browser.stop(sound)\n`;
};
element('network').onclick = () => {
  const url = element('endpoint').value;
  if (!/^wss?:\/\//.test(url)) return log('Enter a ws:// or wss:// URL');
  element('source').value = `browser.onopen = function()\n  print("Transport connected")\n  browser.send("hello")\nend\nbrowser.onmessage = function(data)\n  print("Received", #data, "bytes:", data)\nend\nbrowser.onerror = print\nbrowser.onclose = function(code) print("Closed:", code) end\nbrowser.connect(${JSON.stringify(url)})\n`;
};
start();
