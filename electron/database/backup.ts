import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { IBackupResult } from '../shared/types';
import { getDatabasePath } from './connection';
import { SchoolSettingsService } from '../services/schoolSettingsService';

export class DatabaseBackupService {
  private db: Database.Database;
  private customAssetsDir?: string;
  private customPhotosDir?: string;

  constructor(db: Database.Database, customAssetsDir?: string, customPhotosDir?: string) {
    this.db = db;
    if (customAssetsDir) {
      this.customAssetsDir = path.resolve(customAssetsDir);
    }
    if (customPhotosDir) {
      this.customPhotosDir = path.resolve(customPhotosDir);
    }
  }

  private getAssetsDir(): string {
    if (this.customAssetsDir) {
      return this.customAssetsDir;
    }
    try {
      if (app && typeof app.getPath === 'function') {
        return path.resolve(app.getPath('userData'), 'CurtissSMS_Data', 'assets');
      }
    } catch {}
    return path.resolve(process.cwd(), 'data', 'assets');
  }

  private getPhotosDir(): string {
    if (this.customPhotosDir) {
      return this.customPhotosDir;
    }
    if (this.customAssetsDir) {
      return path.resolve(this.customAssetsDir, '..', 'photos');
    }
    try {
      if (app && typeof app.getPath === 'function') {
        return path.resolve(app.getPath('userData'), 'CurtissSMS_Data', 'photos');
      }
    } catch {}
    return path.resolve(process.cwd(), 'data', 'photos');
  }

