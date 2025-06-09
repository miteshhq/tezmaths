import { useState } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { auth, database } from '../firebase/firebaseConfig';
import { ref, get, set } from 'firebase/database';

export const useGoogleSignIn = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const configureGoogleSignIn = () => {
        GoogleSignin.configure({
            webClientId: '416608871397-0da1u3thq1oes30ss5ba7vql8je4rrmq.apps.googleusercontent.com',
            offlineAccess: true,
        });
    };

    const signInWithGoogle = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Configure Google Sign-In
            configureGoogleSignIn();

            // Check if device supports Google Play Services
            await GoogleSignin.hasPlayServices();

            // Sign in with Google
            const userInfo = await GoogleSignin.signIn();

            // Create Firebase credential
            const googleCredential = GoogleAuthProvider.credential(userInfo.idToken);

            // Sign in to Firebase
            const userCredential = await signInWithCredential(auth, googleCredential);
            const user = userCredential.user;

            // Check if user exists in database
            const userRef = ref(database, `users/${user.uid}`);
            const snapshot = await get(userRef);

            if (!snapshot.exists()) {
                // Create new user profile
                await set(userRef, {
                    fullName: user.displayName || '',
                    email: user.email,
                    avatar: 1,
                    isnewuser: true,
                    photoURL: user.photoURL,
                    providerId: 'google.com',
                    createdAt: new Date().toISOString(),
                    streak: 0,
                    lastCompletionDate: null,
                    highestCompletedLevelCompleted: 0,
                    levelsScores: [],
                    referrals: 0,
                    totalPoints: 0,
                });
            }

            return { user, isNewUser: !snapshot.exists() };

        } catch (error) {
            console.error('Google Sign-In Error:', error);
            setError(error.message);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    return { signInWithGoogle, isLoading, error };
};