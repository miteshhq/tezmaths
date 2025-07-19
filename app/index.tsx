import AsyncStorage from "@react-native-async-storage/async-storage";
// import "@react-native-google-signin/google-signin";
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
import { SafeAreaView } from "react-native-safe-area-context";
const welcomeImage = require("../assets/branding/png-logo.png");
import { auth } from "../firebase/firebaseConfig";

export default function WelcomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
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
      } catch (error) {
        console.error("Auth error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F97316" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.content}>
        <Image source={welcomeImage} style={styles.image} />

        <Text style={styles.title}>Hey! Welcome</Text>

        <Text style={styles.subtitle}>
          Challenge your mind with fun facts and tough questions.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/signup")}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const { width, height } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    fontSize: 32,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
    color: "#000000",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 48,
    paddingHorizontal: 32,
    lineHeight: 24,
    color: "#666666",
  },
  button: {
    backgroundColor: "#F97316",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 25,
    width: "75%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
});
