import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { get, ref } from "firebase/database";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useGoogleSignIn } from "../../utils/useGoogleSignIn";
import { auth, database } from "../../firebase/firebaseConfig";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEVEL_STORAGE_KEY = "highestLevelReached";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const { signInWithGoogle, isLoading: googleLoading } = useGoogleSignIn();

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const { user, isNewUser } = await signInWithGoogle();

      if (isNewUser) {
        router.push({
          pathname: "/register",
          params: {
            email: user.email,
            isGoogleUser: "true",
            displayName: user.displayName,
          },
        });
      } else {
        // Check if user data is complete
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val();

        if (userData.isnewuser === true) {
          router.push({
            pathname: "/register",
            params: {
              email: user.email,
              isGoogleUser: "true",
              displayName: user.displayName,
            },
          });
        } else {
          await handleUserRedirect(user, userData);
        }
      }
    } catch (error) {
      setErrorMessage("Google sign-in failed. Please try again.");
    }
  }, [signInWithGoogle, router, handleUserRedirect]);

  const isValidEmail = useCallback(
    (email: string) => EMAIL_REGEX.test(email),
    []
  );

  const handleUserRedirect = useCallback(
    async (user: any, userData: any) => {
      if (userData.isnewuser === true || userData.isnewuser === undefined) {
        // console.log("New user, redirecting to registration.");
        router.push("/register");
        return;
      }

      if (userData.highestCompletedLevelCompleted !== undefined) {
        await AsyncStorage.setItem(
          LEVEL_STORAGE_KEY,
          userData.highestCompletedLevelCompleted.toString()
        );
      }

      const now = new Date().getTime().toString();
      await AsyncStorage.setItem("lastLogin", now);
      // console.log("Redirecting to user home.");
      router.push("/user/home");
    },
    [router]
  );

  const handleForgotPassword = useCallback(async () => {
    if (!email || !isValidEmail(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address first.");
      return;
    }

    try {
      setIsResettingPassword(true);
      setErrorMessage("");

      await sendPasswordResetEmail(auth, email);

      Alert.alert(
        "Password Reset Email Sent",
        `We've sent a password reset link to ${email}. Please check your email and follow the instructions to reset your password.`,
        [{ text: "OK" }]
      );
    } catch (error: any) {
      console.error("Password reset failed:", error);

      let errorMsg = "Failed to send password reset email. Please try again.";

      switch (error.code) {
        case "auth/user-not-found":
          errorMsg = "No account found with this email address.";
          break;
        case "auth/invalid-email":
          errorMsg = "Please enter a valid email address.";
          break;
        case "auth/too-many-requests":
          errorMsg = "Too many requests. Please try again later.";
          break;
      }

      setErrorMessage(errorMsg);
      Alert.alert("Error", errorMsg);
    } finally {
      setIsResettingPassword(false);
    }
  }, [email, isValidEmail]);

  const handleLogin = useCallback(async () => {
    setErrorMessage("");
    // console.log("Starting login process...");

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

      // console.log("User logged in successfully:", user.email);

      // Check admin status using the token
      const tokenResult = await user.getIdTokenResult();
      const isAdmin = tokenResult.claims.admin === true;

      if (isAdmin) {
        // console.log("Admin login detected");
        router.push("/admin/dashboard");
        return;
      }

      router.prefetch("/user/home");
      const userId = user.uid;
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        // console.log("User data not found, redirecting to register.");
        router.push({ pathname: "/register", params: { email: email } });
        return;
      }

      const userData = snapshot.val();
      await handleUserRedirect(user, userData);
    } catch (error: any) {
      console.error("Login failed:", error);

      let errorMsg = "Login failed. Please check your credentials.";

      switch (error.code) {
        case "auth/user-not-found":
          errorMsg = "No account found with this email address.";
          break;
        case "auth/wrong-password":
          errorMsg = "Incorrect password. Please try again.";
          break;
        case "auth/invalid-email":
          errorMsg = "Please enter a valid email address.";
          break;
        case "auth/user-disabled":
          errorMsg = "This account has been disabled.";
          break;
        case "auth/too-many-requests":
          errorMsg = "Too many failed attempts. Please try again later.";
          break;
      }

      setErrorMessage(errorMsg);
    }
  }, [email, password, isValidEmail, handleUserRedirect, router]);

  const navigateToSignup = useCallback(() => router.push("/signup"), [router]);

  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <TouchableWithoutFeedback onPress={dismissKeyboard}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 40,
              minHeight: "100%",
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            enableOnAndroid={true}
          >
            <Text className="text-4xl text-black font-black text-center mb-10 font-['Poppins-Bold']">
              Login to Your Account
            </Text>

            <TextInput
              className="bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular']"
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              onChangeText={setEmail}
              value={email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit={false}
            />

            <TextInput
              className="bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular']"
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              onChangeText={setPassword}
              value={password}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            {errorMessage ? (
              <Text className="text-red-500 text-sm text-center font-['Poppins-Regular'] mb-2">
                {errorMessage}
              </Text>
            ) : null}

            <TouchableOpacity
              className="bg-primary py-3 px-20 rounded-2xl items-center justify-center mt-5 mb-4"
              onPress={handleLogin}
              activeOpacity={0.8}
            >
              <Text className="text-white text-xl font-bold font-['Poppins-SemiBold'] text-center">
                Log in
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex items-center justify-center mb-8"
              onPress={handleForgotPassword}
              activeOpacity={0.7}
              disabled={isResettingPassword}
            >
              <Text
                className={`text-base font-regular font-['Poppins-SemiBold'] text-center ${
                  isResettingPassword ? "text-purple-400" : "text-purple-800"
                }`}
              >
                {isResettingPassword
                  ? "Sending Reset Email..."
                  : "Forgot Password?"}
              </Text>
            </TouchableOpacity>

            <View className="flex-row mb-5 items-center">
              <Text className="text-gray-800 text-base font-bold font-['Poppins-Regular']">
                Don't have an account?
              </Text>
              <TouchableOpacity onPress={navigateToSignup} activeOpacity={0.7}>
                <Text className="text-primary text-base font-['Poppins-SemiBold'] font-bold">
                  {" "}
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            <Text className="text-gray-800 text-sm font-black font-['Poppins-Regular'] mb-4 text-center">
              OR
            </Text>

            <TouchableOpacity
              className="bg-white border border-black py-2 px-8 rounded-full items-center justify-center"
              activeOpacity={0.8}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              <View className="flex flex-row items-center gap-2">
                <Image
                  source={require("../../assets/icons/google.png")}
                  style={{ width: 18, height: 18 }}
                />
                <Text className="text-gray-800 text-lg font-bold font-['Poppins-Regular']">
                  {googleLoading ? "Signing in..." : "Sign in with Google"}
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}
