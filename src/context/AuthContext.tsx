import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';

interface UserProfile {
  uid: string;
  email: string | null;
  credits: number;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deductCredit: (amount?: number) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(userRef);

        if (!docSnap.exists()) {
          // New user defaults to non-admin with 5 free credits
          const newProfile = { 
            uid: currentUser.uid, 
            email: currentUser.email, 
            credits: 5,
            isAdmin: false 
          };
          await setDoc(userRef, newProfile);
          setProfile(newProfile);
        } else {
          const data = docSnap.data();
          setProfile({
            uid: data.uid,
            email: data.email,
            credits: data.credits ?? 0,
            isAdmin: data.isAdmin === true || data.role === 'admin'
          });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const deductCredit = async (amount: number = 1): Promise<boolean> => {
    if (!user || !profile || profile.credits < amount) {
      return false;
    }
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, { credits: increment(-amount) });
    setProfile((prev) => prev ? { ...prev, credits: prev.credits - amount } : null);
    return true;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginWithGoogle, logout, deductCredit }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);