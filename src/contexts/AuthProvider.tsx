
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const publicRoutes = ['/login', '/signup'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setError('Error de configuración: La clave de API de Firebase no es válida. Revisa tu archivo de configuración en src/lib/firebase.ts.');
      setLoading(false);
      if (!publicRoutes.includes(pathname)) {
        router.push('/login');
      }
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, 
      (user) => { // onNext observer
        setUser(user);
        setLoading(false);
        if (user && publicRoutes.includes(pathname)) {
          router.push('/');
        } else if (!user && !publicRoutes.includes(pathname)) {
          router.push('/login');
        }
      },
      (error) => { // onError observer
        console.error("Auth state error:", error);
        handleAuthError(error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [pathname, router]);

  const login = async (email: string, password: string) => {
    if (!isFirebaseConfigured) {
      handleAuthError({ code: 'auth/invalid-api-key' });
      return;
    }
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (e: any) {
      handleAuthError(e);
    }
  };

  const signup = async (email: string, password: string) => {
    if (!isFirebaseConfigured) {
      handleAuthError({ code: 'auth/invalid-api-key' });
      return;
    }
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      // You can create a user document in Firestore here if needed
      // For example: await setDoc(doc(db, "users", user.uid), { email: user.email });
      router.push('/');
    } catch (e: any) {
      handleAuthError(e);
    }
  };

  const logout = async () => {
    if (!isFirebaseConfigured) {
      handleAuthError({ code: 'auth/invalid-api-key' });
      return;
    }
    setError(null);
    try {
        await signOut(auth);
        router.push('/login');
    } catch (e: any) {
        handleAuthError(e);
    }
  };

  const handleAuthError = (e: any) => {
    switch (e.code) {
      case 'auth/api-key-not-valid':
      case 'auth/invalid-api-key':
        setError('Error de configuración: La clave de API de Firebase no es válida. Revisa tu archivo de configuración en src/lib/firebase.ts.');
        break;
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        setError('Email o contraseña incorrectos.');
        break;
      case 'auth/email-already-in-use':
        setError('Este email ya está en uso por otra cuenta.');
        break;
      case 'auth/invalid-email':
         setError('El formato del email no es válido.');
         break;
      case 'auth/weak-password':
         setError('La contraseña es demasiado débil. Debe tener al menos 6 caracteres.');
         break;
      default:
        setError('Ocurrió un error inesperado. Por favor, inténtalo de nuevo.');
        console.error('Firebase Auth Error:', e);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
