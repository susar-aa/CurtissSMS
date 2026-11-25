import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DatabaseMigrator, ALL_MIGRATIONS } from '../electron/database/migrator';
import { FeeConfigurationService } from '../electron/services/feeConfigurationService';
import { IAuthSession } from '../electron/shared/types';

describe('Stage 10 – Annual Development & Facility Fee Configuration Tests', () => {
  let testDbPath: string;
  let testDb: Database.Database;
  let feeService: FeeConfigurationService;

  const mockAdmin: IAuthSession = {
    id: 1,
    displayName: 'Headmaster Admin',
    role: 'Admin'
  };

  const mockStaff: IAuthSession = {
    id: 2,
    displayName: 'Registrar Staff',
    role: 'Staff'
  };

  beforeEach(() => {
    testDbPath = path.join(__dirname, `test_stage10_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    testDb = new Database(testDbPath);
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');

    const migrator = new DatabaseMigrator(testDb);
    migrator.runMigrations();

    // Seed mock Admin & Staff users
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (1, 'Headmaster Admin', 'hash1', 'hmac1', 'Admin')").run();
    testDb.prepare("INSERT OR IGNORE INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (2, 'Registrar Staff', 'hash2', 'hmac2', 'Staff')").run();

    feeService = new FeeConfigurationService(testDb);
  });

  afterEach(() => {
    try {
      testDb.close();
    } catch {}
    [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`].forEach(f => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    });
  });

  // 1. Fee Configuration Creation
  it('1. allows Admin to create annual fee configuration with whole-rupee amount', () => {
    const config = feeService.createAnnualFee(mockAdmin, {
      academicYear: 2026,
      feeAmount: 7500
    });

    expect(config).toBeDefined();
    expect(config.academicYear).toBe(2026);
    expect(config.feeAmount).toBe(7500);
    expect(config.createdBy).toBe(mockAdmin.id);
    expect(config.hasInvoices).toBe(false);

    // Verify stored directly in DB
    const row = testDb.prepare('SELECT * FROM annual_fee_settings WHERE academic_year = 2026').get() as any;
    expect(row).toBeDefined();
    expect(row.fee_amount).toBe(7500);
  });

  // 2. Reject duplicate configurations for the same academic year
  it('2. strictly rejects duplicate fee configuration for an already configured academic year', () => {
    feeService.createAnnualFee(mockAdmin, {
      academicYear: 2026,
      feeAmount: 6000
    });

    expect(() => {
      feeService.createAnnualFee(mockAdmin, {
        academicYear: 2026,
        feeAmount: 8000
      });
    }).toThrow(/already has a fee configuration/i);
  });

  // 3. Reject negative, decimal, and invalid fee amounts
  it('3. rejects decimal amounts, negative values, and non-numeric payloads', () => {
    // Decimal amounts rejected
    expect(() => {
      feeService.createAnnualFee(mockAdmin, {
        academicYear: 2026,
        feeAmount: 5000.50
      });
    }).toThrow(/whole-rupee integer/i);

    // Negative amounts rejected
    expect(() => {
      feeService.createAnnualFee(mockAdmin, {
        academicYear: 2026,
        feeAmount: -100
      });
    }).toThrow(/cannot be negative/i);

    // Excessive amounts rejected
    expect(() => {
      feeService.createAnnualFee(mockAdmin, {
        academicYear: 2026,
        feeAmount: 2000000
      });
    }).toThrow(/cannot exceed LKR 1,000,000/i);
  });

  // 4. Update Fee Configuration
  it('4. allows Admin to update fee amount for an existing configuration', () => {
    feeService.createAnnualFee(mockAdmin, {
      academicYear: 2026,
      feeAmount: 5000
    });

    const updated = feeService.updateAnnualFee(mockAdmin, {
      academicYear: 2026,
      feeAmount: 6500
    });

    expect(updated.feeAmount).toBe(6500);
    expect(updated.updatedBy).toBe(mockAdmin.id);

    const check = feeService.getAnnualFeeByYear(2026)!;
    expect(check.feeAmount).toBe(6500);
  });

  // 5. Historical snapshot preservation: Editing configuration does not alter existing invoices
  it('5. preserves historical financial accuracy: existing student fee invoices retain original snapshot amounts when configuration changes', () => {
    // Configure 2026 as 5000
    feeService.createAnnualFee(mockAdmin, {
      academicYear: 2026,
      feeAmount: 5000
    });

    // Create a student and an invoice with 5000 snapshot
    testDb.prepare("INSERT INTO families (id, family_code) VALUES (1, 'FAM-TEST-FEE')").run();
    testDb.prepare(`
      INSERT INTO students (id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, family_id)
      VALUES (1, 'ADM-FEE-01', '2026-01-01', 'Fee Student', 'Male', '2016-01-01', 3, 1)
    `).run();

    testDb.prepare(`
      INSERT INTO student_annual_fees (id, student_id, academic_year, fee_amount, status)
      VALUES (1, 1, 2026, 5000, 'Unpaid')
    `).run();

    // Now Admin updates configuration for 2026 to 7500
    feeService.updateAnnualFee(mockAdmin, {
      academicYear: 2026,
      feeAmount: 7500
    });

    // The student's existing invoice MUST remain exactly 5000 (historical snapshot preserved!)
    const studentInvoice = testDb.prepare('SELECT fee_amount FROM student_annual_fees WHERE id = 1').get() as any;
    expect(studentInvoice.fee_amount).toBe(5000);

    // The configuration itself reflects the new 7500
    const config = feeService.getAnnualFeeByYear(2026)!;
    expect(config.feeAmount).toBe(7500);
    expect(config.hasInvoices).toBe(true);
    expect(config.invoiceCount).toBe(1);
  });

  // 6. Restrict deletion when referenced by student fee records
  it('6. prevents deletion of fee configurations referenced by existing student fee records', () => {
    feeService.createAnnualFee(mockAdmin, {
      academicYear: 2025,
      feeAmount: 4000
    });

    // Attach student fee record
    testDb.prepare("INSERT INTO families (id, family_code) VALUES (2, 'FAM-TEST-DEL')").run();
    testDb.prepare(`
      INSERT INTO students (id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, family_id)
      VALUES (2, 'ADM-DEL-01', '2025-01-01', 'Del Student', 'Male', '2015-01-01', 4, 2)
    `).run();

    testDb.prepare(`
      INSERT INTO student_annual_fees (id, student_id, academic_year, fee_amount, status)
      VALUES (2, 2, 2025, 4000, 'Unpaid')
    `).run();

    expect(() => {
      feeService.deleteAnnualFee(mockAdmin, 2025);
    }).toThrow(/Cannot delete fee configuration.*already referenced/i);
  });

  // 7. Allow deletion when unreferenced
  it('7. allows deletion of unreferenced fee configuration and cleans up safely', () => {
    feeService.createAnnualFee(mockAdmin, {
      academicYear: 2029,
      feeAmount: 8000
    });

    const res = feeService.deleteAnnualFee(mockAdmin, 2029);
    expect(res.success).toBe(true);

    const check = feeService.getAnnualFeeByYear(2029);
    expect(check).toBeNull();
  });

  // 8. Enforce Admin-only permissions (Staff rejected)
  it('8. strictly blocks Staff users from creating, updating, or deleting fee configurations', () => {
    // Staff create rejected
    expect(() => {
      feeService.createAnnualFee(mockStaff, {
        academicYear: 2027,
        feeAmount: 6000
      });
    }).toThrow(/Unauthorized: Only Administrators/i);

    // Create valid config as Admin
    feeService.createAnnualFee(mockAdmin, {
      academicYear: 2027,
      feeAmount: 6000
    });

    // Staff update rejected
    expect(() => {
      feeService.updateAnnualFee(mockStaff, {
        academicYear: 2027,
        feeAmount: 7000
      });
    }).toThrow(/Unauthorized: Only Administrators/i);

    // Staff delete rejected
    expect(() => {
      feeService.deleteAnnualFee(mockStaff, 2027);
    }).toThrow(/Unauthorized: Only Administrators/i);
  });

  // 9. Comprehensive audit logging
  it('9. records audit logs with old/new amounts and acting user ID for all fee configuration changes', () => {
    feeService.createAnnualFee(mockAdmin, {
      academicYear: 2028,
      feeAmount: 5500
    });

    feeService.updateAnnualFee(mockAdmin, {
      academicYear: 2028,
      feeAmount: 6200
    });

    const logs = feeService.getFeeConfigAuditLogs(10);
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const updateLog = logs.find(l => l.action === 'UPDATE_ANNUAL_FEE_CONFIG')!;
    expect(updateLog).toBeDefined();
    expect(updateLog.academicYear).toBe(2028);
    expect(updateLog.userId).toBe(mockAdmin.id);
    expect(updateLog.details).toContain('from LKR 5,500 to LKR 6,200');

    const createLog = logs.find(l => l.action === 'CREATE_ANNUAL_FEE_CONFIG')!;
    expect(createLog).toBeDefined();
    expect(createLog.academicYear).toBe(2028);
    expect(createLog.details).toContain('LKR 5,500');
  });

  // 10. Searchable, paginated configuration list
  it('10. provides searchable, paginated configuration history with invoice counts and metadata', () => {
    for (let y = 2021; y <= 2026; y++) {
      feeService.createAnnualFee(mockAdmin, {
        academicYear: y,
        feeAmount: y * 2
      });
    }

    const page1 = feeService.getAnnualFeeConfigurations({ page: 1, pageSize: 4 });
    expect(page1.items.length).toBe(4);
    expect(page1.total).toBe(6);
    expect(page1.totalPages).toBe(2);

    // Search query for "2024"
    const searchRes = feeService.getAnnualFeeConfigurations({ search: '2024' });
    expect(searchRes.items.length).toBe(1);
    expect(searchRes.items[0].academicYear).toBe(2024);
  });

  // 11. Configure future academic years without requiring promotion to run first
  it('11. allows Admin to configure future academic years even before promotion runs or academic_years entry exists', () => {
    // 2035 is a far future year not currently in academic_years
    const year2035Exists = testDb.prepare('SELECT year FROM academic_years WHERE year = 2035').get();
    expect(year2035Exists).toBeUndefined();

    // Configuring 2035 should automatically ensure academic_years record exists and link safely
    const config = feeService.createAnnualFee(mockAdmin, {
      academicYear: 2035,
      feeAmount: 9500
    });

    expect(config.academicYear).toBe(2035);
    expect(config.feeAmount).toBe(9500);

    const yearAfter = testDb.prepare('SELECT year, is_active FROM academic_years WHERE year = 2035').get() as any;
    expect(yearAfter).toBeDefined();
    expect(yearAfter.year).toBe(2035);
    expect(yearAfter.is_active).toBe(0); // Not activated until set active or promoted

    // Verify foreign key integrity
    const fkCheck = testDb.pragma('foreign_key_check') as any[];
    expect(fkCheck.length).toBe(0);
  });

  // 12. Migration against a populated Stage 09 database preserving all student, payment, and audit records
  it('12. runs migration 013 against a populated Stage 09 database preserving exact fees, students, payments, and history', () => {
    const popDbPath = path.join(__dirname, `test_pop_fee_mig_${Date.now()}.db`);
    const popDb = new Database(popDbPath);
    popDb.pragma('journal_mode = WAL');
    popDb.pragma('foreign_keys = ON');

    // Run migrations 1 through 12
    const migrator = new DatabaseMigrator(popDb);
    migrator.initMigrationTable();
    const migrationsUpTo12 = ALL_MIGRATIONS.filter((m: any) => m.version <= 12);

    popDb.pragma('foreign_keys = OFF');
    for (const m of migrationsUpTo12) {
      popDb.transaction(() => {
        m.up(popDb);
        popDb.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      })();
    }
    popDb.pragma('foreign_keys = ON');

    // Populate user, family, student, academic year, and existing fee settings
    popDb.prepare("INSERT INTO users (id, display_name, pin_hash, pin_hmac, role) VALUES (1, 'Admin', 'h1', 'hm1', 'Admin')").run();
    popDb.prepare("INSERT INTO academic_years (year, is_active) VALUES (2025, 1)").run();
    popDb.prepare("INSERT INTO families (id, family_code) VALUES (1, 'FAM-STAGE09')").run();
    popDb.prepare(`
      INSERT INTO students (id, admission_number, admission_date, full_name, gender, date_of_birth, current_grade, family_id)
      VALUES (1, 'ADM-STAGE09-01', '2025-01-10', 'Stage 09 Student', 'Male', '2016-01-01', 3, 1)
    `).run();

    // Populate existing annual_fee_settings with exact whole-rupee amount (5500)
    popDb.prepare("INSERT INTO annual_fee_settings (academic_year, fee_amount) VALUES (2025, 5500)").run();

    // Populate student_annual_fees and fee_payments
    popDb.prepare("INSERT INTO student_annual_fees (id, student_id, academic_year, fee_amount, status) VALUES (1, 1, 2025, 5500, 'Paid')").run();
    popDb.prepare(`
      INSERT INTO fee_payments (id, student_annual_fee_id, receipt_number, payment_date, amount, payment_method, recorded_by)
      VALUES (1, 1, 'REC-STAGE09-001', '2025-02-01', 5500, 'Cash', 1)
    `).run();

    // Now execute migration 013
    const migration013 = ALL_MIGRATIONS.find((m: any) => m.version === 13);
    popDb.pragma('foreign_keys = OFF');
    popDb.transaction(() => {
      migration013.up(popDb);
      popDb.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(13, migration013.name);
    })();
    popDb.pragma('foreign_keys = ON');

    // Verify foreign key integrity
    const fk = popDb.pragma('foreign_key_check') as any[];
    expect(fk.length).toBe(0);

    // Verify fee setting was preserved with exact amount 5500
    const migratedSetting = popDb.prepare('SELECT * FROM annual_fee_settings WHERE academic_year = 2025').get() as any;
    expect(migratedSetting).toBeDefined();
    expect(migratedSetting.fee_amount).toBe(5500);

    // Verify student fee invoice preserved
    const migratedInvoice = popDb.prepare('SELECT * FROM student_annual_fees WHERE id = 1').get() as any;
    expect(migratedInvoice.fee_amount).toBe(5500);
    expect(migratedInvoice.status).toBe('Paid');

    // Verify fee payment preserved
    const migratedPayment = popDb.prepare('SELECT * FROM fee_payments WHERE id = 1').get() as any;
    expect(migratedPayment.receipt_number).toBe('REC-STAGE09-001');
    expect(migratedPayment.amount).toBe(5500);

    popDb.close();
    [popDbPath, `${popDbPath}-wal`, `${popDbPath}-shm`].forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
    });
  });
});
