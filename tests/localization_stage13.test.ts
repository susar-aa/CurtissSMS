import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseMigrator } from '../electron/database/migrator';
import { ReportService } from '../electron/services/reportService';
import { SchoolSettingsService } from '../electron/services/schoolSettingsService';
import {
  ENGLISH_TRANSLATIONS,
  SINHALA_TRANSLATIONS,
  ITranslationDictionary,
  SupportedLanguage
} from '../src/types/i18n';

describe('Stage 13: English & Sinhala Localization & CSV UTF-8 Integrity', () => {
  let db: Database.Database;
  let reportService: ReportService;
  let schoolSettingsService: SchoolSettingsService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const migrator = new DatabaseMigrator(db);
    migrator.runMigrations();
    reportService = new ReportService(db);
    schoolSettingsService = new SchoolSettingsService(db);
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  describe('1. Dictionary Key Parity & Non-Empty Translations', () => {
    const englishKeys = Object.keys(ENGLISH_TRANSLATIONS) as Array<keyof ITranslationDictionary>;
    const sinhalaKeys = Object.keys(SINHALA_TRANSLATIONS) as Array<keyof ITranslationDictionary>;

    it('should have exact key parity between English and Sinhala dictionaries', () => {
      expect(englishKeys.length).toBeGreaterThan(50);
      expect(sinhalaKeys.length).toBe(englishKeys.length);

      for (const key of englishKeys) {
        expect(SINHALA_TRANSLATIONS[key], `Missing Sinhala translation for key: "${key}"`).toBeDefined();
        expect(typeof SINHALA_TRANSLATIONS[key]).toBe('string');
        expect(SINHALA_TRANSLATIONS[key].trim().length).toBeGreaterThan(0);
      }
    });

    it('should contain authentic Sinhala Unicode strings without placeholder questions marks or gibberish', () => {
      // Sample key checks for critical application domains
      expect(SINHALA_TRANSLATIONS.appTitle).toBe('කර්ටිස් පාසල් කළමනාකරණය');
      expect(SINHALA_TRANSLATIONS.students).toBe('සිසුන්');
      expect(SINHALA_TRANSLATIONS.feeManagement).toBe('ගාස්තු කළමනාකරණය');
      expect(SINHALA_TRANSLATIONS.reportsAndPrint).toBe('වාර්තා සහ මුද්‍රණය');
      expect(SINHALA_TRANSLATIONS.lkr).toBe('රු.');
      expect(SINHALA_TRANSLATIONS.active).toBe('ක්‍රියාකාරී');
      expect(SINHALA_TRANSLATIONS.male).toBe('පිරිමි');
      expect(SINHALA_TRANSLATIONS.female).toBe('ගැහැණු');
    });
  });

  describe('2. School Settings Default Language Integration', () => {
    const mockAdmin = { id: 1, displayName: 'Admin User', role: 'Admin' as const };

    it('should default to "en" when initialized', () => {
      const settings = schoolSettingsService.getSchoolSettings();
      expect(settings).not.toBeNull();
      expect(settings?.defaultLanguage).toBe('en');
    });

    it('should allow Admin to update default language to "si"', () => {
      schoolSettingsService.updateSchoolSettings(mockAdmin, {
        schoolName: 'SWRDB College',
        defaultLanguage: 'si'
      });

      const updated = schoolSettingsService.getSchoolSettings();
      expect(updated?.defaultLanguage).toBe('si');
    });

    it('should reject invalid language codes', () => {
      expect(() => {
        schoolSettingsService.updateSchoolSettings(mockAdmin, {
          schoolName: 'SWRDB College',
          defaultLanguage: 'fr' as any
        });
      }).toThrow();
    });
  });

  describe('3. CSV Export UTF-8 BOM Verification', () => {
    beforeEach(() => {
      // Seed academic year and family first to fulfill foreign key constraints
      db.prepare(`
        INSERT INTO academic_years (year)
        VALUES (2026)
      `).run();

      db.prepare(`
        INSERT INTO families (id, family_code, house_no, full_address)
        VALUES (101, 'FAM-101', '12A', 'Temple Road, Colombo')
      `).run();

      db.prepare(`
        INSERT INTO students (
          id, admission_number, full_name, gender, date_of_birth,
          current_grade, status, admission_date, family_id
        ) VALUES (
          101, 'ADM-2026-99', 'කසුන් පෙරේරා', 'Male', '2010-05-15',
          10, 'Active', '2026-01-10', 101
        )
      `).run();

      db.prepare(`
        INSERT INTO student_annual_fees (
          id, student_id, academic_year, fee_amount, status
        ) VALUES (
          101, 101, 2026, 15000, 'Unpaid'
        )
      `).run();
    });

    it('exportStudentsCsv should prepend UTF-8 BOM (\\uFEFF) and preserve Sinhala text', () => {
      const csv = reportService.exportStudentsCsv();
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('කසුන් පෙරේරා');
      expect(csv).toContain('ADM-2026-99');
    });

    it('exportFeesCsv should prepend UTF-8 BOM (\\uFEFF) and preserve Sinhala text', () => {
      const csv = reportService.exportFeesCsv();
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('කසුන් පෙරේරා');
      expect(csv).toContain('15000');
    });
  });
});
