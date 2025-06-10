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
            forceCodeForRefreshToken: true, // Add this for better token handling
        });
    };

    const signInWithGoogle = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Configure Google Sign-In first
            configureGoogleSignIn();

            // Check if device supports Google Play Services
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

            // Sign out any existing user first to ensure clean state
            await GoogleSignin.signOut();

            // Sign in with Google
            const userInfo = await GoogleSignin.signIn();

            // Validate that we have the required tokens
            if (!userInfo.idToken) {
                throw new Error('Failed to get Google ID token');
            }

            console.log('Google Sign-In successful:', {
                email: userInfo.user.email,
                hasIdToken: !!userInfo.idToken
            });

            // Create Firebase credential with proper validation
            const googleCredential = GoogleAuthProvider.credential(userInfo.idToken);

            if (!googleCredential) {
                throw new Error('Failed to create Google credential');
            }

            // Sign in to Firebase
            const userCredential = await signInWithCredential(auth, googleCredential);
            const user = userCredential.user;

            if (!user) {
                throw new Error('Failed to authenticate with Firebase');
            }

            console.log('Firebase authentication successful:', user.uid);

            // Check if user exists in database
            const userRef = ref(database, `users/${user.uid}`);
            const snapshot = await get(userRef);
            const isNewUser = !snapshot.exists();

            if (isNewUser) {
                // Create new user profile
                const newUserData = {
                    fullName: user.displayName || '',
                    email: user.email,
                    avatar: 1,
                    isnewuser: true,
                    photoURL: user.photoURL || '',
                    providerId: 'google.com',
                    createdAt: new Date().toISOString(),
                    streak: 0,
                    lastCompletionDate: null,
                    highestCompletedLevelCompleted: 0,
                    levelsScores: [],
                    referrals: 0,
                    totalPoints: 0,
                };

                await set(userRef, newUserData);
                console.log('New user profile created');
            }

            return { user, isNewUser };

        } catch (error) {
            console.error('Google Sign-In Error Details:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });

            let friendlyMessage = 'Google sign-in failed. Please try again.';

            // Handle specific error cases
            if (error.code === 'auth/argument-error') {
                friendlyMessage = 'Authentication configuration error. Please contact support.';
            } else if (error.code === 'auth/network-request-failed') {
                friendlyMessage = 'Network error. Please check your connection and try again.';
            } else if (error.message?.includes('DEVELOPER_ERROR')) {
                friendlyMessage = 'Configuration error. Please contact support.';
            } else if (error.message?.includes('SIGN_IN_CANCELLED')) {
                friendlyMessage = 'Sign-in was cancelled.';
            }

            setError(friendlyMessage);
            throw new Error(friendlyMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const signOut = async () => {
        try {
            await GoogleSignin.signOut();
            await auth.signOut();
        } catch (error) {
            console.error('Sign out error:', error);
        }
    };

    return { signInWithGoogle, signOut, isLoading, error };
};