import { useState, useEffect } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth, database } from '../firebase/firebaseConfig';
import { ref, get, set } from 'firebase/database';

interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}

interface SignInResult {
    user: User;
    isNewUser: boolean;
}

interface UserData {
    fullName: string;
    username: string;
    phoneNumber: string;
    email: string;
    avatar: number;
    isnewuser: boolean;
    streak: number;
    lastCompletionDate: string | null;
    highestCompletedLevelCompleted: number;
    levelsScores: any[];
    referrals: number;
    totalPoints: number;
    photoURL: string;
    providerId: string;
    createdAt: string;
}

export const useSimpleGoogleSignIn = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState<boolean>(false);

    // Initialize Google Sign-In when hook is created
    useEffect(() => {
        const initializeGoogleSignIn = async (): Promise<void> => {
            try {
                // Configure Google Sign-In
                GoogleSignin.configure({
                    webClientId: '235143806197-1k7eq1jcq6gc5h6th0opmvtm03gqt7gs.apps.googleusercontent.com',
                    offlineAccess: true, // if you want to access Google API on behalf of the user FROM YOUR SERVER
                });

                setIsReady(true);
            } catch (error) {
                setError('Failed to initialize Google Sign-In');
            }
        };

        initializeGoogleSignIn();
    }, []);

    const signInWithGoogle = async (): Promise<SignInResult | null> => {
        try {
            setIsLoading(true);
            setError(null);

            // Check if device supports Google Play Services
            await GoogleSignin.hasPlayServices({
                showPlayServicesUpdateDialog: true
            });

            // Trigger the sign-in flow
            const signInResult = await GoogleSignin.signIn();

            // Extract ID token (handling both old and new versions of the library)
            let idToken = signInResult.data?.idToken;
            if (!idToken) {
                // Fallback for older versions of google-signin
                idToken = signInResult?.idToken;
            }

            if (!idToken) {
                throw new Error('No ID token found');
            }

            // Create a Google credential with the token
            const googleCredential = GoogleAuthProvider.credential(idToken);

            // Sign in to Firebase with the credential
            const userCredential = await signInWithCredential(auth, googleCredential);
            const firebaseUser = userCredential.user;

            if (!firebaseUser) {
                setError('Firebase authentication failed');
                return null;
            }

            // Check if user exists in database
            const userRef = ref(database, `users/${firebaseUser.uid}`);
            const snapshot = await get(userRef);
            const isNewUser = !snapshot.exists();

            // Create user profile if new user
            if (isNewUser) {
                const newUserData: UserData = {
                    fullName: firebaseUser.displayName || '',
                    username: '', // Will be set during registration
                    phoneNumber: '', // Will be set during registration
                    email: firebaseUser.email || '',
                    avatar: 1, // Default avatar
                    isnewuser: true, // This matches your register.tsx structure
                    streak: 0,
                    lastCompletionDate: null,
                    highestCompletedLevelCompleted: 0,
                    levelsScores: [],
                    referrals: 0,
                    totalPoints: 0,
                    // Additional Google-specific fields for reference
                    photoURL: firebaseUser.photoURL || '',
                    providerId: 'google.com',
                    createdAt: new Date().toISOString(),
                };

                await set(userRef, newUserData);
            }

            setError(null);
            return { user: firebaseUser, isNewUser };

        } catch (error: any) {
            let errorMessage = 'Sign-in failed. Please try again.';

            // Handle specific Google Sign-In errors
            if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Network error. Check your internet connection.';
            } else if (error.code === 'auth/invalid-credential') {
                errorMessage = 'Authentication failed. Please try again.';
            } else if (error.code === '12501') {
                // Google Sign-In was cancelled
                errorMessage = 'Sign-in cancelled';
            } else if (error.code === '7') {
                // Network error
                errorMessage = 'Network error. Check your internet connection.';
            } else if (error?.message) {
                errorMessage = error.message;
            }

            setError(errorMessage);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    const signOut = async (): Promise<void> => {
        try {
            // Sign out from both Google and Firebase
            await GoogleSignin.signOut();
            await auth.signOut();
        } catch (error) {
            // Silently handle sign out errors
        }
    };

    return {
        signInWithGoogle,
        signOut,
        isLoading,
        error,
        isReady
    };
};