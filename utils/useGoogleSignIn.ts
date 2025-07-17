import { useState, useEffect } from 'react';
import { makeRedirectUri, useAuthRequest, ResponseType } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth, database } from '../firebase/firebaseConfig';
import { ref, get, set } from 'firebase/database';
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';

const isExpo = Constants.AppOwnership === 'expo';

const CLIENT_ID = '111721116016866408083';

export const useSimpleGoogleSignIn = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

const redirectUri = AuthSession.makeRedirectUri({

});



  const [request, response, promptAsync] = useAuthRequest(
    {
      responseType: ResponseType.IdToken,
      clientId: CLIENT_ID,
      scopes: ["profile", "email"],
      redirectUri,
    },
    {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    }
  );

  useEffect(() => {
    setIsReady(true);
  }, []);

  // ✅ This method now handles the full sign-in flow and returns data
  const signInWithGoogle = async (): Promise<{ user: any; isNewUser: boolean } | null> => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await promptAsync();

      if (res.type !== "success" || !res.params?.id_token) {
        setError("Google sign-in was cancelled or failed.");
        return null;
      }

      const idToken = res.params.id_token;
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const firebaseUser = userCredential.user;

      if (!firebaseUser) {
        setError("Firebase authentication failed.");
        return null;
      }

      const userRef = ref(database, `users/${firebaseUser.uid}`);
      const snapshot = await get(userRef);
      const isNewUser = !snapshot.exists();

      if (isNewUser) {
        const newUserData = {
          fullName: firebaseUser.displayName || "",
          username: "",
          phoneNumber: "",
          email: firebaseUser.email || "",
          avatar: 1,
          isnewuser: true,
          streak: 0,
          lastCompletionDate: null,
          highestCompletedLevelCompleted: 0,
          levelsScores: [],
          referrals: 0,
          totalPoints: 0,
          photoURL: firebaseUser.photoURL || "",
          providerId: "google.com",
          createdAt: new Date().toISOString(),
        };

        await set(userRef, newUserData);
      }

      return { user: firebaseUser, isNewUser };
    } catch (err: any) {
      setError("Google sign-in failed. Try again.");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await auth.signOut();
    } catch {
      // ignore sign-out errors
    }
  };

  return {
    signInWithGoogle,
    signOut,
    isLoading,
    error,
    isReady,
    request,
  };
};