  public async createBackup(customBackupDir?: string): Promise<IBackupResult> {
    try {
      let backupDir = customBackupDir;
      if (!backupDir) {
        if (app && typeof app.getPath === 'function') {
          backupDir = path.join(app.getPath('userData'), 'CurtissSMS_Backups');
        } else {
          backupDir = path.resolve(process.cwd(), 'backups');
        }
      }

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `curtisssms_backup_${timestamp}.db`;
      const destinationPath = path.join(backupDir, backupFileName);

      // better-sqlite3 provides a safe, WAL-aware background backup API
      await this.db.backup(destinationPath);

      // Verify integrity of the newly created backup file
      const backupDb = new Database(destinationPath);
      try {
        const integrityCheck = backupDb.pragma('integrity_check', { simple: true }) as string;
        if (integrityCheck !== 'ok') {
          throw new Error(`Backup file integrity check failed: ${integrityCheck}`);
        }

        // Fresh archive tables for current backup run
        backupDb.exec(`
          DROP TABLE IF EXISTS backup_logo_archive;
          DROP TABLE IF EXISTS backup_student_photos_archive;
        `);

        // Store active logo in backup database if one exists on disk
        const schoolSetting = backupDb.prepare('SELECT logo_path FROM school_settings WHERE id = 1').get() as { logo_path: string | null } | undefined;
        if (schoolSetting && schoolSetting.logo_path) {
          const logoFileName = path.basename(schoolSetting.logo_path);
          const assetsDir = this.getAssetsDir();
          const logoDiskPath = path.resolve(assetsDir, logoFileName);

          if (fs.existsSync(logoDiskPath)) {
            const logoData = fs.readFileSync(logoDiskPath);
            backupDb.exec(`
              CREATE TABLE IF NOT EXISTS backup_logo_archive (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                logo_filename TEXT NOT NULL,
                logo_blob BLOB NOT NULL,
                archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
              );
            `);
            backupDb.prepare(`
              INSERT OR REPLACE INTO backup_logo_archive (id, logo_filename, logo_blob)
              VALUES (1, ?, ?)
            `).run(logoFileName, logoData);
          }
        }

        // Store student photos in backup database
        const hasStudentsTable = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='students'").get();
        if (hasStudentsTable) {
          const studentsWithPhotos = backupDb.prepare(
            "SELECT admission_number, photo_path FROM students WHERE photo_path IS NOT NULL AND photo_path != ''"
          ).all() as Array<{ admission_number: string; photo_path: string }>;

          if (studentsWithPhotos.length > 0) {
            backupDb.exec(`
              CREATE TABLE IF NOT EXISTS backup_student_photos_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admission_number TEXT NOT NULL,
                photo_filename TEXT NOT NULL,
                photo_blob BLOB NOT NULL,
                archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
              );
            `);
            const insertPhoto = backupDb.prepare(`
              INSERT INTO backup_student_photos_archive (admission_number, photo_filename, photo_blob)
              VALUES (?, ?, ?)
            `);
            const photosDir = this.getPhotosDir();
            for (const s of studentsWithPhotos) {
              const photoFileName = path.basename(s.photo_path);
              const photoDiskPath = path.resolve(photosDir, photoFileName);
              if (fs.existsSync(photoDiskPath)) {
                try {
                  const photoData = fs.readFileSync(photoDiskPath);
                  SchoolSettingsService.validateImageBuffer(photoData);
                  insertPhoto.run(s.admission_number, photoFileName, photoData);
                } catch {}
              }
            }
          }
        }
      } finally {
        backupDb.close();
      }

      const stats = fs.statSync(destinationPath);

      return {
        success: true,
        backupPath: destinationPath,
        bytesCopied: stats.size
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('RESTORE_BACKUP_ERROR:', err);
      return {
        success: false,
        error: message
      };
    }
  }

  public async restoreBackup(backupFilePath: string): Promise<IBackupResult> {
    try {
      if (!fs.existsSync(backupFilePath)) {
        throw new Error(`Backup file does not exist: ${backupFilePath}`);
      }

      // 1. Verify backup file integrity before attempting restore
      const sourceDb = new Database(backupFilePath, { readonly: true });
      let archivedLogo: { logo_filename: string; logo_blob: Buffer } | null = null;
      let archivedStudentPhotos: Array<{ photo_filename: string; photo_blob: Buffer }> = [];
      try {
        const integrityCheck = sourceDb.pragma('integrity_check', { simple: true }) as string;
        if (integrityCheck !== 'ok') {
          throw new Error(`Cannot restore corrupted backup file: ${integrityCheck}`);
        }

        // Extract archived logo if exists in backup
        const hasArchiveTable = sourceDb.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='backup_logo_archive'"
        ).get();
        if (hasArchiveTable) {
          const row = sourceDb.prepare('SELECT logo_filename, logo_blob FROM backup_logo_archive WHERE id = 1').get() as { logo_filename: string; logo_blob: Buffer } | undefined;
          if (row && row.logo_blob) {
            archivedLogo = row;
          }
        }

        // Extract archived student photos if exists in backup
        const hasPhotosTable = sourceDb.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='backup_student_photos_archive'"
        ).get();
        if (hasPhotosTable) {
          const photoRows = sourceDb.prepare(
            'SELECT photo_filename, photo_blob FROM backup_student_photos_archive'
          ).all() as Array<{ photo_filename: string; photo_blob: Buffer }>;
          archivedStudentPhotos = photoRows;
        }
      } finally {
        sourceDb.close();
      }

      // 2. Perform safe reverse online backup into current active database
      const sourceForRestore = new Database(backupFilePath);
      try {
        const inMemory = this.db.memory;
        if (inMemory) {
          // For in-memory database instance, deserialize the source database binary directly
          const sourceBuffer = fs.readFileSync(backupFilePath);
          // Empty existing tables and load from backup
          const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
          this.db.pragma('foreign_keys = OFF');
          for (const t of tables) {
            try { this.db.exec(`DROP TABLE IF EXISTS "${t.name}"`); } catch {}
          }
          const tempSource = new Database(sourceBuffer);
          try {
            // Re-create tables and copy data
            const schemas = tempSource.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ sql: string }>;
            for (const s of schemas) {
              this.db.exec(s.sql);
            }
            const copyTables = tempSource.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
            for (const t of copyTables) {
              const rows = tempSource.prepare(`SELECT * FROM "${t.name}"`).all() as Record<string, unknown>[];
              if (rows.length > 0) {
                const cols = Object.keys(rows[0]);
                const placeholders = cols.map(() => '?').join(', ');
                const insertStmt = this.db.prepare(`INSERT INTO "${t.name}" (${cols.join(', ')}) VALUES (${placeholders})`);
                const insertMany = this.db.transaction((items: Record<string, unknown>[]) => {
                  for (const item of items) {
                    insertStmt.run(cols.map(c => item[c]));
                  }
                });
                insertMany(rows);
              }
            }
          } finally {
            tempSource.close();
            this.db.pragma('foreign_keys = ON');
          }
        } else {
          try {
            await sourceForRestore.backup(this.db as unknown as string);
          } catch {
            const targetDbPath = (this.db && this.db.name && this.db.name !== '' && this.db.name !== ':memory:')
              ? this.db.name
              : getDatabasePath();
            await sourceForRestore.backup(targetDbPath);
          }
        }
      } finally {
        sourceForRestore.close();
      }

