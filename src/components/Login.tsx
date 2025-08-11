import React, { useMemo, useState } from 'react';
import { auth } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const { isDarkMode } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const canSubmit = useMemo(() => {
    if (!email || !password) return false;
    if (mode === 'signup' && password.length < 6) return false;
    return true;
  }, [email, password, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password); // will set up later
      }
    } catch (e: any) {
      const msg = mapAuthError(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  function mapAuthError(e: any): string {
    const code = e?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Try again later.';
      case 'auth/email-already-in-use':
        return 'Email is already in use.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/weak-password':
        return 'Password is too weak (min 6 characters).';
      default:
        return e?.message || 'Authentication failed.';
    }
  }

  return (
    <div className={`max-w-md w-full mx-auto rounded-2xl shadow-2xl p-8 border ${
      isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
    }`}>
      <div className="text-center mb-6">
        <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-3">
          <img src="/aries-logo.svg" alt="ARIES Logo" className="w-20 h-20" />
        </div>
        <h1 className={`text-3xl font-bold mb-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>ARIES</h1>
        <p className={`text-lg font-medium mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Automated Routines for Intelligent Engineering Scenarios</p>
        <hr className={isDarkMode ? 'border-gray-700' : 'border-gray-200'} />
        <h2 className={`pt-3 text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Sign in</h2>
        <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Use your email and password to continue</p>
      </div>
      {error && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${
          isDarkMode ? 'bg-red-900/30 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-700'
        }`}>{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="email" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1 w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border ${
              isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-300' : 'border-gray-300'
            }`}
            required
          />
        </div>
        <div>
          <label htmlFor="password" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`mt-1 w-full rounded-lg pr-10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border ${
                isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-300' : 'border-gray-300'
              }`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={`absolute inset-y-0 right-0 px-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {mode === 'signup' && (
            <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Password must be at least 6 characters.</p>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <label className="inline-flex items-center gap-2 select-none">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>Remember me</span>
          </label>
        </div>
        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full mt-2 py-2 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold disabled:opacity-60 flex items-center justify-center"
        >
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
