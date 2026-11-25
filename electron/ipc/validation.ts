export class IpcValidator {
  public static validateNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid parameter: ${fieldName} must be a non-empty string`);
    }
    return value.trim();
  }

  public static validatePositiveInteger(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid parameter: ${fieldName} must be a positive integer`);
    }
    return value;
  }

  public static validateSafePath(targetPath: string): boolean {
    if (!targetPath || typeof targetPath !== 'string') {
      return false;
    }
    // Prevent directory traversal attacks
    if (targetPath.includes('..')) {
      return false;
    }
    return true;
  }
}
