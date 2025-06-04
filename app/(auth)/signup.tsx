// app/signup.tsx
import React, { useState } from "react";
import {
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
  SafeAreaView,
} from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase/firebaseConfig";
import { useRouter } from "expo-router";

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSignUp = async () => {
    setErrorMessage("");
    if (!isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      console.log("Account created successfully:", userCredential);
      setErrorMessage("");
      router.push("/login"); // Redirect to login screen after successful sign-up
    } catch (error: any) {
      console.error("Sign-up failed:", error.message);
      setErrorMessage(error.message);
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
                Create an account
              </Text>

              <TextInput
                className="bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-[90%] text-base font-['Poppins-Regular']"
                placeholder="Email"
                placeholderTextColor="#9CA3AF"
                onChangeText={setEmail}
                value={email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                className="bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-[90%] text-base font-['Poppins-Regular']"
                placeholder="Password"
                placeholderTextColor="#9CA3AF"
                onChangeText={setPassword}
                value={password}
                secureTextEntry
              />

              <TextInput
                className="bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-[90%] text-base font-['Poppins-Regular']"
                placeholder="Confirm Password"
                placeholderTextColor="#9CA3AF"
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                secureTextEntry
              />

              {errorMessage ? (
                <Text className="text-red-500 text-sm text-center font-['Poppins-Regular'] mb-2">
                  {errorMessage}
                </Text>
              ) : null}

              <TouchableOpacity
                className="bg-primary py-4 rounded-xl items-center w-[90%] justify-center mt-5"
                onPress={handleSignUp}
              >
                <Text className="text-white text-base font-semibold font-['Poppins-SemiBold'] text-center">
                  Register
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="mt-5"
                onPress={() => router.push("/login")}
              >
                <Text className="text-primary text-center text-sm font-['Poppins-Regular']">
                  Already have an account? Log in
                </Text>
              </TouchableOpacity>
            
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
