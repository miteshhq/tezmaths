// app/signup.tsx
import React, { useState, useCallback } from "react";
import {
  StatusBar,
  Keyboard,
  ScrollView,
  TouchableWithoutFeedback,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
  Image,
} from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase/firebaseConfig";
import { useRouter } from "expo-router";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
      console.log("Account created successfully:", userCredential);
      setErrorMessage("");
      router.push("/login"); // Redirect to login screen after successful sign-up
    } catch (error: any) {
      console.error("Sign-up failed:", error.message);
      setErrorMessage(error.message);
    }
  }, [email, password, validateForm, router]);

  const navigateToLogin = useCallback(() => router.push("/login"), [router]);

  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <TouchableWithoutFeedback onPress={dismissKeyboard}>
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
          nestedScrollEnabled={true}
          scrollEnabled={true}
        >
          <Text className="text-4xl text-black font-black text-center mb-10 font-['Poppins-Bold']">
            Create Your Account
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
            returnKeyType="next"
            blurOnSubmit={false}
          />

          <TextInput
            className="bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular']"
            placeholder="Confirm Password"
            placeholderTextColor="#9CA3AF"
            onChangeText={setConfirmPassword}
            value={confirmPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
          />

          {errorMessage ? (
            <Text className="text-red-500 text-sm text-center font-['Poppins-Regular'] mb-2">
              {errorMessage}
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
            <Text className="text-gray-800 text-base font-bold font-['Poppins-Regular']">
              Already have an account?
            </Text>
            <TouchableOpacity onPress={navigateToLogin} activeOpacity={0.7}>
              <Text className="text-primary text-base font-['Poppins-SemiBold'] font-bold">
                {" "}
                Log In
              </Text>
            </TouchableOpacity>
          </View>

          <Text className="text-gray-800 text-sm font-black font-['Poppins-Regular'] mb-4 text-center">
            OR
          </Text>

          <TouchableOpacity
            className="bg-white border border-black py-2 px-8 rounded-full items-center justify-center"
            activeOpacity={0.8}
          >
            <View className="flex flex-row items-center gap-2">
              <Image
                source={require("../../assets/icons/google.png")}
                style={{ width: 18, height: 18 }}
              />
              <Text className="text-gray-800 text-lg font-bold font-['Poppins-Regular']">
                Sign up with Google
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}
