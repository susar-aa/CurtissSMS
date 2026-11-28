import { IMigration } from '../migrator';

export const migration014: IMigration = {
  version: 14,
  name: 'fee_generation_and_payments_stage11',
  up: (db) => {
    // 1. Ensure system_settings has auto_generate_new_student_fee default seeded
    db.prepare(`
      INSERT OR IGNORE INTO system_settings (key, value, description)
      VALUES ('auto_generate_new_student_fee', '0', 'Auto-generate current-year fee when registering student (0=OFF, 1=ON)')
    `).run();

    // 2. High-performance covering indexes for student_annual_fees and fee_payments (Stage 11)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_student_annual_fees_year_status_student 
        ON student_annual_fees(academic_year, status, student_id);

      CREATE INDEX IF NOT EXISTS idx_student_annual_fees_student_year
        ON student_annual_fees(student_id, academic_year);

      CREATE INDEX IF NOT EXISTS idx_fee_payments_fee_id
        ON fee_payments(student_annual_fee_id);

      CREATE INDEX IF NOT EXISTS idx_fee_payments_receipt_nocase
        ON fee_payments(receipt_number COLLATE NOCASE);

      CREATE INDEX IF NOT EXISTS idx_fee_payments_date_recorder
        ON fee_payments(payment_date, recorded_by);
    `);
  }
};
