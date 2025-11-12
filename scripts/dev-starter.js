const { exec } = require('child_process');
const { PORTS } = require('../dist/webui/ports');

const commands = [
  {
    name: 'backend-build',
    command: 'npm run build:watch',
    prefixColor: 'yellow',
  },
  {
    name: 'backend',
    command: `cross-env PORT=${PORTS.DEV_API} nodemon --watch dist dist/webui/index.js`,
    prefixColor: 'blue',
  },
  {
    name: 'frontend',
    command: `cross-env VITE_DEV_API_PORT=${PORTS.DEV_API} npm run webui:frontend`,
    prefixColor: 'green',
  },
];

const concurrentlyCommand = `concurrently -n "${commands.map(c => c.name).join(',')}" -c "${commands.map(c => c.prefixColor).join(',')}" ${commands.map(c => `\"${c.command}\"`).join(' ')}`;

const mainCommand = `kill-port ${PORTS.DEV_API} ${PORTS.DEV_FRONTEND} ${PORTS.PROD_API} && npm run build && ${concurrentlyCommand}`;

const child = exec(mainCommand, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

