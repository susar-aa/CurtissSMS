import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import Database from 'better-sqlite3';

// Stable application pepper base ONLY for automated test / non-packaged CLI development
const DEV_FALLBACK_PEPPER = 'curtiss-sms-deterministic-pin-salt-key-2026';

export interface IPepperRecoveryStatus {
  isInitialized: boolean;
  source: 'dpapi' | 'recovery_key' | 'fallback' | 'manual';
  requiresRecovery: boolean;
  error?: string;
}

export class PinSecurityService {
  private static hmacSecret: string = DEV_FALLBACK_PEPPER;
  private static isInitialized = false;
  private static storageDirectory: string = '';

  public static getStorageDirectory(): string {
    if (this.storageDirectory) return this.storageDirectory;
    try {
      if (app && typeof app.getPath === 'function') {
        this.storageDirectory = path.join(app.getPath('userData'), 'CurtissSMS_Security');
      } else {
        this.storageDirectory = path.resolve(process.cwd(), 'data');
      }
    } catch {
      this.storageDirectory = path.resolve(process.cwd(), 'data');
    }
    return this.storageDirectory;
  }

  public static isPackagedProduction(): boolean {
    return (app && typeof app.isPackaged === 'boolean') ? app.isPackaged : false;
  }

  /**
   * Initializes the secure pepper.
   * IN PRODUCTION: Windows DPAPI (safeStorage) or a valid recovery key MUST be present and working.
   * If DPAPI is unavailable or failing in packaged production, halts immediately rather than using a fallback.
   * IN TEST/CLI: Uses fallback only when not packaged and safeStorage is truly unavailable.
   */
  public static initializeSecurePepper(customStorageDir?: string, db?: Database.Database): IPepperRecoveryStatus {
    try {
      const storageDir = customStorageDir || this.getStorageDirectory();
      this.storageDirectory = storageDir;

      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      const pepperFile = path.join(storageDir, 'pepper.bin');
      const recoveryKeyFile = path.join(storageDir, 'recovery_pepper.key');

      // Check if the current database already has user records
      let hasUsersWithHmac = false;
      if (db) {
        try {
          const row = db.prepare('SELECT count(*) as count FROM users WHERE pin_hmac IS NOT NULL').get() as { count: number };
          hasUsersWithHmac = row && row.count > 0;
        } catch {
          // Table might not exist yet during migration bootstrap
        }
      }

      // Check if recovery key file exists (e.g. manually placed for migration recovery)
      if (fs.existsSync(recoveryKeyFile)) {
        try {
          const recSecret = fs.readFileSync(recoveryKeyFile, 'utf8').trim();
          if (recSecret && recSecret.length >= 16) {
            this.hmacSecret = recSecret;
            this.isInitialized = true;
            // Also store encrypted into DPAPI for local machine use if available
            if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
              try {
                fs.writeFileSync(pepperFile, safeStorage.encryptString(recSecret));
              } catch {}
            }
            return { isInitialized: true, source: 'recovery_key', requiresRecovery: false };
          }
        } catch {}
      }

      // SafeStorage (Windows DPAPI) flow
      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        if (fs.existsSync(pepperFile)) {
          try {
            const encryptedData = fs.readFileSync(pepperFile);
            const decrypted = safeStorage.decryptString(encryptedData);
            if (decrypted && decrypted.length >= 16) {
              this.hmacSecret = decrypted;
              this.isInitialized = true;
              return { isInitialized: true, source: 'dpapi', requiresRecovery: false };
            }
          } catch (decryptErr) {
            // DPAPI failed to decrypt (e.g. database copied to another computer or user profile)
            if (hasUsersWithHmac) {
              this.isInitialized = false;
              this.hmacSecret = '';
              return {
                isInitialized: false,
                source: 'dpapi',
                requiresRecovery: true,
                error: 'Cannot decrypt database pepper with current Windows DPAPI keys. Database contains existing user accounts. Please enter your recovery key to restore access.'
              };
            }
          }
        }

        // If existing users exist but pepperFile is missing, do NOT silently regenerate!
        if (hasUsersWithHmac) {
          this.isInitialized = false;
          this.hmacSecret = '';
          return {
            isInitialized: false,
            source: 'dpapi',
            requiresRecovery: true,
            error: 'Security pepper file missing for database with existing accounts. Automatic regeneration prevented to preserve account accessibility.'
          };
        }

        // Fresh installation: Generate new cryptographically random 32-byte pepper and encrypt with DPAPI
        const newPepper = crypto.randomBytes(32).toString('hex');
        const encrypted = safeStorage.encryptString(newPepper);
        fs.writeFileSync(pepperFile, encrypted);
        this.hmacSecret = newPepper;
        this.isInitialized = true;
        return { isInitialized: true, source: 'dpapi', requiresRecovery: false };
      }

