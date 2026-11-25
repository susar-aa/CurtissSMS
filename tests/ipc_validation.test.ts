import { describe, it, expect } from 'vitest';
import { IpcValidator } from '../electron/ipc/validation';

describe('IPC Validation & Security Layer', () => {
  it('validates non-empty string inputs', () => {
    expect(IpcValidator.validateNonEmptyString(' CurtissSMS ', 'appName')).toBe('CurtissSMS');

    expect(() => IpcValidator.validateNonEmptyString('', 'name')).toThrow('must be a non-empty string');
    expect(() => IpcValidator.validateNonEmptyString('   ', 'name')).toThrow('must be a non-empty string');
    expect(() => IpcValidator.validateNonEmptyString(null, 'name')).toThrow('must be a non-empty string');
  });

  it('validates positive integers', () => {
    expect(IpcValidator.validatePositiveInteger(10, 'admissionId')).toBe(10);
    expect(() => IpcValidator.validatePositiveInteger(-5, 'id')).toThrow('must be a positive integer');
    expect(() => IpcValidator.validatePositiveInteger(0, 'id')).toThrow('must be a positive integer');
    expect(() => IpcValidator.validatePositiveInteger('10', 'id')).toThrow('must be a positive integer');
  });

  it('safeguards against directory traversal', () => {
    expect(IpcValidator.validateSafePath('backups/curtiss_2026.db')).toBe(true);
    expect(IpcValidator.validateSafePath('../../../windows/system32')).toBe(false);
    expect(IpcValidator.validateSafePath('..\\data.db')).toBe(false);
  });
});
