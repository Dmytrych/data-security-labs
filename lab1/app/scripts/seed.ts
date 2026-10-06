import { loadConfig } from '../src/config.js';
import { createContainer, initializeKernel, type Container } from '../src/container.js';
import type { Subject } from '../src/domain/types.js';
import type { Right } from '../src/kernel/hru.types.js';

const PASSWORD = 'password';
const config = loadConfig();
const container = createContainer(config);
await initializeKernel(container, config);

const { kernel, services } = container;
const sessions: { tokenHash: string; subject: Subject }[] = [];

function exists(name: string): boolean {
  return kernel.matrixSnapshot().objects.includes(name);
}

function hasRight(subject: string, object: string, right: Right): boolean {
  return kernel.matrixSnapshot().cells[subject]?.[object]?.includes(right) ?? false;
}

/** Log in through AuthService exactly as a user would, and return the acting subject. */
async function loginAs(name: string): Promise<Subject> {
  const { token } = await services.auth.login(name, PASSWORD);
  const session = services.auth.authenticate(token);
  sessions.push(session);
  return session.subject;
}

async function ensureSubject(name: string): Promise<void> {
  if (exists(name)) return console.log(`= subject ${name} exists`);
  await services.auth.register(name, PASSWORD);
  console.log(`+ subject ${name}`);
}

function ensureFile(owner: Subject, name: string, content: string): void {
  if (exists(name)) return console.log(`= file ${name} exists`);
  services.commands.run(owner, 'create_file', { f: name });
  services.objects.write(owner, name, content);
  console.log(`+ file ${name} (owner ${owner.name})`);
}

function ensureGrant(owner: Subject, command: 'grant_read' | 'grant_write', subject: string, file: string): void {
  const right = command === 'grant_read' ? 'read' : 'write';
  if (hasRight(subject, file, right)) return console.log(`= ${right} ∈ M[${subject}, ${file}]`);
  services.commands.run(owner, command, { s: subject, f: file });
  console.log(`+ ${command}(${subject}, ${file})`);
}

function printMatrix(c: Container): void {
  const { subjects, objects, cells } = c.kernel.matrixSnapshot();
  const rows = Object.fromEntries(
    subjects.map((s) => [s, Object.fromEntries(objects.map((o) => [o, (cells[s]?.[o] ?? []).join(',')]))]),
  );
  console.table(rows);
}

try {
  for (const name of ['alice', 'bob', 'mallory']) await ensureSubject(name);

  const alice = await loginAs('alice');
  ensureFile(alice, 'secret.txt', "Alice's secret: launch code 0000");
  ensureFile(alice, 'report.txt', 'Quarterly report');
  ensureGrant(alice, 'grant_read', 'bob', 'report.txt');

  const bob = await loginAs('bob');
  ensureFile(bob, 'bob-notes.txt', "Bob's notes");

  console.log('\nAccess matrix M (rows: subjects, columns: objects):');
  printMatrix(container);
} finally {
  for (const session of sessions) services.auth.logout(session);
  container.db.close();
}
