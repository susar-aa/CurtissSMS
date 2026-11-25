import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let dbInstance: Database.Database | null = null;
let currentDbPath: string = '';

export function getDatabasePath(): string {
  if (currentDbPath) {
    return currentDbPath;
  }
  
  let baseDir: string;
  try {
    if (app && typeof app.getPath === 'function') {
      baseDir = path.join(app.getPath('userData'), 'CurtissSMS_Data');
    } else {
      baseDir = path.resolve(process.cwd(), 'data');
    }
  } catch {
    baseDir = path.resolve(process.cwd(), 'data');
  }

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  currentDbPath = path.join(baseDir, 'curtisssms.db');
  return currentDbPath;
}

export function initializeDatabase(customPath?: string): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = customPath || getDatabasePath();
  currentDbPath = dbPath;

  const parentDir = path.dirname(dbPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

  // Enable WAL (Write-Ahead Logging) mode for high concurrency & safe crash-recovery
  db.pragma('journal_mode = WAL');
  // Enable foreign key constraints
  db.pragma('foreign_keys = ON');
  // Synchronous NORMAL is optimal for WAL mode
  db.pragma('synchronous = NORMAL');

  dbInstance = db;
  return db;
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    return initializeDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } finally {
      dbInstance = null;
    }
  }
}
