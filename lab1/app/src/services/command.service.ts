import type { Subject } from '../domain/types.js';
import type { CommandResult, ParamDef } from '../kernel/hru.types.js';
import type { SecurityKernel } from '../kernel/security-kernel.js';

export interface CommandInfo {
  name: string;
  description: string;
  params: ParamDef[];
}

export class CommandService {
  constructor(private readonly kernel: SecurityKernel) {}

  /** Public commands with the kernel-bound `caller` param removed, for rendering forms. */
  list(): CommandInfo[] {
    return this.kernel.listCommands().map((c) => ({
      name: c.name,
      description: c.description,
      params: c.params.filter((p) => p.type !== 'caller'),
    }));
  }

  run(subject: Subject, command: string, args: Record<string, string>): CommandResult {
    return this.kernel.execute(subject, command, args);
  }
}
