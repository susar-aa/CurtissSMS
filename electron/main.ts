import fs from 'fs';
import path from 'path';
import os from 'os';

// CRITICAL: Prevent ELECTRON_RUN_AS_NODE inheritance or environment poisoning
delete process.env.ELECTRON_RUN_AS_NODE;

const logFile = path.join(os.tmpdir(), 'curtiss_startup.log');
function bootLog(msg: string) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch {}
}

bootLog('=== CurtissSMS Starting Up ===');
bootLog(`Node: ${process.version}, ExecPath: ${process.execPath}`);

import { app, BrowserWindow, dialog } from 'electron';
import { initializeDatabase, closeDatabase } from './database/connection';
import { DatabaseMigrator } from './database/migrator';
import { registerIpcHandlers } from './ipc/handlers';
import { AcademicYearService } from './services/academicYearService';
import { FeePaymentService } from './services/feePaymentService';

bootLog(`Electron app loaded: ${typeof app}`);

let mainWindow: BrowserWindow | null = null;

function logError(message: string, error?: unknown): void {
  const logEntry = `[${new Date().toISOString()}] ${message} ${error ? (error instanceof Error ? error.stack || error.message : String(error)) : ''}\n`;
  bootLog(`ERROR: ${logEntry}`);
  try {
    const userDataPath = app.getPath('userData');
    const appLogPath = path.join(userDataPath, 'curtiss_error.log');
    fs.appendFileSync(appLogPath, logEntry, 'utf8');
  } catch {}
}

process.on('uncaughtException', (err) => {
  logError('Uncaught Exception:', err);
  try {
    dialog.showErrorBox('CurtissSMS Error', `An unexpected error occurred:\n${err.message}`);
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  logError('Unhandled Rejection:', reason);
});

function createWindow(): void {
  bootLog('Creating BrowserWindow...');
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
    backgroundColor: '#ffffff',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logError(`Failed to load URL ${validatedURL}: [${errorCode}] ${errorDescription}`);
    dialog.showErrorBox('CurtissSMS Load Error', `Failed to load interface: ${errorDescription} (${errorCode})`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    bootLog(`Loading Dev Server URL: ${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    bootLog(`Loading file: ${indexPath}`);
    mainWindow.loadFile(indexPath).catch((err) => {
      logError('Failed to load file ' + indexPath, err);
    });
  }

  mainWindow.on('ready-to-show', () => {
    bootLog('BrowserWindow ready-to-show event fired.');
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    bootLog('BrowserWindow closed.');
    mainWindow = null;
  });
}

// Single instance lock
bootLog('Requesting single instance lock...');
const hasLock = app.requestSingleInstanceLock();
bootLog(`Single instance lock acquired: ${hasLock}`);

if (!hasLock) {
  bootLog('Single instance lock not acquired. Exiting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    bootLog('Second instance detected. Focusing existing window.');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    bootLog('app.whenReady resolved. Initializing database...');
    try {
      // 1. Initialize SQLite Database & apply migrations
      const db = initializeDatabase();
      bootLog('Database initialized. Running migrations...');
      const migrator = new DatabaseMigrator(db);
      const migrationResult = migrator.runMigrations();
      bootLog(`Migrations applied: ${migrationResult.applied}, Version: ${migrationResult.currentVersion}`);

      // 2. Register typed IPC Handlers
      bootLog('Registering IPC handlers...');
      registerIpcHandlers();
      bootLog('IPC handlers registered.');

      // 3. Reliable Offline Catch-up Processing for Academic Years & Grade Promotions (Stage 09)
      try {
        bootLog('Checking pending academic year promotions (Catch-up processing)...');
        const academicYearService = new AcademicYearService(db);
        const catchupResult = academicYearService.runCatchupPromotions();
        bootLog(`Catch-up promotion result: ${catchupResult.message}`);
      } catch (promotionErr) {
        logError('Non-fatal catchup promotion error during startup:', promotionErr);
      }

      // 4. Reliable Offline Catch-up for Annual Fee Generation (Stage 11)
      try {
        bootLog('Checking pending annual fee generation (Startup fee catch-up)...');
        const feePaymentService = new FeePaymentService(db);
        const feeCatchupResult = feePaymentService.runStartupCatchupFeeGeneration();
        bootLog(`Catch-up fee generation result: ${feeCatchupResult.message}`);
      } catch (feeCatchupErr) {
        logError('Non-fatal catchup fee generation error during startup:', feeCatchupErr);
      }

      // 5. Create Windows Application Window
      createWindow();
      bootLog('createWindow called successfully.');
    } catch (err) {
      logError('Fatal initialization error:', err);
      dialog.showErrorBox('Database Initialization Error', `Failed to initialize CurtissSMS database:\n${err instanceof Error ? err.message : String(err)}`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    bootLog('All windows closed. Cleaning up...');
    closeDatabase();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
