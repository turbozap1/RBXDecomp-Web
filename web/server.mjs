import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { delimiter, join } from 'node:path';

const directory = fileURLToPath(new URL('.',import.meta.url));
const child = spawn(process.execPath,[join(directory,'server-runtime.mjs'),...process.argv.slice(2)],{
  stdio:'inherit',
  env:{...process.env,NODE_PATH:[join(directory,'node_modules'),process.env.NODE_PATH].filter(Boolean).join(delimiter)},
  windowsHide:true,
});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code ?? 1;});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