      // 3. Verify target database integrity post-restoration
      const postCheck = this.db.pragma('integrity_check', { simple: true }) as string;
      if (postCheck !== 'ok') {
        throw new Error(`Post-restore integrity check failed: ${postCheck}`);
      }

      // 4. Restore logo file to assets folder safely
      const assetsDir = this.getAssetsDir();
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      if (archivedLogo) {
        const safeFileName = path.basename(archivedLogo.logo_filename);
        const restorePath = path.resolve(assetsDir, safeFileName);
        if (restorePath.startsWith(assetsDir)) {
          fs.writeFileSync(restorePath, archivedLogo.logo_blob);
        }
      }

      // 5. Handle missing logo safely in SQLite if logo file does not exist on disk
      const hasSchoolSettings = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='school_settings'").get();
      if (hasSchoolSettings) {
        const setting = this.db.prepare('SELECT logo_path FROM school_settings WHERE id = 1').get() as { logo_path: string | null } | undefined;
        if (setting && setting.logo_path) {
          const expectedFile = path.resolve(assetsDir, path.basename(setting.logo_path));
          if (!fs.existsSync(expectedFile)) {
            // File missing or corrupted; safely clear reference in restored DB
            this.db.prepare('UPDATE school_settings SET logo_path = NULL WHERE id = 1').run();
          }
        }
      }

      // 6. Restore student photos to photos folder safely
      const photosDir = this.getPhotosDir();
      if (!fs.existsSync(photosDir)) {
        fs.mkdirSync(photosDir, { recursive: true });
      }

      if (archivedStudentPhotos && archivedStudentPhotos.length > 0) {
        for (const p of archivedStudentPhotos) {
          const safePhotoName = path.basename(p.photo_filename);
          const restorePhotoPath = path.resolve(photosDir, safePhotoName);
          if (restorePhotoPath.startsWith(photosDir)) {
            try {
              SchoolSettingsService.validateImageBuffer(p.photo_blob);
              fs.writeFileSync(restorePhotoPath, p.photo_blob);
            } catch {}
          }
        }
      }

      // Handle missing or corrupted student photos safely
      const hasStudentsAfterRestore = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='students'").get();
      if (hasStudentsAfterRestore) {
        const studentsToCheck = this.db.prepare(
          "SELECT id, photo_path FROM students WHERE photo_path IS NOT NULL AND photo_path != ''"
        ).all() as Array<{ id: number; photo_path: string }>;
        for (const s of studentsToCheck) {
          const expectedPhoto = path.resolve(photosDir, path.basename(s.photo_path));
          let isValid = false;
          if (fs.existsSync(expectedPhoto)) {
            try {
              const buf = fs.readFileSync(expectedPhoto);
              SchoolSettingsService.validateImageBuffer(buf);
              isValid = true;
            } catch {}
          }
          if (!isValid) {
            this.db.prepare('UPDATE students SET photo_path = NULL WHERE id = ?').run(s.id);
          }
        }
      }

      // Clean up temporary backup archives from active restored database
      try {
        this.db.exec(`
          DROP TABLE IF EXISTS backup_logo_archive;
          DROP TABLE IF EXISTS backup_student_photos_archive;
        `);
      } catch {}

      const stats = fs.statSync(backupFilePath);

      return {
        success: true,
        backupPath: backupFilePath,
        bytesCopied: stats.size
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('RESTORE_BACKUP_ERROR:', err);
      return {
        success: false,
        error: message
      };
    }
  }
}
