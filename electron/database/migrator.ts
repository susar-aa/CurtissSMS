import Database from 'better-sqlite3';

export interface IMigration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

import { migration001 } from './migrations/001_initial_schema';
import { migration002 } from './migrations/002_core_taxonomy_and_users';
import { migration003 } from './migrations/003_families_and_students';
import { migration004 } from './migrations/004_academic_and_fees';
import { migration005 } from './migrations/005_schema_corrections';
import { migration006 } from './migrations/006_final_verification_corrections';
import { migration007 } from './migrations/007_school_settings_stage04_verification';
import { migration008 } from './migrations/008_quick_create_lookup_stage05';
import { migration009 } from './migrations/009_student_management_stage06';
import { migration010 } from './migrations/010_parent_guardian_management_stage07';
import { migration011 } from './migrations/011_sibling_management_stage08';
import { migration012 } from './migrations/012_academic_years_and_promotions_stage09';
import { migration013 } from './migrations/013_annual_fee_configuration_stage10';

export const ALL_MIGRATIONS: IMigration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013
];

export class DatabaseMigrator {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public initMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public getCurrentVersion(): number {
    this.initMigrationTable();
    const row = this.db.prepare('SELECT MAX(version) as currentVersion FROM schema_migrations').get() as { currentVersion: number | null };
    return row && row.currentVersion !== null ? row.currentVersion : 0;
  }

  public runMigrations(): { applied: number; currentVersion: number } {
    this.initMigrationTable();
    const currentVersion = this.getCurrentVersion();
    let appliedCount = 0;

    const pendingMigrations = ALL_MIGRATIONS
      .filter(m => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    if (pendingMigrations.length === 0) {
      return { applied: 0, currentVersion };
    }

    // Official SQLite Migration standard:
    // Temporarily turn OFF foreign key enforcement during schema alterations/table recreation,
    // execute migrations transactionally, then verify referential integrity with foreign_key_check.
    this.db.pragma('foreign_keys = OFF');
    try {
      for (const migration of pendingMigrations) {
        const runTransaction = this.db.transaction(() => {
          migration.up(this.db);
          this.db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
            migration.version,
            migration.name
          );
        });

        runTransaction();
        appliedCount++;
      }

      // Verify foreign key integrity across all migrated tables
      const fkCheck = this.db.pragma('foreign_key_check') as unknown[];
      if (Array.isArray(fkCheck) && fkCheck.length > 0) {
        throw new Error(`Migration foreign key integrity check failed with ${fkCheck.length} violations.`);
      }
    } finally {
      // Always re-enable foreign keys
      this.db.pragma('foreign_keys = ON');
    }

    return {
      applied: appliedCount,
      currentVersion: this.getCurrentVersion()
    };
  }
}
