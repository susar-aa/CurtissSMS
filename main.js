"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const connection_1 = require("./database/connection");
const migrator_1 = require("./database/migrator");
const handlers_1 = require("./ipc/handlers");
let mainWindow = null;
function logError(message, error) {
    try {
        const logPath = path_1.default.join(electron_1.app.getPath('userData'), 'curtiss_error.log');
        const logEntry = `[${new Date().toISOString()}] ${message} ${error ? (error instanceof Error ? error.stack || error.message : String(error)) : ''}\n`;
        fs_1.default.appendFileSync(logPath, logEntry, 'utf8');
    }
    catch {
        // Fallback if userData is not available
        console.error(message, error);
    }
}
process.on('uncaughtException', (err) => {
    logError('Uncaught Exception:', err);
    electron_1.dialog.showErrorBox('CurtissSMS Error', `An unexpected error occurred:\n${err.message}`);
});
process.on('unhandledRejection', (reason) => {
    logError('Unhandled Rejection:', reason);
});
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1366,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        frame: true,
        backgroundColor: '#ffffff',
        show: true,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        }
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        logError(`Failed to load URL ${validatedURL}: [${errorCode}] ${errorDescription}`);
        electron_1.dialog.showErrorBox('CurtissSMS Load Error', `Failed to load interface: ${errorDescription} (${errorCode})`);
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        const indexPath = path_1.default.join(__dirname, '../dist/index.html');
        mainWindow.loadFile(indexPath).catch((err) => {
            logError('Failed to load file ' + indexPath, err);
        });
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// Ensure single instance lock
const hasLock = electron_1.app.requestSingleInstanceLock();
if (!hasLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
    electron_1.app.whenReady().then(() => {
        try {
            // 1. Initialize SQLite Database & apply migrations
            const db = (0, connection_1.initializeDatabase)();
            const migrator = new migrator_1.DatabaseMigrator(db);
            const migrationResult = migrator.runMigrations();
            console.log(`[CurtissSMS] Database initialized. Migrations applied: ${migrationResult.applied}, Version: ${migrationResult.currentVersion}`);
            // 2. Register typed IPC Handlers
            (0, handlers_1.registerIpcHandlers)();
            // 3. Create Windows Application Window
            createWindow();
        }
        catch (err) {
            logError('Fatal initialization error:', err);
            electron_1.dialog.showErrorBox('Database Initialization Error', `Failed to initialize CurtissSMS database:\n${err instanceof Error ? err.message : String(err)}`);
            electron_1.app.quit();
        }
    });
    electron_1.app.on('window-all-closed', () => {
        (0, connection_1.closeDatabase)();
        if (process.platform !== 'darwin') {
            electron_1.app.quit();
        }
    });
}
