/**
 * Demonstrates why discretionary models (HRU included) are vulnerable to a Trojan horse:
 * a program run by a user acts with that user's rights, and the kernel can't tell the difference.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createContainer, initializeKernel } from '../src/container.js';
import type { AuditEntry } from '../src/domain/types.js';
import type { MatrixSnapshot } from '../src/kernel/hru.types.js';

const tempDir = mkdtempSync(join(tmpdir(), 'hru-trojan-'));
const config = loadConfig({ dbPath: join(tempDir, 'demo.db'), port: 0 });
const container = createContainer(config);
await initializeKernel(container, config);

const server = createApp(container).listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

interface ApiResponse {
  status: number;
  data: unknown;
}

async function api(token: string | null, method: string, path: string, body?: unknown): Promise<ApiResponse> {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? (JSON.parse(text) as unknown) : null };
}

let failures = 0;
let stepNo = 0;

function step(title: string): void {
  console.log(`\n=== ${++stepNo}. ${title} ===`);
}

/** Print the call outcome and flag it if it isn't what the scenario expects. */
function show(label: string, res: ApiResponse, expected: number): ApiResponse {
  const verdict = res.status < 400 ? 'ALLOWED' : 'DENIED';
  const ok = res.status === expected;
  if (!ok) failures++;
  console.log(`${ok ? '  ' : '!!'} ${label} -> HTTP ${res.status} ${verdict}${ok ? '' : ` (expected ${expected})`}`);
  if (res.status >= 400) console.log(`     ${JSON.stringify(res.data)}`);
  return res;
}

async function registerAndLogin(name: string, password: string): Promise<string> {
  show(`register ${name}`, await api(null, 'POST', '/auth/register', { name, password }), 201);
  return login(name, password);
}

async function login(name: string, password: string): Promise<string> {
  const res = show(`login ${name}`, await api(null, 'POST', '/auth/login', { name, password }), 200);
  return (res.data as { token: string }).token;
}

/** Audit args without the bulky `changes` list, so the console table stays readable. */
function formatArgs(args: unknown): string {
  if (args === null || typeof args !== 'object') return args === null ? '' : JSON.stringify(args);
  const { changes: _changes, ...rest } = args as Record<string, unknown>;
  return JSON.stringify(rest);
}

const command = (token: string, name: string, args: Record<string, string>): Promise<ApiResponse> =>
  api(token, 'POST', '/commands', { command: name, args });

/**
 * The Trojan horse. Mallory hands this to Alice as a "useful tool" (say, a text formatter).
 * Whatever it advertises, when Alice runs it, it runs with Alice's token, i.e. with Alice's rights.
 */
async function usefulTool(token: string): Promise<void> {
  console.log('  [tool] "Formatting your documents..."');
  // (a) Rights leak: Alice owns secret.txt, so own ∈ M[alice, secret.txt] holds and the grant is legal.
  show('  (a) grant_read(mallory, secret.txt) as alice', await command(token, 'grant_read', { s: 'mallory', f: 'secret.txt' }), 200);
  // (b) Information-flow leak: copy the secret into a file Mallory owns. No matrix change at all.
  const secret = show('  (b) read secret.txt as alice', await api(token, 'GET', '/objects/secret.txt'), 200);
  const content = (secret.data as { content: string }).content;
  show('  (b) write it into inbox.txt as alice', await api(token, 'PUT', '/objects/inbox.txt', { content }), 200);
}

try {
  step('Register and log in alice and mallory');
  const alice = await registerAndLogin('alice', 'alice-pass');
  const mallory = await registerAndLogin('mallory', 'mallory-pass');

  step('alice creates secret.txt and writes her secret');
  show('create_file secret.txt', await command(alice, 'create_file', { f: 'secret.txt' }), 200);
  show('write secret.txt', await api(alice, 'PUT', '/objects/secret.txt', { content: "Alice's secret" }), 200);

  step('Baseline: mallory tries to read secret.txt');
  show('mallory GET /objects/secret.txt', await api(mallory, 'GET', '/objects/secret.txt'), 403);
  console.log('  The kernel protects the file: read ∉ M[mallory, secret.txt].');

  step('mallory prepares the trap');
  show('create_file inbox.txt', await command(mallory, 'create_file', { f: 'inbox.txt' }), 200);
  show('grant_write(alice, inbox.txt)', await command(mallory, 'grant_write', { s: 'alice', f: 'inbox.txt' }), 200);
  console.log('  mallory gives alice a "useful tool" (usefulTool).');

  step('alice runs the tool (with her own token)');
  await usefulTool(alice);

  step('mallory collects');
  const direct = show('mallory GET /objects/secret.txt', await api(mallory, 'GET', '/objects/secret.txt'), 200);
  const copy = show('mallory GET /objects/inbox.txt', await api(mallory, 'GET', '/objects/inbox.txt'), 200);
  console.log(`  via the leaked right: ${JSON.stringify((direct.data as { content?: string }).content)}`);
  console.log(`  via the copied data:  ${JSON.stringify((copy.data as { content?: string }).content)}`);

  step('admin inspects the matrix and the audit log');
  const admin = await login('admin', config.adminPassword);
  const matrix = show('GET /admin/matrix', await api(admin, 'GET', '/admin/matrix'), 200).data as MatrixSnapshot;
  console.table(
    Object.fromEntries(
      matrix.subjects.map((s) => [s, Object.fromEntries(matrix.objects.map((o) => [o, (matrix.cells[s]?.[o] ?? []).join(',')]))]),
    ),
  );
  const audit = show('GET /admin/audit', await api(admin, 'GET', '/admin/audit?limit=1000'), 200).data as AuditEntry[];
  console.table(
    [...audit].reverse().map((e) => ({
      actor: e.actor,
      event: e.event,
      action: e.action,
      args: formatArgs(e.args),
      outcome: e.outcome,
      reason: e.reason ?? '',
    })),
  );
  console.log('  Every malicious action above is recorded as ALLOWED with actor = alice:');
  console.log('  grant_read {s: mallory, f: secret.txt}, read secret.txt, write inbox.txt.');

  step('Conclusion');
  console.log('  - DAC/HRU decides by subject identity alone. It cannot tell what the user intended');
  console.log('    from what a program running with the user\'s rights does.');
  console.log('  - HRU controls the propagation of rights, not the flow of information: step 5(b) leaked');
  console.log('    the secret without touching the matrix.');
  console.log('  - Mitigations: mandatory access control (labels that follow the data, e.g. Bell-LaPadula)');
  console.log('    or an isolated software environment that only runs trusted, verified programs.');
} finally {
  server.close();
  container.db.close();
  rmSync(tempDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} step(s) did not behave as expected.`);
  process.exitCode = 1;
}
