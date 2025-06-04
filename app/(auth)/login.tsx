import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { get, ref } from "firebase/database";
import React, { useState } from "react";
import {
  SafeAreaView,
  StatusBar,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleLogin = async () => {
    setErrorMessage("");
    console.log("Starting login process...");

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

      console.log("User logged in successfully:", user.email);

      // Check admin status using the token
      const tokenResult = await user.getIdTokenResult();
      const isAdmin = tokenResult.claims.admin === true;

      if (isAdmin) {
        console.log("Admin login detected");
        router.push("/admin/dashboard");
      } else {
        router.prefetch("/user/home");
        const userId = user.uid;
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
          console.log("User data not found, redirecting to register.");
          router.push({ pathname: "/register", params: { email: email } });
          return;
        }

        const userData = snapshot.val();
        if (userData.isnewuser === true || userData.isnewuser === undefined) {
          console.log("New user, redirecting to registration.");
          router.push("/register");
          return;
        }

        const LEVEL_STORAGE_KEY = "highestLevelReached";
        if (userData.highestCompletedLevelCompleted != undefined) {
          await AsyncStorage.setItem(
            LEVEL_STORAGE_KEY,
            userData.highestCompletedLevelCompleted.toString()
          );
        }

        const now = new Date().getTime().toString();
        await AsyncStorage.setItem("lastLogin", now);
        console.log("Redirecting to user home.");
        router.push("/user/home");
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      setErrorMessage("Login failed. Please check your credentials.");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 40,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-3xl text-black font-bold text-center mb-10 font-['Poppins-Bold']">
              Log in
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
            />

            <TextInput
              className="bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular']"
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              onChangeText={setPassword}
              value={password}
              secureTextEntry
            />

            {errorMessage ? (
              <Text className="text-red-500 text-sm text-center font-['Poppins-Regular'] mb-2">
                {errorMessage}
              </Text>
            ) : null}

            <TouchableOpacity
              className="bg-primary py-4 rounded-xl items-center w-full justify-center mt-5 mb-4"
              onPress={handleLogin}
            >
              <Text className="text-white text-base font-semibold font-['Poppins-SemiBold'] text-center">
                Log in
              </Text>
            </TouchableOpacity>

            <View className="flex-row mb-5">
              <Text className="text-gray-500 text-sm font-['Poppins-Regular']">
                Don't have an account?
              </Text>
              <TouchableOpacity onPress={() => router.push("/signup")}>
                <Text className="text-primary text-sm font-['Poppins-SemiBold'] font-semibold">
                  {" "}
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            <Text className="text-gray-400 text-sm font-['Poppins-Regular'] mb-4 text-center">
              OR
            </Text>

            <TouchableOpacity className="bg-white border border-gray-300 py-3 px-6 rounded-xl items-center w-full justify-center">
              <Text className="text-gray-700 text-sm font-['Poppins-Regular']">
                🔍 Sign in with Google
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
