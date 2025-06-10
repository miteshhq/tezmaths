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
            offlineAccess: false, // Changed to false - often causes issues when true
            hostedDomain: '', // Add empty hostedDomain
            forceCodeForRefreshToken: false, // Changed to false
            accountName: '', // Add empty accountName
            iosClientId: '', // Add your iOS client ID if you have one
            googleServicePlistPath: '', // Add if needed
            openIdConnect: false,
        });
    };

    const signInWithGoogle = async () => {
        try {
            setIsLoading(true);
            setError(null);

            console.log('Starting Google Sign-In process...');

            // Configure Google Sign-In
            configureGoogleSignIn();

            // Check Google Play Services
            const hasPlayServices = await GoogleSignin.hasPlayServices({
                showPlayServicesUpdateDialog: true
            });
            console.log('Play Services available:', hasPlayServices);

            // Sign out any existing session to ensure clean state
            try {
                await GoogleSignin.signOut();
                console.log('Previous session cleared');
            } catch (signOutError) {
                console.log('No previous session to clear');
            }

            // Attempt Google Sign-In
            console.log('Initiating Google Sign-In...');
            const userInfo = await GoogleSignin.signIn();

            console.log('Google Sign-In response:', {
                hasUser: !!userInfo.user,
                email: userInfo.user?.email,
                hasIdToken: !!userInfo.idToken,
                hasAccessToken: !!userInfo.accessToken,
                idTokenLength: userInfo.idToken?.length,
            });

            // Validate essential data
            if (!userInfo || !userInfo.user) {
                throw new Error('No user data received from Google');
            }

            if (!userInfo.idToken) {
                console.error('Missing ID token. UserInfo:', userInfo);
                throw new Error('Failed to get authentication token from Google');
            }

            // Create Firebase credential
            console.log('Creating Firebase credential...');
            const googleCredential = GoogleAuthProvider.credential(
                userInfo.idToken,
                userInfo.accessToken // Include access token for better compatibility
            );

            // Sign in to Firebase
            console.log('Signing in to Firebase...');
            const userCredential = await signInWithCredential(auth, googleCredential);
            const user = userCredential.user;

            if (!user) {
                throw new Error('Firebase authentication failed - no user returned');
            }

            console.log('Firebase authentication successful:', {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName
            });

            // Check if user exists in database
            console.log('Checking user in database...');
            const userRef = ref(database, `users/${user.uid}`);
            const snapshot = await get(userRef);
            const isNewUser = !snapshot.exists();

            console.log('Database check result:', { isNewUser });

            if (isNewUser) {
                // Create new user profile
                console.log('Creating new user profile...');
                const newUserData = {
                    fullName: user.displayName || userInfo.user.name || '',
                    email: user.email || userInfo.user.email,
                    avatar: 1,
                    isnewuser: true,
                    photoURL: user.photoURL || userInfo.user.photo || '',
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
                console.log('New user profile created successfully');
            }

            return { user, isNewUser };

        } catch (error) {
            console.error('=== Google Sign-In Error Details ===');
            console.error('Error message:', error.message);
            console.error('Error code:', error.code);
            console.error('Full error:', error);

            let friendlyMessage = 'Google sign-in failed. Please try again.';

            // Handle specific error cases with more detailed logging
            if (error.code === 'auth/argument-error') {
                console.error('Firebase argument error - check webClientId configuration');
                friendlyMessage = 'Configuration error. Please ensure Google Sign-In is properly set up.';
            } else if (error.code === 'auth/network-request-failed') {
                console.error('Network error during authentication');
                friendlyMessage = 'Network error. Please check your internet connection.';
            } else if (error.code === 'auth/invalid-credential') {
                console.error('Invalid credential - token may be malformed');
                friendlyMessage = 'Authentication failed. Please try again.';
            } else if (error.message?.includes('DEVELOPER_ERROR')) {
                console.error('Google Sign-In developer error - check SHA fingerprints and OAuth setup');
                friendlyMessage = 'Setup error. Please contact support.';
            } else if (error.message?.includes('SIGN_IN_CANCELLED')) {
                console.log('User cancelled sign-in');
                friendlyMessage = 'Sign-in cancelled.';
            } else if (error.message?.includes('SIGN_IN_REQUIRED')) {
                console.error('Sign-in required error');
                friendlyMessage = 'Please try signing in again.';
            } else if (error.code === '12501') {
                console.error('Google Sign-In cancelled by user');
                friendlyMessage = 'Sign-in cancelled.';
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
            console.log('Sign out successful');
        } catch (error) {
            console.error('Sign out error:', error);
        }
    };

    const getCurrentUser = async () => {
        try {
            const currentUser = await GoogleSignin.getCurrentUser();
            return currentUser;
        } catch (error) {
            console.log('No current Google user');
            return null;
        }
    };

    return {
        signInWithGoogle,
        signOut,
        getCurrentUser,
        isLoading,
        error
    };
};