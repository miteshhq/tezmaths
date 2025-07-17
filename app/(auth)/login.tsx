import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signOut,
  signInWithPopup
} from "firebase/auth";
import { get, ref } from "firebase/database";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";
import { useSimpleGoogleSignIn } from "../../utils/useGoogleSignIn";


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEVEL_STORAGE_KEY = "highestLevelReached";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [focusField, setFocusField] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const { signInWithGoogle, isLoading, isReady } = useSimpleGoogleSignIn();

  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener("keyboardDidShow", (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const keyboardHideListener = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardHeight(0)
    );

    return () => {
      // router.push("/user/home")
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, []);

  const isValidEmail = useCallback(
    (email: string) => EMAIL_REGEX.test(email),
    []
  );

  const handleUserRedirect = useCallback(
    async (user, userData) => {
    //    console.log("➡️ Redirecting user:", user.email);
      if (userData?.isnewuser === true || userData?.isnewuser === undefined) {
        router.push("/register");
        return;
      }

      if (userData.highestCompletedLevelCompleted !== undefined) {
        await AsyncStorage.setItem(
          LEVEL_STORAGE_KEY,
          userData.highestCompletedLevelCompleted.toString()
        );
      }

      await AsyncStorage.setItem("lastLogin", Date.now().toString());
      router.replace("/user/home");
    },
    [router]
  );

  const handleLogin = useCallback(async () => {
    setErrorMessage("");

    if (!isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Password cannot be empty.");
      return;
    }
    

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      const tokenResult = await user.getIdTokenResult();
      const isAdmin = tokenResult.claims.admin === true;

      if (isAdmin) {
        router.push("/admin/dashboard");
        return;
      }

      const userRef = ref(database, `users/${user.uid}`);
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        router.push({ pathname: "/register", params: { email } });
        return;
      }

      const userData = snapshot.val();
      await handleUserRedirect(user, userData);
    } catch (error) {
      let errorMsg = "Login failed. Please check your credentials.";
      switch (error.code) {
        case "auth/user-not-found":
          errorMsg = "No account found with this email address.";
          break;
        case "auth/wrong-password":
          errorMsg = "Incorrect password.";
          break;
        case "auth/invalid-email":
          errorMsg = "Invalid email address.";
          break;
        case "auth/user-disabled":
          errorMsg = "Account disabled.";
          break;
        case "auth/too-many-requests":
          errorMsg = "Too many attempts. Try again later.";
          break;
      }
      setErrorMessage(errorMsg);
    }
  }, [email, password, isValidEmail, router, handleUserRedirect]);

  const handleForgotPassword = useCallback(async () => {
    if (!email || !isValidEmail(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    try {
      setIsResettingPassword(true);
      setErrorMessage("");
      await sendPasswordResetEmail(auth, email);
      Alert.alert(
        "Password Reset Email Sent",
        `We've sent a password reset link to ${email}.`
      );
    } catch (error) {
      let errorMsg = "Failed to send password reset email.";
      switch (error.code) {
        case "auth/user-not-found":
          errorMsg = "No account found with this email.";
          break;
        case "auth/invalid-email":
          errorMsg = "Invalid email address.";
          break;
        case "auth/too-many-requests":
          errorMsg = "Too many requests. Try again later.";
          break;
      }
      setErrorMessage(errorMsg);
    } finally {
      setIsResettingPassword(false);
    }
  }, [email, isValidEmail]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      setErrorMessage("");
      const result = await signInWithGoogle();

      if (!result || !result.user) {
        setErrorMessage("Google sign-in failed.");
        return;
      }

      const { user, isNewUser } = result;

      const userRef = ref(database, `users/${user.uid}`);
      const snapshot = await get(userRef);

      const userData = snapshot.exists() ? snapshot.val() : null;

      if (isNewUser || !userData || userData.isnewuser) {
        router.push({
          pathname: "/register",
          params: {
            email: user.email,
            isGoogleUser: "true",
            displayName: user.displayName || "",
          },
        });
      } else {
        await handleUserRedirect(user, userData);
      }
    } catch (error) {
      setErrorMessage(error?.message || "Google sign-in failed.");
    }
  }, [signInWithGoogle, router, handleUserRedirect]);

  const navigateToSignup = useCallback(() => router.push("/signup"), [router]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingBottom: keyboardHeight > 0 ? keyboardHeight : 30,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <Text className="text-4xl text-black font-black text-center mb-10 font-['Poppins-Bold']">
          Login to Your Account
        </Text>

        <TextInput
          className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base ${
            focusField === "email" ? "border-2 border-primary" : ""
          }`}
          onFocus={() => setFocusField("email")}
          onBlur={() => setFocusField(null)}
          placeholder="Email"
          placeholderTextColor="#9CA3AF"
          onChangeText={setEmail}
          value={email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base ${
            focusField === "password" ? "border-2 border-primary" : ""
          }`}
          onFocus={() => setFocusField("password")}
          onBlur={() => setFocusField(null)}
          placeholder="Password"
          placeholderTextColor="#9CA3AF"
          onChangeText={setPassword}
          value={password}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        {errorMessage && (
          <Text className="text-red-500 text-sm text-center mb-2">
            {errorMessage}
          </Text>
        )}

        <TouchableOpacity
          className="bg-primary py-3 px-20 rounded-2xl mt-5 mb-4"
          onPress={handleLogin}
        >
          <Text className="text-white text-xl font-bold text-center">
            Log in
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="mb-8"
          onPress={handleForgotPassword}
          disabled={isResettingPassword}
        >
          <Text
            className={`text-base text-center ${
              isResettingPassword ? "text-purple-400" : "text-custom-purple"
            }`}
          >
            {isResettingPassword
              ? "Sending Reset Email..."
              : "Forgot Password?"}
          </Text>
        </TouchableOpacity>

        <View className="flex-row mb-5 items-center">
          <Text className="text-black text-base font-bold">
            Don't have an account?
          </Text>
          <TouchableOpacity onPress={navigateToSignup}>
            <Text className="text-primary text-base font-bold"> Sign Up</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-black text-sm font-black mb-4 text-center">OR</Text>

        <TouchableOpacity
          className="bg-white border border-black py-2 px-8 rounded-full"
          style={{ opacity: !isReady || isLoading ? 0.5 : 1 }}
          onPress={handleGoogleSignIn}
          disabled={!isReady || isLoading}
        >
          <View className="flex-row items-center gap-2">
            <Image
              source={require("../../assets/icons/google.png")}
              style={{ width: 18, height: 18 }}
            />
            <Text className="text-black text-lg font-bold">
              {isLoading ? "Signing in..." : "Sign in with Google"}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}