import React, { useState, useEffect } from 'react';
import { KeyRound, Shield, UserCheck, AlertTriangle, Delete, ArrowRight, Clock } from 'lucide-react';
import { Button } from '../components/Card';
import { IAuthSession } from '../../shared/types';

interface LoginViewProps {
  onLoginSuccess: (user: IAuthSession) => void;
  hasUsers: boolean;
  onRefreshHasUsers: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  hasUsers,
  onRefreshHasUsers
}) => {
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Initial Admin Setup State (if system has no users)
  const [setupName, setSetupName] = useState('Administrator');
  const [setupPin, setSetupPin] = useState('');
  const [setupPinConfirm, setSetupPinConfirm] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);

  // Check lockout on load
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const checkLockout = async () => {
      if (window.api?.getLockoutStatus) {
        const res = await window.api.getLockoutStatus();
        if (res?.success && res.data) {
          setRemainingSeconds(res.data.remainingSeconds);
          setRemainingAttempts(res.data.remainingAttempts);
        }
      }
    };
    checkLockout();

    interval = setInterval(() => {
      setRemainingSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  // Physical keyboard support for PIN
  useEffect(() => {
    if (!hasUsers) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (remainingSeconds > 0 || loading) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setPin(prev => (prev.length < 5 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length === 5) {
          submitLogin(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, remainingSeconds, loading, hasUsers]);

  const submitLogin = async (inputPin: string) => {
    if (inputPin.length !== 5) {
      setErrorMessage('Please enter all 5 digits of your PIN.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await window.api.login(inputPin);
      if (res.success && res.data?.user) {
        onLoginSuccess(res.data.user);
      } else {
        setErrorMessage(res.error || 'Authentication failed.');
        if (res.data?.remainingSeconds) {
          setRemainingSeconds(res.data.remainingSeconds);
        }
        if (typeof res.data?.remainingAttempts === 'number') {
          setRemainingAttempts(res.data.remainingAttempts);
        }
        setPin('');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleNumpadClick = (digit: string) => {
    if (remainingSeconds > 0 || loading) return;
    setErrorMessage(null);
    if (pin.length < 5) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 5) {
        submitLogin(newPin);
      }
    }
  };

  const handleNumpadBackspace = () => {
    if (remainingSeconds > 0 || loading) return;
    setPin(prev => prev.slice(0, -1));
  };

  const handleInitialSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);

    if (!setupName.trim()) {
      setSetupError('Administrator name is required.');
      return;
    }
    if (!/^\d{5}$/.test(setupPin)) {
      setSetupError('PIN must be exactly 5 numeric digits.');
      return;
    }
    if (setupPin !== setupPinConfirm) {
      setSetupError('PIN confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await window.api.setupInitialAdmin(setupName.trim(), setupPin);
      if (res.success && res.data) {
        onRefreshHasUsers();
        onLoginSuccess(res.data);
      } else {
        setSetupError(res.error || 'Failed to initialize administrator account.');
      }
    } catch (err) {
      setSetupError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // If system has 0 registered users: show initial setup
  if (!hasUsers) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 select-none p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8 border border-slate-200">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">System Initialization</h2>
              <p className="text-xs text-slate-500">Create Primary Administrator Account</p>
            </div>
          </div>

          {setupError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{setupError}</span>
            </div>
          )}

          <form onSubmit={handleInitialSetupSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Administrator Display Name
              </label>
              <input
                type="text"
                value={setupName}
                onChange={e => setSetupName(e.target.value)}
                placeholder="e.g. Principal / Administrator"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs focus:outline-hidden focus:border-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                5-Digit Security PIN
              </label>
              <input
                type="password"
                maxLength={5}
                value={setupPin}
                onChange={e => setSetupPin(e.target.value.replace(/\D/g, ''))}
                placeholder="•••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs tracking-widest font-mono text-center text-base focus:outline-hidden focus:border-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm 5-Digit PIN
              </label>
              <input
                type="password"
                maxLength={5}
                value={setupPinConfirm}
                onChange={e => setSetupPinConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="•••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs tracking-widest font-mono text-center text-base focus:outline-hidden focus:border-slate-900"
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full py-2.5 text-xs font-semibold mt-2"
            >
              {loading ? 'Initializing System...' : 'Create Administrator Account'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Standard PIN Login Interface
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 select-none p-4 font-sans">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 border border-slate-800 flex flex-col items-center">
        {/* Brand Icon */}
        <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white mb-3 shadow-md">
          <KeyRound className="w-6 h-6" />
        </div>

        <h1 className="text-lg font-bold text-slate-900 tracking-tight">CurtissSMS</h1>
        <p className="text-xs text-slate-500 mb-6">Enter your 5-digit PIN to unlock</p>

        {/* Lockout Warning Banner */}
        {remainingSeconds > 0 ? (
          <div className="w-full mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2.5">
            <Clock className="w-4 h-4 text-rose-600 shrink-0 animate-pulse" />
            <div>
              <p className="font-semibold">Terminal Locked</p>
              <p className="text-[11px] text-rose-700">
                Too many failed attempts. Try again in {remainingSeconds}s.
              </p>
            </div>
          </div>
        ) : (
          errorMessage && (
            <div className="w-full mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-700 text-center font-medium">
              {errorMessage}
            </div>
          )
        )}

        {/* 5-Digit PIN Indicator Dots */}
        <div className="flex items-center space-x-3.5 mb-8">
          {[0, 1, 2, 3, 4].map(idx => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  isFilled
                    ? 'bg-slate-900 scale-110 ring-2 ring-slate-300'
                    : 'border-2 border-slate-300 bg-slate-50'
                }`}
              />
            );
          })}
        </div>

        {/* Numeric On-Screen Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px] mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              disabled={remainingSeconds > 0 || loading}
              onClick={() => handleNumpadClick(num)}
              className="h-12 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-base font-semibold hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            disabled={remainingSeconds > 0 || loading || pin.length === 0}
            onClick={() => setPin('')}
            className="h-12 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={remainingSeconds > 0 || loading}
            onClick={() => handleNumpadClick('0')}
            className="h-12 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-base font-semibold hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            0
          </button>
          <button
            type="button"
            disabled={remainingSeconds > 0 || loading || pin.length === 0}
            onClick={handleNumpadBackspace}
            className="h-12 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-40"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[10px] text-slate-400 mt-2">
          Hardware keyboard numbers (0–9) & Backspace supported
        </p>
      </div>
    </div>
  );
};
