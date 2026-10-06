import type { ObjectKind } from '../domain/types.js';

export const RIGHTS = ['own', 'read', 'write', 'control'] as const;
export type Right = (typeof RIGHTS)[number];

/**
 * How a command parameter is bound and validated:
 * - caller:  always bound by the kernel to the authenticated subject (never taken from the request)
 * - subject: an existing object of kind 'subject'
 * - file:    an existing object of kind 'file'
 * - object:  any existing object (subject, file or system)
 * - newName: a valid name that is not taken yet (used by create_* primitives)
 * - right:   a member of R
 */
export type ParamType = 'caller' | 'subject' | 'file' | 'object' | 'newName' | 'right';

export interface ParamDef {
  name: string;
  type: ParamType;
}

/** `right ∈ M[subject, object]`; subject and object are parameter names. */
export interface Condition {
  right: Right;
  subject: string;
  object: string;
}

export type PrimitiveOp =
  | { op: 'enter' | 'delete'; right: Right | { param: string }; subject: string; object: string }
  | { op: 'create_subject' | 'create_object' | 'destroy_subject' | 'destroy_object'; target: string };

export interface CommandDef {
  name: string;
  description: string;
  /** Internal commands are run only by services (e.g. registration) and are hidden from the API. */
  internal?: boolean;
  params: ParamDef[];
  conditions: Condition[]; // joined with AND; may be empty
  body: PrimitiveOp[];
}

/** Reserved name of the object that carries the admin right `control`. */
export const SYSTEM_OBJECT = 'system';

export interface CommandResult {
  command: string;
  args: Record<string, string>; // includes the bound caller
  changes: string[]; // human-readable, e.g. "enter read into M[bob, report.txt]"
}

export interface Capability {
  object: string;
  kind: ObjectKind;
  rights: Right[];
}

export interface MatrixSnapshot {
  subjects: string[];
  objects: string[];
  cells: Record<string, Record<string, Right[]>>;
}
