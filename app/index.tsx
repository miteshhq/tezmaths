import AsyncStorage from "@react-native-async-storage/async-storage";
import "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
const welcomeImage = require("../assets/branding/png-logo.png");
import { auth } from "../firebase/firebaseConfig";

export default function WelcomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const tokenResult = await user.getIdTokenResult();
        const isAdmin = tokenResult.claims.admin === true;
        if (isAdmin) {
          router.replace("/admin/dashboard");
          return;
        }
        const lastLogin = await AsyncStorage.getItem("lastLogin");
        if (lastLogin) {
          const lastLoginDate = new Date(parseInt(lastLogin, 10));
          const now = new Date();
          if (now.getTime() - lastLoginDate.getTime() < SESSION_DURATION) {
            router.replace("/user/home");
            return;
          }
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center items-center bg-custom-gray px-5 pb-10">
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <Image source={welcomeImage} style={styles.image} />

      <Text className="text-3xl text-black font-semibold text-center mb-2">
        Hey! Welcome
      </Text>

      <Text className="text-base text-gray-600 text-center mb-12 px-8 leading-6">
        Challenge your mind with fun facts and tough questions.
      </Text>

      <TouchableOpacity
        className="bg-primary py-4 px-12 rounded-full w-3/4 items-center shadow-sm"
        onPress={() => router.push("/signup")}
      >
        <Text className="text-white text-lg font-semibold">Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const { width, height } = Dimensions.get("window");

const styles = StyleSheet.create({
  image: {
    width: width * 0.5,
    height: width * 0.5,
    resizeMode: "contain",
    marginBottom: height * 0.09,
  },
});
