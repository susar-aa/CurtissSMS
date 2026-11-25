import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  KeyRound, 
  ShieldCheck, 
  UserCheck, 
  UserX, 
  Edit3, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  X
} from 'lucide-react';
import { Card, Badge, Button } from '../components/Card';
import { IUserProfile, ICreateUserInput, UserRole } from '../../shared/types';

export const UserManagementView: React.FC = () => {
  const [users, setUsers] = useState<IUserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetPinOpen, setIsResetPinOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<IUserProfile | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState<ICreateUserInput>({
    displayName: '',
    pin: '',
    role: 'Staff'
  });
  const [createPinConfirm, setCreatePinConfirm] = useState('');

  const [editForm, setEditForm] = useState<{ displayName: string; role: UserRole }>({
    displayName: '',
    role: 'Staff'
  });

  const [resetPinForm, setResetPinForm] = useState({
    newPin: '',
    confirmPin: ''
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await window.api.listUsers();
      if (res.success && res.data) {
        setUsers(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to retrieve users.');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!createForm.displayName.trim()) {
      setErrorMessage('Display name is required.');
      return;
    }
    if (!/^\d{5}$/.test(createForm.pin)) {
      setErrorMessage('PIN must be exactly 5 numeric digits.');
      return;
    }
    if (createForm.pin !== createPinConfirm) {
      setErrorMessage('PIN confirmation does not match.');
      return;
    }

    try {
      const res = await window.api.createUser(createForm);
      if (res.success) {
        setSuccessMessage(`User ${createForm.displayName} created successfully.`);
        setIsCreateOpen(false);
        setCreateForm({ displayName: '', pin: '', role: 'Staff' });
        setCreatePinConfirm('');
        loadUsers();
      } else {
        setErrorMessage(res.error || 'Failed to create user.');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setErrorMessage(null);

    if (!editForm.displayName.trim()) {
      setErrorMessage('Display name cannot be empty.');
      return;
    }

    try {
      const res = await window.api.updateUser(selectedUser.id, editForm);
      if (res.success) {
        setSuccessMessage(`User ${editForm.displayName} updated successfully.`);
        setIsEditOpen(false);
        setSelectedUser(null);
        loadUsers();
      } else {
        setErrorMessage(res.error || 'Failed to update user.');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setErrorMessage(null);

    if (!/^\d{5}$/.test(resetPinForm.newPin)) {
      setErrorMessage('New PIN must be exactly 5 numeric digits.');
      return;
    }
    if (resetPinForm.newPin !== resetPinForm.confirmPin) {
      setErrorMessage('New PIN confirmation does not match.');
      return;
    }

    try {
      const res = await window.api.resetUserPin(selectedUser.id, resetPinForm.newPin);
      if (res.success) {
        setSuccessMessage(`PIN reset successfully for ${selectedUser.displayName}.`);
        setIsResetPinOpen(false);
        setSelectedUser(null);
        setResetPinForm({ newPin: '', confirmPin: '' });
      } else {
        setErrorMessage(res.error || 'Failed to reset PIN.');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleToggleActive = async (user: IUserProfile) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await window.api.setUserActive(user.id, !user.isActive);
      if (res.success) {
        setSuccessMessage(`Account for ${user.displayName} is now ${!user.isActive ? 'Active' : 'Inactive'}.`);
        loadUsers();
      } else {
        setErrorMessage(res.error || 'Failed to toggle account status.');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">User Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage system operators, assign roles and configure 5-digit PIN access.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            Add New User
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* User Table */}
      <Card title="System Accounts" subtitle="Registered administrators and operational staff">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/50">
                <th className="py-2.5 px-3 font-semibold">User Details</th>
                <th className="py-2.5 px-3 font-semibold">Role</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold">Created</th>
                <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-900">{user.displayName}</div>
                    <div className="text-[10px] text-slate-400">ID: #{user.id}</div>
                  </td>
                  <td className="py-3 px-3">
                    <Badge variant={user.role === 'Admin' ? 'default' : 'neutral'}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="py-3 px-3">
                    <Badge variant={user.isActive ? 'success' : 'warning'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      <button
                        title="Edit Details"
                        onClick={() => {
                          setSelectedUser(user);
                          setEditForm({ displayName: user.displayName, role: user.role });
                          setIsEditOpen(true);
                        }}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="Reset 5-Digit PIN"
                        onClick={() => {
                          setSelectedUser(user);
                          setResetPinForm({ newPin: '', confirmPin: '' });
                          setIsResetPinOpen(true);
                        }}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title={user.isActive ? 'Deactivate Account' : 'Activate Account'}
                        onClick={() => handleToggleActive(user)}
                        className={`p-1.5 rounded ${
                          user.isActive
                            ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                            : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {user.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Add New User */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="font-semibold text-sm text-slate-900">Add New User</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={e => setCreateForm({ ...createForm, displayName: e.target.value })}
                  placeholder="e.g. Finance Clerk"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-hidden focus:border-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">User Role</label>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-hidden focus:border-slate-900 bg-white"
                >
                  <option value="Staff">Staff (Operational Modules Only)</option>
                  <option value="Admin">Administrator (Full Access & Settings)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">5-Digit PIN</label>
                <input
                  type="password"
                  maxLength={5}
                  value={createForm.pin}
                  onChange={e => setCreateForm({ ...createForm, pin: e.target.value.replace(/\D/g, '') })}
                  placeholder="•••••"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-center tracking-widest text-sm focus:outline-hidden focus:border-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Confirm 5-Digit PIN</label>
                <input
                  type="password"
                  maxLength={5}
                  value={createPinConfirm}
                  onChange={e => setCreatePinConfirm(e.target.value.replace(/\D/g, ''))}
                  placeholder="•••••"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-center tracking-widest text-sm focus:outline-hidden focus:border-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Create User
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User */}
      {isEditOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="font-semibold text-sm text-slate-900">Edit User Details</h3>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={e => setEditForm({ ...editForm, displayName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-hidden focus:border-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">User Role</label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-hidden focus:border-slate-900 bg-white"
                >
                  <option value="Staff">Staff</option>
                  <option value="Admin">Administrator</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset PIN */}
      {isResetPinOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="font-semibold text-sm text-slate-900">
                Reset PIN for {selectedUser.displayName}
              </h3>
              <button onClick={() => setIsResetPinOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPinSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">New 5-Digit PIN</label>
                <input
                  type="password"
                  maxLength={5}
                  value={resetPinForm.newPin}
                  onChange={e => setResetPinForm({ ...resetPinForm, newPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="•••••"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-center tracking-widest text-sm focus:outline-hidden focus:border-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Confirm New PIN</label>
                <input
                  type="password"
                  maxLength={5}
                  value={resetPinForm.confirmPin}
                  onChange={e => setResetPinForm({ ...resetPinForm, confirmPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="•••••"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-center tracking-widest text-sm focus:outline-hidden focus:border-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsResetPinOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Reset PIN
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
