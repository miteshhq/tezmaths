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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";

const welcomeImage = require("../assets/branding/png-logo.png");

export default function WelcomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
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
        } catch (error) {
          console.error("Auth check failed", error);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <Image source={welcomeImage} style={styles.image} />

      <Text style={styles.title}>Hey! Welcome</Text>
      <Text style={styles.subtitle}>
        Challenge your mind with fun facts and tough questions.
      </Text>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/signup")}>
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const { width, height } = Dimensions.get("window");

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f4f5", // Equivalent to "bg-custom-gray"
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  image: {
    width: width * 0.5,
    height: width * 0.5,
    resizeMode: "contain",
    marginBottom: height * 0.09,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    color: "#000000",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#6b7280", // Tailwind "gray-600"
    marginBottom: 48,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: "#f97316", // Tailwind "orange-500"
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 9999,
    width: "75%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
});
