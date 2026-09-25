/** TCP forwarder: Docker cannot route Tailscale 100.x; Pi dials host.docker.internal instead. */
import { writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';

const destHost = process.argv[2];
const destPort = Number(process.argv[3]);
const portFile = process.argv[4];
if (!destHost || !Number.isFinite(destPort) || destPort <= 0 || !portFile) {
  console.error('usage: bun eval/host-gateway-proxy.ts <dest-host> <dest-port> <port-file>');
  process.exit(2);
}

const server = createServer((client) => {
  const upstream = connect(destPort, destHost, () => {
    client.pipe(upstream);
    upstream.pipe(client);
  });
  const fail = (): void => {
    client.destroy();
    upstream.destroy();
  };
  client.on('error', fail);
  client.on('close', fail);
  upstream.on('error', fail);
  upstream.on('close', fail);
});

server.listen(0, '0.0.0.0', () => {
  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    console.error('eval proxy: listen failed');
    process.exit(1);
  }
  writeFileSync(portFile, `${String(addr.port)}\n`);
});
