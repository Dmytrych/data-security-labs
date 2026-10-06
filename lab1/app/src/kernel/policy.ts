import type { CommandDef } from './hru.types.js';

/**
 * The HRU security policy: the complete, finite set of commands that may change the protection state.
 * Each command is `if <conditions> then <primitive ops>`; anything not expressible here is impossible.
 * The literal 'system' in a condition is the system object, not a parameter.
 */
export const POLICY: readonly CommandDef[] = [
  // HRU "create subject s". Unconditional, but internal: reachable only through registration.
  {
    name: 'register_subject',
    description: 'Create a new subject (used by registration only)',
    internal: true,
    params: [{ name: 's', type: 'newName' }],
    conditions: [],
    body: [{ op: 'create_subject', target: 's' }],
  },
  // Anyone may create a file and becomes its owner with full access to it.
  {
    name: 'create_file',
    description: 'Create a new file owned by you',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 'f', type: 'newName' },
    ],
    conditions: [],
    body: [
      { op: 'create_object', target: 'f' },
      { op: 'enter', right: 'own', subject: 'caller', object: 'f' },
      { op: 'enter', right: 'read', subject: 'caller', object: 'f' },
      { op: 'enter', right: 'write', subject: 'caller', object: 'f' },
    ],
  },
  // Only the owner may destroy a file; the cascade removes its whole column of M.
  {
    name: 'remove_file',
    description: 'Delete a file you own',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 'f', type: 'file' },
    ],
    conditions: [{ right: 'own', subject: 'caller', object: 'f' }],
    body: [{ op: 'destroy_object', target: 'f' }],
  },
  // Discretionary grant: the owner decides who may read. This is the DAC "discretion".
  {
    name: 'grant_read',
    description: 'Give subject s the read right on your file f',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 's', type: 'subject' },
      { name: 'f', type: 'file' },
    ],
    conditions: [{ right: 'own', subject: 'caller', object: 'f' }],
    body: [{ op: 'enter', right: 'read', subject: 's', object: 'f' }],
  },
  {
    name: 'grant_write',
    description: 'Give subject s the write right on your file f',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 's', type: 'subject' },
      { name: 'f', type: 'file' },
    ],
    conditions: [{ right: 'own', subject: 'caller', object: 'f' }],
    body: [{ op: 'enter', right: 'write', subject: 's', object: 'f' }],
  },
  {
    name: 'revoke_read',
    description: 'Take the read right on your file f away from subject s',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 's', type: 'subject' },
      { name: 'f', type: 'file' },
    ],
    conditions: [{ right: 'own', subject: 'caller', object: 'f' }],
    body: [{ op: 'delete', right: 'read', subject: 's', object: 'f' }],
  },
  {
    name: 'revoke_write',
    description: 'Take the write right on your file f away from subject s',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 's', type: 'subject' },
      { name: 'f', type: 'file' },
    ],
    conditions: [{ right: 'own', subject: 'caller', object: 'f' }],
    body: [{ op: 'delete', right: 'write', subject: 's', object: 'f' }],
  },
  // Admin commands: guarded by control ∈ M[caller, system].
  {
    name: 'admin_create_object',
    description: 'Admin: create file o owned by subject owner',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 'o', type: 'newName' },
      { name: 'owner', type: 'subject' },
    ],
    conditions: [{ right: 'control', subject: 'caller', object: 'system' }],
    body: [
      { op: 'create_object', target: 'o' },
      { op: 'enter', right: 'own', subject: 'owner', object: 'o' },
      { op: 'enter', right: 'read', subject: 'owner', object: 'o' },
      { op: 'enter', right: 'write', subject: 'owner', object: 'o' },
    ],
  },
  // Destroys the subject's row and column of M, plus its credentials and sessions (FK cascade).
  {
    name: 'admin_destroy_subject',
    description: 'Admin: delete subject s',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 's', type: 'subject' },
    ],
    conditions: [{ right: 'control', subject: 'caller', object: 'system' }],
    body: [{ op: 'destroy_subject', target: 's' }],
  },
  {
    name: 'admin_destroy_object',
    description: 'Admin: delete file o',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 'o', type: 'file' },
    ],
    conditions: [{ right: 'control', subject: 'caller', object: 'system' }],
    body: [{ op: 'destroy_object', target: 'o' }],
  },
  // Relaxation of classic HRU: the right is a parameter (still restricted to R by binding).
  // With o = system and r = control this makes another subject an admin, which is intended.
  {
    name: 'admin_enter_right',
    description: 'Admin: enter right r into M[s, o]',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 's', type: 'subject' },
      { name: 'o', type: 'object' },
      { name: 'r', type: 'right' },
    ],
    conditions: [{ right: 'control', subject: 'caller', object: 'system' }],
    body: [{ op: 'enter', right: { param: 'r' }, subject: 's', object: 'o' }],
  },
  {
    name: 'admin_delete_right',
    description: 'Admin: delete right r from M[s, o]',
    params: [
      { name: 'caller', type: 'caller' },
      { name: 's', type: 'subject' },
      { name: 'o', type: 'object' },
      { name: 'r', type: 'right' },
    ],
    conditions: [{ right: 'control', subject: 'caller', object: 'system' }],
    body: [{ op: 'delete', right: { param: 'r' }, subject: 's', object: 'o' }],
  },
];
