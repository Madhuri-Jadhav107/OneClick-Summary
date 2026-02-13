import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // Fetch profile
                const docRef = doc(db, "users", currentUser.uid);
                const docSnap = await getDoc(docRef);
                const profile = docSnap.exists() ? docSnap.data() : {};
                setUser({ ...currentUser, ...profile });
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = async (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const googleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user document exists, if not create it
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            const companyId = 'company_' + Math.random().toString(36).substr(2, 9);
            await setDoc(docRef, {
                email: user.email,
                fullName: user.displayName,
                company_id: companyId,
                role: 'user',
                created_at: new Date().toISOString()
            });
        }

        return user;
    };

    const signup = async (email, password, fullName, role = 'Analyst', companyName) => {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update profile
        await updateProfile(user, {
            displayName: fullName
        });

        // Use the company name (cleaned) as the company ID for sharing
        const companyId = companyName ? companyName.toLowerCase().replace(/\s+/g, '_') : 'company_' + Math.random().toString(36).substr(2, 9);

        await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            fullName: fullName,
            company_id: companyId,
            role: role,
            created_at: new Date().toISOString()
        });

        return user;
    };

    const logout = async () => {
        return signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, login, signup, googleSignIn, logout, loading }}>
            {loading ? (
                <div style={{
                    height: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    backgroundColor: '#0f172a'
                }}>
                    Loading...
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
