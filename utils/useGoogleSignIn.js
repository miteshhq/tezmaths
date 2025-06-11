import { useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { auth, database } from '../firebase/firebaseConfig';
import { ref, get, set } from 'firebase/database';

// Required for proper OAuth flow
WebBrowser.maybeCompleteAuthSession();

export const useSimpleGoogleSignIn = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState < string | null > (null);

    // Simple configuration - just add your client ID
    const [request, response, promptAsync] = Google.useAuthRequest({
        // Your web client ID from Firebase
        webClientId: '416608871397-0da1u3thq1oes30ss5ba7vql8je4rrmq.apps.googleusercontent.com',

        // These will be auto-generated if you don't have them
        // androidClientId: 'your-android-client-id', // Optional
        // iosClientId: 'your-ios-client-id', // Optional
    });

    const signInWithGoogle = async () => {
        try {
            setIsLoading(true);
            setError(null);

            console.log('Starting simple Google Sign-In...');

            // Trigger the authentication flow
            const result = await promptAsync();

            if (result.type === 'cancel') {
                setError('Sign-in cancelled');
                return null;
            }

            if (result.type !== 'success') {
                setError('Sign-in failed. Please try again.');
                return null;
            }

            console.log('Google authentication successful');

            // Get the ID token from the result
            const { id_token, access_token } = result.params;

            if (!id_token) {
                setError('No authentication token received');
                return null;
            }

            // Create Firebase credential
            const credential = GoogleAuthProvider.credential(id_token, access_token);

            // Sign in to Firebase
            console.log('Signing in to Firebase...');
            const userCredential = await signInWithCredential(auth, credential);
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
                const newUserData = {
                    fullName: firebaseUser.displayName || '',
                    email: firebaseUser.email || '',
                    avatar: 1,
                    isnewuser: true,
                    photoURL: firebaseUser.photoURL || '',
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

            console.log('Sign-in completed successfully:', {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                isNewUser
            });

            setError(null);
            return { user: firebaseUser, isNewUser };

        } catch (error: any) {
            console.error('Google Sign-In Error:', error);

            let errorMessage = 'Sign-in failed. Please try again.';

            if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Network error. Check your internet connection.';
            } else if (error.code === 'auth/invalid-credential') {
                errorMessage = 'Authentication failed. Please try again.';
            } else if (error.message) {
                errorMessage = error.message;
            }

            setError(errorMessage);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    const signOut = async () => {
        try {
            await auth.signOut();
            console.log('Sign out successful');
        } catch (error) {
            console.error('Sign out error:', error);
        }
    };

    return {
        signInWithGoogle,
        signOut,
        isLoading,
        error,
        isReady: !!request
    };
};