      // If in packaged production and safeStorage is NOT available, NEVER use fallback!
      if (this.isPackagedProduction()) {
        this.isInitialized = false;
        this.hmacSecret = '';
        return {
          isInitialized: false,
          source: 'dpapi',
          requiresRecovery: true,
          error: 'Windows OS safeStorage (DPAPI) is unavailable in this environment. Production operation halted for cryptographic security.'
        };
      }
    } catch (err) {
      if (this.isPackagedProduction()) {
        this.isInitialized = false;
        this.hmacSecret = '';
        return {
          isInitialized: false,
          source: 'dpapi',
          requiresRecovery: true,
          error: `Cryptographic storage initialization error: ${(err as Error).message}`
        };
      }
    }

    // Only non-packaged automated test / CLI development environments may reach here
    this.hmacSecret = DEV_FALLBACK_PEPPER;
    this.isInitialized = true;
    return { isInitialized: true, source: 'fallback', requiresRecovery: false };
  }

  /**
   * Applies a recovery key provided by authorized administrator recovery flow.
   */
  public static recoverPepper(secret: string, customStorageDir?: string): boolean {
    if (!secret || secret.trim().length < 16) {
      throw new Error('Invalid recovery key. Key must be at least 16 characters.');
    }
    const cleanSecret = secret.trim();
    this.hmacSecret = cleanSecret;
    this.isInitialized = true;

    try {
      const storageDir = customStorageDir || this.getStorageDirectory();
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      const pepperFile = path.join(storageDir, 'pepper.bin');
      const recoveryKeyFile = path.join(storageDir, 'recovery_pepper.key');

      fs.writeFileSync(recoveryKeyFile, cleanSecret, { mode: 0o600 });

      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        fs.writeFileSync(pepperFile, safeStorage.encryptString(cleanSecret));
      }
      return true;
    } catch {
      return true;
    }
  }

  public static getExportableRecoveryKey(): string {
    if (!this.hmacSecret) {
      throw new Error('Security pepper is not currently initialized.');
    }
    return this.hmacSecret;
  }

  /**
   * Exports an encrypted recovery package protected by an Administrator passphrase.
   * Format: JSON with scrypt salt, iv, tag, and ciphertext.
   * Can be safely backed up alongside or separately from the database.
   */
  public static exportEncryptedRecoveryPackage(passphrase: string): string {
    if (!passphrase || passphrase.length < 8) {
      throw new Error('Recovery passphrase must be at least 8 characters long.');
    }
    const secret = this.getExportableRecoveryKey();
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(passphrase, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const pkg = {
      version: 1,
      kdf: 'scrypt',
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      ciphertext: encrypted.toString('hex'),
      createdAt: new Date().toISOString()
    };
    return JSON.stringify(pkg, null, 2);
  }

  /**
   * Imports and applies an encrypted recovery package using the Administrator passphrase.
   */
  public static importEncryptedRecoveryPackage(packageJson: string, passphrase: string, customStorageDir?: string): boolean {
    if (!passphrase) {
      throw new Error('Passphrase is required to decrypt recovery package.');
    }

    try {
      const pkg = JSON.parse(packageJson);
      if (!pkg.salt || !pkg.iv || !pkg.tag || !pkg.ciphertext) {
        throw new Error('Invalid recovery package format.');
      }

      const salt = Buffer.from(pkg.salt, 'hex');
      const iv = Buffer.from(pkg.iv, 'hex');
      const tag = Buffer.from(pkg.tag, 'hex');
      const ciphertext = Buffer.from(pkg.ciphertext, 'hex');

      const key = crypto.scryptSync(passphrase, salt, 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      return this.recoverPepper(decrypted, customStorageDir);
    } catch (err) {
      throw new Error(`Failed to decrypt recovery package: ${(err as Error).message}`);
    }
  }

  public static setHmacSecret(secret: string): void {
    if (secret && secret.length >= 16) {
      this.hmacSecret = secret;
      this.isInitialized = true;
    }
  }

  public static getHmacSecret(): string {
    return this.hmacSecret;
  }

  public static validatePinFormat(pin: string): void {
    if (!pin || typeof pin !== 'string' || !/^\d{5}$/.test(pin)) {
      throw new Error('PIN must be exactly 5 numeric digits.');
    }
  }

  public static hashPinForVerification(pin: string): string {
    this.validatePinFormat(pin);
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(pin, salt, 64);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  public static verifyPin(pin: string, storedHash: string): boolean {
    if (!storedHash || !storedHash.startsWith('scrypt:')) {
      return false;
    }
    const parts = storedHash.split(':');
    if (parts.length !== 3) {
      return false;
    }
    const salt = parts[1];
    const originalHash = parts[2];
    const derivedKey = crypto.scryptSync(pin, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(derivedKey.toString('hex')), Buffer.from(originalHash));
  }

  public static computePinHmac(pin: string): string {
    this.validatePinFormat(pin);
    if (!this.hmacSecret) {
      throw new Error('Security initialization required: Cryptographic pepper is not available.');
    }
    return crypto.createHmac('sha256', this.hmacSecret).update(pin).digest('hex');
  }

  public static createSecurePinCredentials(pin: string): { pinHash: string; pinHmac: string } {
    return {
      pinHash: this.hashPinForVerification(pin),
      pinHmac: this.computePinHmac(pin)
    };
  }
}
