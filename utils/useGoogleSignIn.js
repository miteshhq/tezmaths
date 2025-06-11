import { useState } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { auth, database } from '../firebase/firebaseConfig';
import { ref, get, set } from 'firebase/database';

// Configure Google Sign-In once when the module loads
GoogleSignin.configure({
    webClientId: '416608871397-0da1u3thq1oes30ss5ba7vql8je4rrmq.apps.googleusercontent.com',
    offlineAccess: true,
    forceCodeForRefreshToken: true,
});

export const useGoogleSignIn = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const signInWithGoogle = async () => {
        try {
            setIsLoading(true);
            setError(null);

            console.log('Starting Google Sign-In process...');

            // Check if Google Play Services are available (Android only)
            try {
                await GoogleSignin.hasPlayServices({
                    showPlayServicesUpdateDialog: true
                });
                console.log('Play Services check passed');
            } catch (playServicesError) {
                console.error('Play Services error:', playServicesError);
                // On iOS, this will throw an error, but we can continue
                if (playServicesError.code !== GoogleSignin.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                    throw playServicesError;
                }
            }

            // Sign out any existing session to ensure clean state
            try {
                await GoogleSignin.signOut();
                console.log('Previous session cleared');
            } catch (signOutError) {
                console.log('No previous session to clear or sign out failed:', signOutError.message);
            }

            // Attempt Google Sign-In
            console.log('Initiating Google Sign-In...');
            const userInfo = await GoogleSignin.signIn();

            console.log('Google Sign-In response received');
            console.log('User info structure:', {
                hasUser: !!userInfo.user,
                hasData: !!userInfo.data,
                userKeys: userInfo.user ? Object.keys(userInfo.user) : [],
                dataKeys: userInfo.data ? Object.keys(userInfo.data) : [],
                topLevelKeys: Object.keys(userInfo)
            });

            // Handle different response structures
            let user, idToken, accessToken;

            if (userInfo.user) {
                // Older version structure
                user = userInfo.user;
                idToken = userInfo.idToken;
                accessToken = userInfo.accessToken;
            } else if (userInfo.data) {
                // Newer version structure
                user = userInfo.data.user;
                idToken = userInfo.data.idToken;
                accessToken = userInfo.data.accessToken;
            } else {
                // Direct structure
                user = userInfo;
                idToken = userInfo.idToken;
                accessToken = userInfo.accessToken;
            }

            console.log('Extracted data:', {
                hasUser: !!user,
                email: user?.email,
                hasIdToken: !!idToken,
                hasAccessToken: !!accessToken,
                idTokenLength: idToken?.length,
            });

            // Validate essential data
            if (!user) {
                console.error('No user data found in response:', userInfo);
                throw new Error('No user data received from Google');
            }

            if (!idToken) {
                console.error('No ID token found. Full response:', JSON.stringify(userInfo, null, 2));
                throw new Error('Failed to get authentication token from Google');
            }

            // Create Firebase credential
            console.log('Creating Firebase credential...');
            const googleCredential = GoogleAuthProvider.credential(idToken, accessToken);

            // Sign in to Firebase
            console.log('Signing in to Firebase...');
            const userCredential = await signInWithCredential(auth, googleCredential);
            const firebaseUser = userCredential.user;

            if (!firebaseUser) {
                throw new Error('Firebase authentication failed - no user returned');
            }

            console.log('Firebase authentication successful:', {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName
            });

            // Check if user exists in database
            console.log('Checking user in database...');
            const userRef = ref(database, `users/${firebaseUser.uid}`);
            const snapshot = await get(userRef);
            const isNewUser = !snapshot.exists();

            console.log('Database check result:', { isNewUser });

            if (isNewUser) {
                // Create new user profile
                console.log('Creating new user profile...');
                const newUserData = {
                    fullName: firebaseUser.displayName || user.name || user.givenName + ' ' + user.familyName || '',
                    email: firebaseUser.email || user.email,
                    avatar: 1,
                    isnewuser: true,
                    photoURL: firebaseUser.photoURL || user.photo || '',
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

            return { user: firebaseUser, isNewUser };

        } catch (error) {
            console.error('=== Google Sign-In Error Details ===');
            console.error('Error message:', error.message);
            console.error('Error code:', error.code);
            console.error('Error toString:', error.toString());
            console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

            let friendlyMessage = 'Google sign-in failed. Please try again.';

            // Handle specific error cases
            if (error.code === GoogleSignin.statusCodes.SIGN_IN_CANCELLED) {
                console.log('User cancelled sign-in');
                friendlyMessage = 'Sign-in cancelled by user.';
            } else if (error.code === GoogleSignin.statusCodes.IN_PROGRESS) {
                console.log('Sign-in already in progress');
                friendlyMessage = 'Sign-in already in progress. Please wait.';
            } else if (error.code === GoogleSignin.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                console.log('Google Play Services not available');
                friendlyMessage = 'Google Play Services not available. Please update Google Play Services.';
            } else if (error.code === GoogleSignin.statusCodes.SIGN_IN_REQUIRED) {
                console.log('Sign-in required');
                friendlyMessage = 'Please try signing in again.';
            } else if (error.code === 'auth/network-request-failed') {
                console.error('Network error during authentication');
                friendlyMessage = 'Network error. Please check your internet connection.';
            } else if (error.code === 'auth/invalid-credential') {
                console.error('Invalid credential - this usually means webClientId is wrong');
                friendlyMessage = 'Authentication configuration error. Please try again or contact support.';
            } else if (error.code === 'auth/argument-error') {
                console.error('Firebase argument error - check webClientId configuration');
                friendlyMessage = 'Configuration error. Please contact support.';
            } else if (error.message?.includes('DEVELOPER_ERROR')) {
                console.error('Google Sign-In developer error - check SHA fingerprints and OAuth setup');
                friendlyMessage = 'Setup error. Please contact support.';
            } else if (error.message?.includes('10')) {
                console.error('Error 10: Internal error - usually configuration issue');
                friendlyMessage = 'Configuration error. Please contact support.';
            } else if (error.message?.includes('12500')) {
                console.error('Error 12500: Sign-in cancelled');
                friendlyMessage = 'Sign-in cancelled.';
            } else if (error.message?.includes('12501')) {
                console.error('Error 12501: Sign-in cancelled by user');
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
            // Sign out from Google
            await GoogleSignin.signOut();
            // Sign out from Firebase
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
            console.log('No current Google user:', error.message);
            return null;
        }
    };

    const isSignedIn = async () => {
        try {
            return await GoogleSignin.isSignedIn();
        } catch (error) {
            console.log('Error checking sign-in status:', error.message);
            return false;
        }
    };

    return {
        signInWithGoogle,
        signOut,
        getCurrentUser,
        isSignedIn,
        isLoading,
        error
    };
};