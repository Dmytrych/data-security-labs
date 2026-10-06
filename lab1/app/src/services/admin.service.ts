import type { AuditEntry, AuditFilters, Subject } from '../domain/types.js';
import { SYSTEM_OBJECT, type MatrixSnapshot } from '../kernel/hru.types.js';
import type { SecurityKernel } from '../kernel/security-kernel.js';
import type { AuditService } from './audit.service.js';

/** Admin views, each guarded by control ∈ M[caller, system]. */
export class AdminService {
  constructor(
    private readonly kernel: SecurityKernel,
    private readonly auditService: AuditService,
  ) {}

  matrix(subject: Subject): MatrixSnapshot {
    this.kernel.authorize(subject, 'control', SYSTEM_OBJECT, 'view_matrix');
    return this.kernel.matrixSnapshot();
  }

  audit(subject: Subject, filters: AuditFilters): AuditEntry[] {
    this.kernel.authorize(subject, 'control', SYSTEM_OBJECT, 'view_audit');
    return this.auditService.list(filters);
  }
}
