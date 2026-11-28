import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { ISchoolSettings, IUpdateSchoolSettingsInput, ILogoUploadResult, IAuthSession } from '../shared/types';

export class SchoolSettingsService {
  private db: Database.Database;
  private logoStorageDir: string;

  constructor(db: Database.Database, customStorageDir?: string) {
    this.db = db;
    if (customStorageDir) {
      this.logoStorageDir = path.resolve(customStorageDir);
    } else {
      try {
        if (app && typeof app.getPath === 'function') {
          this.logoStorageDir = path.resolve(app.getPath('userData'), 'CurtissSMS_Data', 'assets');
        } else {
          this.logoStorageDir = path.resolve(process.cwd(), 'data', 'assets');
        }
      } catch {
        this.logoStorageDir = path.resolve(process.cwd(), 'data', 'assets');
      }
    }

    if (!fs.existsSync(this.logoStorageDir)) {
      fs.mkdirSync(this.logoStorageDir, { recursive: true });
    }
  }

  public static validateImageBuffer(buffer: Buffer): { format: 'png' | 'jpg'; extension: string; mimeType: string } {
    if (!buffer || buffer.length < 16) {
      throw new Error('Invalid or corrupted image file. Header is missing.');
    }

    // 1. Verify PNG structure
    const isPng = buffer[0] === 0x89 &&
                  buffer[1] === 0x50 &&
                  buffer[2] === 0x4E &&
                  buffer[3] === 0x47 &&
                  buffer[4] === 0x0D &&
                  buffer[5] === 0x0A &&
                  buffer[6] === 0x1A &&
                  buffer[7] === 0x0A;

    if (isPng) {
      // Decode PNG Chunks to ensure valid structural integrity
      let offset = 8;
      let hasIHDR = false;
      let hasIEND = false;

      while (offset < buffer.length) {
        if (offset + 8 > buffer.length) {
          throw new Error('Corrupted PNG image: truncated chunk header.');
        }

        const chunkLength = buffer.readUInt32BE(offset);
        const chunkType = buffer.toString('ascii', offset + 4, offset + 8);

        if (!hasIHDR && chunkType !== 'IHDR') {
          throw new Error('Corrupted PNG image: first chunk must be IHDR.');
        }
        if (chunkType === 'IHDR') {
          hasIHDR = true;
          if (chunkLength < 13) {
            throw new Error('Corrupted PNG image: invalid IHDR length.');
          }
        }
        if (chunkType === 'IEND') {
          hasIEND = true;
          break;
        }

        // Each chunk: 4 bytes length + 4 bytes type + chunkLength data + 4 bytes CRC
        offset += 8 + chunkLength + 4;
      }

      if (!hasIHDR) {
        throw new Error('Corrupted PNG image: missing IHDR header.');
      }
      if (!hasIEND) {
        throw new Error('Corrupted PNG image: missing IEND trailer.');
      }

      return { format: 'png', extension: '.png', mimeType: 'image/png' };
    }

    // 2. Verify JPEG structure
    const isJpg = buffer[0] === 0xFF &&
                  buffer[1] === 0xD8 &&
                  buffer[2] === 0xFF;

    if (isJpg) {
      // Walk through JPEG segments to verify valid structural markers
      let offset = 2;
      let hasSOF = false;
      let hasEOI = false;

      while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) {
          offset++;
          continue;
        }

        while (offset < buffer.length && buffer[offset] === 0xFF) {
          offset++;
        }

        if (offset >= buffer.length) break;

        const marker = buffer[offset];
        offset++;

        // EOI (End of Image)
        if (marker === 0xD9) {
          hasEOI = true;
          break;
        }

        // SOS (Start of Scan) - after this comes entropy-coded data
        if (marker === 0xDA) {
          // Look for EOI marker in the remainder of the buffer
          const eoiIndex = buffer.indexOf(Buffer.from([0xFF, 0xD9]), offset);
          if (eoiIndex !== -1) {
            hasEOI = true;
          }
          break;
        }

        // SOF0..SOF3 (Start of Frame markers)
        if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xCC)) {
          hasSOF = true;
        }

        // Markers without length: RST0-RST7, SOI, TEM
        if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) {
          continue;
        }

        // Read segment length
        if (offset + 2 > buffer.length) {
          throw new Error('Corrupted JPEG image: truncated segment length.');
        }
        const segmentLength = buffer.readUInt16BE(offset);
        if (segmentLength < 2) {
          throw new Error('Corrupted JPEG image: invalid segment length.');
        }
        offset += segmentLength;
      }

      // Check if image ends with or contains EOI (or standard JPEG header with SOF/EOI)
      if (!hasEOI) {
        const lastTwoBytes = buffer.subarray(buffer.length - 2);
        if (lastTwoBytes[0] === 0xFF && lastTwoBytes[1] === 0xD9) {
          hasEOI = true;
        }
      }

      if (!hasEOI && !hasSOF) {
        throw new Error('Corrupted JPEG image: missing valid frame or end-of-image markers.');
      }

      return { format: 'jpg', extension: '.jpg', mimeType: 'image/jpeg' };
    }

    throw new Error('Unsupported or corrupted image content. Only valid PNG, JPG, and JPEG images are allowed.');
  }

  public getSchoolSettings(): ISchoolSettings {
    const row = this.db.prepare(`
      SELECT 
        id, school_name, logo_path, address_line1, address_line2, city,
        contact_number1, contact_number2, email, website, reg_number,
        extra_info, default_language, updated_at
      FROM school_settings
      WHERE id = 1
    `).get() as {
      id: number;
      school_name: string;
      logo_path: string | null;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      contact_number1: string | null;
      contact_number2: string | null;
      email: string | null;
      website: string | null;
      reg_number: string | null;
      extra_info: string | null;
      default_language: 'en' | 'si';
      updated_at: string;
    } | undefined;

    if (!row) {
      this.db.prepare(`
        INSERT OR IGNORE INTO school_settings (id, school_name, default_language)
        VALUES (1, 'Curtiss Model School', 'en')
      `).run();
      return this.getSchoolSettings();
    }

    return {
      id: row.id,
      schoolName: row.school_name,
      logoPath: row.logo_path,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      contactNumber1: row.contact_number1,
      contactNumber2: row.contact_number2,
      email: row.email,
      website: row.website,
      regNumber: row.reg_number,
      extraInfo: row.extra_info,
      defaultLanguage: row.default_language,
      updatedAt: row.updated_at
    };
  }

  public updateSchoolSettings(adminUser: IAuthSession, input: IUpdateSchoolSettingsInput): ISchoolSettings {
    const trimmedName = input.schoolName ? input.schoolName.trim() : '';
    if (!trimmedName) {
      throw new Error('School Name is required.');
    }

    // Validate telephone numbers if provided
    if (input.contactNumber1 && input.contactNumber1.trim()) {
      const cleanPhone1 = input.contactNumber1.trim();
      if (!/^\d{10}$/.test(cleanPhone1)) {
        throw new Error('Primary Telephone Number must be exactly 10 digits.');
      }
    }

    if (input.contactNumber2 && input.contactNumber2.trim()) {
      const cleanPhone2 = input.contactNumber2.trim();
      if (!/^\d{10}$/.test(cleanPhone2)) {
        throw new Error('Secondary Telephone Number must be exactly 10 digits.');
      }
    }

    // Validate email if provided
    if (input.email && input.email.trim()) {
      const cleanEmail = input.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new Error('Invalid email address format.');
      }
    }

    // Language constraint: only 'en' or 'si' are permitted
    if (input.defaultLanguage !== undefined && input.defaultLanguage !== null) {
      if (input.defaultLanguage !== 'en' && input.defaultLanguage !== 'si') {
        throw new Error("Invalid default language. Only 'en' and 'si' are supported.");
      }
    }
    const lang = input.defaultLanguage === 'si' ? 'si' : 'en';

    this.db.prepare(`
      UPDATE school_settings
      SET 
        school_name = ?,
        address_line1 = ?,
        address_line2 = ?,
        city = ?,
        contact_number1 = ?,
        contact_number2 = ?,
        email = ?,
        website = ?,
        reg_number = ?,
        extra_info = ?,
        default_language = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      trimmedName,
      input.addressLine1?.trim() || null,
      input.addressLine2?.trim() || null,
      input.city?.trim() || null,
      input.contactNumber1?.trim() || null,
      input.contactNumber2?.trim() || null,
      input.email?.trim() || null,
      input.website?.trim() || null,
      input.regNumber?.trim() || null,
      input.extraInfo?.trim() || null,
      lang
    );

    // Audit log
    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'UPDATE_SETTINGS', 'school_settings', '1', ?)
      `).run(adminUser.id, `Updated school settings: ${trimmedName}`);
    } catch {}

    return this.getSchoolSettings();
  }

  public uploadLogo(adminUser: IAuthSession, fileName: string, fileDataBuffer: Buffer): ILogoUploadResult {
    // 1. Sanitize file name to prevent path traversal
    const safeBaseName = path.basename(fileName);
    const declaredExt = path.extname(safeBaseName).toLowerCase();
    const allowedExts = ['.png', '.jpg', '.jpeg'];
    if (!allowedExts.includes(declaredExt)) {
      throw new Error('Invalid file type. Only PNG, JPG, and JPEG images are supported.');
    }

    // 2. Validate file size (max 2MB = 2 * 1024 * 1024 bytes)
    const MAX_SIZE_BYTES = 2 * 1024 * 1024;
    if (!fileDataBuffer || fileDataBuffer.length === 0) {
      throw new Error('Image file is empty.');
    }
    if (fileDataBuffer.length > MAX_SIZE_BYTES) {
      throw new Error('Image file is too large. Maximum allowed size is 2MB.');
    }

    // 3. Inspect binary magic numbers to ensure genuine image content
    const verifiedImage = SchoolSettingsService.validateImageBuffer(fileDataBuffer);

    // Ensure declared extension matches actual binary format
    if (verifiedImage.format === 'png' && declaredExt !== '.png') {
      throw new Error('Declared extension does not match binary image format (expected PNG).');
    }
    if (verifiedImage.format === 'jpg' && declaredExt !== '.jpg' && declaredExt !== '.jpeg') {
      throw new Error('Declared extension does not match binary image format (expected JPG/JPEG).');
    }

    // 4. Capture current active logo for safe cleanup only AFTER successful write and DB update
    const current = this.getSchoolSettings();
    const oldLogoPath = current.logoPath;

    // 5. Generate secure random filename to avoid collisions and path traversal
    const secureRandomSuffix = Math.random().toString(36).substring(2, 10);
    const newFileName = `school_logo_${Date.now()}_${secureRandomSuffix}${verifiedImage.extension}`;
    const destinationPath = path.resolve(this.logoStorageDir, newFileName);

    // Verify destination stays within logoStorageDir
    if (!destinationPath.startsWith(this.logoStorageDir)) {
      throw new Error('Security error: Illegal destination path traversal attempt.');
    }

    // Write file to disk
    fs.writeFileSync(destinationPath, fileDataBuffer);

    // Relative path stored in SQLite
    const relativePath = `assets/${newFileName}`;

    try {
      this.db.prepare(`
        UPDATE school_settings
        SET logo_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(relativePath);
    } catch (dbErr) {
      // Rollback: if DB update failed, delete newly created file so it doesn't leak
      try { if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath); } catch {}
      throw dbErr;
    }

    // 6. Safe cleanup of old logo file only AFTER database update succeeds
    if (oldLogoPath) {
      const oldFileName = path.basename(oldLogoPath);
      const oldFullPath = path.resolve(this.logoStorageDir, oldFileName);
      if (oldFullPath.startsWith(this.logoStorageDir) && fs.existsSync(oldFullPath) && oldFullPath !== destinationPath) {
        try { fs.unlinkSync(oldFullPath); } catch {}
      }
    }

    // Audit log
    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'UPLOAD_LOGO', 'school_settings', '1', ?)
      `).run(adminUser.id, `Uploaded school logo: ${newFileName}`);
    } catch {}

    const previewUrl = `data:${verifiedImage.mimeType};base64,${fileDataBuffer.toString('base64')}`;

    return {
      logoPath: relativePath,
      previewUrl
    };
  }

  public removeLogo(adminUser: IAuthSession): boolean {
    const current = this.getSchoolSettings();
    const oldLogoPath = current.logoPath;

    this.db.prepare(`
      UPDATE school_settings
      SET logo_path = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run();

    if (oldLogoPath) {
      const oldFileName = path.basename(oldLogoPath);
      const oldFullPath = path.resolve(this.logoStorageDir, oldFileName);
      if (oldFullPath.startsWith(this.logoStorageDir) && fs.existsSync(oldFullPath)) {
        try { fs.unlinkSync(oldFullPath); } catch {}
      }
    }

    try {
      this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'REMOVE_LOGO', 'school_settings', '1', 'Removed school logo')
      `).run(adminUser.id);
    } catch {}

    return true;
  }

  public getLogoPreview(): string | null {
    const current = this.getSchoolSettings();
    if (!current.logoPath) return null;

    const fileName = path.basename(current.logoPath);
    const fullPath = path.resolve(this.logoStorageDir, fileName);

    // Path traversal check
    if (!fullPath.startsWith(this.logoStorageDir) || !fs.existsSync(fullPath)) {
      return null;
    }

    try {
      const fileData = fs.readFileSync(fullPath);
      const verified = SchoolSettingsService.validateImageBuffer(fileData);
      return `data:${verified.mimeType};base64,${fileData.toString('base64')}`;
    } catch {
      return null;
    }
  }

  public cleanUnusedLogos(): number {
    const current = this.getSchoolSettings();
    const activeFileName = current.logoPath ? path.basename(current.logoPath) : null;
    let removedCount = 0;

    try {
      if (fs.existsSync(this.logoStorageDir)) {
        const files = fs.readdirSync(this.logoStorageDir);
        for (const file of files) {
          if (file.startsWith('school_logo_') && file !== activeFileName) {
            const filePath = path.resolve(this.logoStorageDir, file);
            if (filePath.startsWith(this.logoStorageDir) && fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
                removedCount++;
              } catch {}
            }
          }
        }
      }
    } catch {}

    return removedCount;
  }
}
