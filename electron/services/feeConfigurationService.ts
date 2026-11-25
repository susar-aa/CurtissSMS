import Database from 'better-sqlite3';
import {
  IAuthSession,
  IAnnualFeeSetting,
  ISetAnnualFeeInput,
  IFeeConfigFilterQuery,
  IPaginatedResult,
  IFeeConfigAuditLog
} from '../shared/types';

export class FeeConfigurationService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Validates and ensures whole-rupee integer fee amount (rejects negative numbers, decimals, non-integers).
   */
  public validateFeeAmount(amount: unknown): number {
    if (amount === null || amount === undefined || typeof amount !== 'number') {
      throw new Error('Fee amount must be a valid number.');
    }

    if (!Number.isInteger(amount)) {
      throw new Error('Fee amount must be a whole-rupee integer value without cents or decimal fractions.');
    }

    if (amount < 0) {
      throw new Error('Fee amount cannot be negative.');
    }

    if (amount > 1000000) {
      throw new Error('Fee amount cannot exceed LKR 1,000,000.');
    }

    return amount;
  }

  /**
   * Validates valid academic year (between 2000 and 2100).
   */
  public validateAcademicYear(year: unknown): number {
    if (year === null || year === undefined || typeof year !== 'number' || !Number.isInteger(year)) {
      throw new Error('Academic year must be a valid integer year.');
    }

    if (year < 2000 || year > 2100) {
      throw new Error(`Academic year ${year} is outside the allowable range (2000–2100).`);
    }

    return year;
  }

  /**
   * Ensures an academic_years entry exists for the given year.
   */
  private ensureAcademicYearExists(year: number): void {
    const row = this.db.prepare('SELECT year FROM academic_years WHERE year = ?').get(year);
    if (!row) {
      this.db.prepare(`
        INSERT INTO academic_years (year, is_active, created_at)
        VALUES (?, 0, CURRENT_TIMESTAMP)
      `).run(year);
    }
  }

  /**
   * Retrieves an annual fee configuration for a specific academic year.
   */
  public getAnnualFeeByYear(year: number): IAnnualFeeSetting | null {
    const validYear = this.validateAcademicYear(year);

    const row = this.db.prepare(`
      SELECT 
        f.academic_year, 
        f.fee_amount, 
        f.created_at, 
        f.updated_at, 
        f.created_by, 
        u1.display_name as created_by_name,
        f.updated_by, 
        u2.display_name as updated_by_name,
        COUNT(s.id) as invoice_count
      FROM annual_fee_settings f
      LEFT JOIN users u1 ON f.created_by = u1.id
      LEFT JOIN users u2 ON f.updated_by = u2.id
      LEFT JOIN student_annual_fees s ON f.academic_year = s.academic_year
      WHERE f.academic_year = ?
      GROUP BY f.academic_year
    `).get(validYear) as Record<string, unknown> | undefined;

    if (!row) return null;

    const invoiceCount = Number(row.invoice_count || 0);

    return {
      academicYear: Number(row.academic_year),
      feeAmount: Number(row.fee_amount),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      createdBy: row.created_by ? Number(row.created_by) : null,
      createdByName: row.created_by_name ? String(row.created_by_name) : null,
      updatedBy: row.updated_by ? Number(row.updated_by) : null,
      updatedByName: row.updated_by_name ? String(row.updated_by_name) : null,
      hasInvoices: invoiceCount > 0,
      invoiceCount
    };
  }

  /**
   * Retrieves paginated, searchable list of annual fee configurations.
   */
  public getAnnualFeeConfigurations(query: IFeeConfigFilterQuery = {}): IPaginatedResult<IAnnualFeeSetting> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 10));
    const offset = (page - 1) * pageSize;
    const search = query.search ? query.search.trim() : '';

    let whereClause = '';
    const params: unknown[] = [];

    if (search) {
      whereClause = 'WHERE CAST(f.academic_year AS TEXT) LIKE ?';
      params.push(`%${search}%`);
    }

    const countRow = this.db.prepare(`
      SELECT COUNT(*) as total 
      FROM annual_fee_settings f
      ${whereClause}
    `).get(...params) as { total: number };

    const total = countRow.total;
    const totalPages = Math.ceil(total / pageSize) || 1;

    const rows = this.db.prepare(`
      SELECT 
        f.academic_year, 
        f.fee_amount, 
        f.created_at, 
        f.updated_at, 
        f.created_by, 
        u1.display_name as created_by_name,
        f.updated_by, 
        u2.display_name as updated_by_name,
        COUNT(s.id) as invoice_count
      FROM annual_fee_settings f
      LEFT JOIN users u1 ON f.created_by = u1.id
      LEFT JOIN users u2 ON f.updated_by = u2.id
      LEFT JOIN student_annual_fees s ON f.academic_year = s.academic_year
      ${whereClause}
      GROUP BY f.academic_year
      ORDER BY f.academic_year DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as Array<Record<string, unknown>>;

    const items: IAnnualFeeSetting[] = rows.map(r => {
      const invoiceCount = Number(r.invoice_count || 0);
      return {
        academicYear: Number(r.academic_year),
        feeAmount: Number(r.fee_amount),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
        createdBy: r.created_by ? Number(r.created_by) : null,
        createdByName: r.created_by_name ? String(r.created_by_name) : null,
        updatedBy: r.updated_by ? Number(r.updated_by) : null,
        updatedByName: r.updated_by_name ? String(r.updated_by_name) : null,
        hasInvoices: invoiceCount > 0,
        invoiceCount
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages
    };
  }

  /**
   * Creates a new annual Development & Facility Fee configuration for an academic year.
   * Admin only. Enforces non-duplicate year.
   */
  public createAnnualFee(user: IAuthSession, input: ISetAnnualFeeInput): IAnnualFeeSetting {
    if (user.role !== 'Admin') {
      throw new Error('Unauthorized: Only Administrators can configure annual fees.');
    }

    const year = this.validateAcademicYear(input.academicYear);
    const amount = this.validateFeeAmount(input.feeAmount);

    this.ensureAcademicYearExists(year);

    const existing = this.db.prepare('SELECT academic_year FROM annual_fee_settings WHERE academic_year = ?').get(year);
    if (existing) {
      throw new Error(`Academic Year ${year} already has a fee configuration. Please edit the existing configuration instead of creating a duplicate.`);
    }

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO annual_fee_settings (academic_year, fee_amount, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(year, amount, user.id, user.id);

      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'CREATE_ANNUAL_FEE_CONFIG', 'annual_fee_settings', ?, ?)
      `).run(
        user.id,
        String(year),
        `Admin ${user.displayName} configured annual Development & Facility Fee for Academic Year ${year} as LKR ${amount.toLocaleString()}.`
      );
    });

    tx();

    return this.getAnnualFeeByYear(year)!;
  }

  /**
   * Updates an existing annual Development & Facility Fee configuration.
   * Admin only.
   * Preserves historical student fee invoices (student_annual_fees records retain their original fee amount snapshot).
   */
  public updateAnnualFee(user: IAuthSession, input: ISetAnnualFeeInput): IAnnualFeeSetting {
    if (user.role !== 'Admin') {
      throw new Error('Unauthorized: Only Administrators can configure annual fees.');
    }

    const year = this.validateAcademicYear(input.academicYear);
    const newAmount = this.validateFeeAmount(input.feeAmount);

    const currentSetting = this.db.prepare(`
      SELECT fee_amount 
      FROM annual_fee_settings 
      WHERE academic_year = ?
    `).get(year) as { fee_amount: number } | undefined;

    if (!currentSetting) {
      throw new Error(`No annual fee configuration found for Academic Year ${year}.`);
    }

    const oldAmount = Number(currentSetting.fee_amount);

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE annual_fee_settings 
        SET fee_amount = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE academic_year = ?
      `).run(newAmount, user.id, year);

      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'UPDATE_ANNUAL_FEE_CONFIG', 'annual_fee_settings', ?, ?)
      `).run(
        user.id,
        String(year),
        `Admin ${user.displayName} updated annual Development & Facility Fee for Academic Year ${year} from LKR ${oldAmount.toLocaleString()} to LKR ${newAmount.toLocaleString()}. Existing student fee records retain their historical snapshots.`
      );
    });

    tx();

    return this.getAnnualFeeByYear(year)!;
  }

  /**
   * Deletes an annual Development & Facility Fee configuration.
   * Admin only.
   * Strictly blocked if student fee invoices already reference this academic year.
   */
  public deleteAnnualFee(user: IAuthSession, year: number): { success: boolean; message: string } {
    if (user.role !== 'Admin') {
      throw new Error('Unauthorized: Only Administrators can delete annual fee configurations.');
    }

    const validYear = this.validateAcademicYear(year);

    const config = this.getAnnualFeeByYear(validYear);
    if (!config) {
      throw new Error(`No annual fee configuration found for Academic Year ${validYear}.`);
    }

    if (config.hasInvoices) {
      throw new Error(`Cannot delete fee configuration for Academic Year ${validYear}: It is already referenced by ${config.invoiceCount} student fee record(s). Deleting it would compromise historical financial integrity.`);
    }

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM annual_fee_settings WHERE academic_year = ?').run(validYear);

      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'DELETE_ANNUAL_FEE_CONFIG', 'annual_fee_settings', ?, ?)
      `).run(
        user.id,
        String(validYear),
        `Admin ${user.displayName} deleted unreferenced annual Development & Facility Fee configuration for Academic Year ${validYear} (was LKR ${config.feeAmount.toLocaleString()}).`
      );
    });

    tx();

    return {
      success: true,
      message: `Annual fee configuration for Academic Year ${validYear} deleted successfully.`
    };
  }

  /**
   * Retrieves audit log history for fee configurations.
   */
  public getFeeConfigAuditLogs(limit = 50): IFeeConfigAuditLog[] {
    const rows = this.db.prepare(`
      SELECT 
        a.id, a.action, a.entity_id as academic_year, a.details,
        a.user_id, u.display_name as user_name, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.entity_type = 'annual_fee_settings'
      ORDER BY a.id DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      id: Number(r.id),
      action: String(r.action),
      academicYear: Number(r.academic_year),
      details: String(r.details),
      userId: r.user_id ? Number(r.user_id) : null,
      userName: r.user_name ? String(r.user_name) : null,
      createdAt: String(r.created_at)
    }));
  }
}
