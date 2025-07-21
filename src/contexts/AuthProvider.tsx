
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// A dummy user object to satisfy components that might expect a user.
const dummyUser: User = {
  uid: 'default-user',
  email: 'default@example.com',
  displayName: 'Default User',
  photoURL: null,
  phoneNumber: null,
  providerId: 'password',
  emailVerified: true,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => '',
  getIdTokenResult: async () => ({
    token: '',
    expirationTime: '',
    authTime: '',
    issuedAtTime: '',
    signInProvider: null,
    signInSecondFactor: null,
    claims: {},
  }),
  reload: async () => {},
  toJSON: () => ({}),
};


export function AuthProvider({ children }: { children: ReactNode }) {

  const logout = async () => {
    // In a real scenario, this would redirect to a login page.
    // Since we have no login, it does nothing.
    console.log("Logout function called, but no action is taken as auth is disabled.");
  };

  const value = {
    user: dummyUser,
    loading: false, // Never loading, access is immediate
    error: null,
    // Provide dummy functions to prevent crashes if they are called somewhere.
    login: async () => {},
    signup: async () => {},
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
