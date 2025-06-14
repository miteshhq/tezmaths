// app/signup.tsx - FIXED VERSION with minimal changes
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { get, ref } from "firebase/database";
import React, { useCallback, useState, useEffect } from "react";
import {
  Image,
  Keyboard,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";
import { useSimpleGoogleSignIn } from "../../utils/useGoogleSignIn";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const LEVEL_STORAGE_KEY = "highestLevelReached";

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [focusField, setFocusField] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const { signInWithGoogle, isLoading, error, isReady } =
    useSimpleGoogleSignIn();

  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardHideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShowListener?.remove();
      keyboardHideListener?.remove();
    };
  }, []);

  const handleUserRedirect = useCallback(
    async (user, userData) => {
      if (userData.isnewuser === true || userData.isnewuser === undefined) {
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
      router.push("/user/home");
    },
    [router]
  );

  const handleGoogleSignIn = useCallback(async () => {
    try {
      setErrorMessage(""); // Clear any previous errors
      console.log("Starting Google Sign-In from login screen...");

      const result = await signInWithGoogle();

      if (!result) {
        // Sign-in was cancelled or failed, error is already set by the hook
        return;
      }

      const { user, isNewUser } = result;

      //   console.log("Google Sign-In completed:", {
      //     uid: user.uid,
      //     email: user.email,
      //     isNewUser,
      //   });

      if (isNewUser) {
        // console.log("New user detected, redirecting to register...");
        router.push({
          pathname: "/register",
          params: {
            email: user.email,
            isGoogleUser: "true",
            displayName: user.displayName || "",
          },
        });
      } else {
        // Check if user data is complete
        console.log("Existing user, checking profile completion...");
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
          console.log(
            "User data not found in database, redirecting to register..."
          );
          router.push({
            pathname: "/register",
            params: {
              email: user.email,
              isGoogleUser: "true",
              displayName: user.displayName || "",
            },
          });
          return;
        }

        const userData = snapshot.val();
        console.log("User data found:", {
          hasData: !!userData,
          isNewUser: userData.isnewuser,
        });

        if (userData.isnewuser === true) {
          console.log("User profile incomplete, redirecting to register...");
          router.push({
            pathname: "/register",
            params: {
              email: user.email,
              isGoogleUser: "true",
              displayName: user.displayName || "",
            },
          });
        } else {
          console.log("User profile complete, redirecting to home...");
          await handleUserRedirect(user, userData);
        }
      }
    } catch (error) {
      console.error("Google Sign-In failed in login screen:", error);

      // Set a user-friendly error message
      let errorMsg = "Google sign-in failed. Please try again.";

      if (error.message) {
        errorMsg = error.message;
      }

      setErrorMessage(errorMsg);
    }
  }, [signInWithGoogle, router]);

  const isValidEmail = useCallback(
    (email: string) => EMAIL_REGEX.test(email),
    []
  );

  const validateForm = useCallback(() => {
    if (!isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      return false;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage("Password must be at least 6 characters.");
      return false;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return false;
    }
    return true;
  }, [email, password, confirmPassword, isValidEmail]);

  const handleSignUp = useCallback(async () => {
    setErrorMessage("");

    if (!validateForm()) {
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      // console.log("Account created successfully:", userCredential);
      setErrorMessage("");
      router.push("/login"); // Redirect to login screen after successful sign-up
    } catch (error) {
      console.error("Sign-up failed:", error.message);
      setErrorMessage(error.message);
    }
  }, [email, password, validateForm, router]);

  const navigateToLogin = useCallback(() => router.push("/login"), [router]);

  // Combine error messages from the hook and local state
  const displayError = errorMessage;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 40,
          backgroundColor: "white",
          paddingBottom: keyboardHeight > 0 ? keyboardHeight - 30 : 30,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <Text className="text-4xl text-black font-black text-center mb-10 font-['Poppins-Bold']">
          Create Your Account
        </Text>

        <TextInput
          className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular'] ${
            focusField === "email" ? "border-2 border-primary" : ""
          }`}
          placeholder="Email"
          placeholderTextColor="#9CA3AF"
          onChangeText={setEmail}
          value={email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onFocus={() => setFocusField("email")}
          onBlur={() => setFocusField(null)}
          blurOnSubmit={false}
        />

        <TextInput
          className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular'] ${
            focusField === "password" ? "border-2 border-primary" : ""
          }`}
          placeholder="Password"
          placeholderTextColor="#9CA3AF"
          onChangeText={setPassword}
          value={password}
          secureTextEntry
          returnKeyType="next"
          onFocus={() => setFocusField("password")}
          onBlur={() => setFocusField(null)}
          blurOnSubmit={false}
        />

        <TextInput
          className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular'] ${
            focusField === "confirmPassword" ? "border-2 border-primary" : ""
          }`}
          placeholder="Confirm Password"
          placeholderTextColor="#9CA3AF"
          onChangeText={setConfirmPassword}
          value={confirmPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleSignUp}
          onFocus={() => setFocusField("confirmPassword")}
          onBlur={() => setFocusField(null)}
        />

        {displayError ? (
          <Text className="text-red-500 text-sm text-center font-['Poppins-Regular'] mb-2">
            {displayError}
          </Text>
        ) : null}

        <TouchableOpacity
          className="bg-primary py-3 px-20 rounded-2xl items-center justify-center mt-5 mb-4"
          onPress={handleSignUp}
          activeOpacity={0.8}
        >
          <Text className="text-white text-xl font-bold font-['Poppins-SemiBold'] text-center">
            Sign Up
          </Text>
        </TouchableOpacity>

        <View className="flex-row mb-8 items-center">
          <Text className="text-black text-base font-bold font-['Poppins-Regular']">
            Already have an account?
          </Text>
          <TouchableOpacity onPress={navigateToLogin} activeOpacity={0.7}>
            <Text className="text-primary text-base font-['Poppins-SemiBold'] font-bold">
              {" "}
              Log In
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="text-black text-sm font-black font-['Poppins-Regular'] mb-4 text-center">
          OR
        </Text>

        <TouchableOpacity
          className="bg-white border border-black py-2 px-8 rounded-full items-center justify-center"
          style={{
            opacity: !isReady || isLoading ? 0.5 : 1,
          }}
          activeOpacity={0.8}
          onPress={handleGoogleSignIn}
          disabled={!isReady || isLoading}
        >
          <View className="flex flex-row items-center gap-2">
            <Image
              source={require("../../assets/icons/google.png")}
              style={{ width: 18, height: 18 }}
            />
            <Text className="text-black text-lg font-bold font-['Poppins-Regular']">
              {isLoading ? "Signing in..." : "Sign in with Google"}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
