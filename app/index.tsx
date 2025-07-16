<<<<<<< HEAD
import AsyncStorage from "@react-native-async-storage/async-storage";
// import "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
=======
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
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
<<<<<<< HEAD
import { SafeAreaView } from "react-native-safe-area-context";
const welcomeImage = require("../assets/branding/png-logo.png");
=======
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
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
<<<<<<< HEAD
      try {
        if (user) {
          const tokenResult = await user.getIdTokenResult();
          const isAdmin = tokenResult.claims.admin === true;
=======
      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult();
          const isAdmin = tokenResult.claims.admin === true;

>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
          if (isAdmin) {
            router.replace("/admin/dashboard");
            return;
          }
<<<<<<< HEAD
=======

>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
          const lastLogin = await AsyncStorage.getItem("lastLogin");
          if (lastLogin) {
            const lastLoginDate = new Date(parseInt(lastLogin, 10));
            const now = new Date();
<<<<<<< HEAD
=======

>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
            if (now.getTime() - lastLoginDate.getTime() < SESSION_DURATION) {
              router.replace("/user/home");
              return;
            }
          }
<<<<<<< HEAD
=======
        } catch (error) {
          console.error("Auth check failed", error);
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
        }
      } catch (error) {
        console.error("Auth error:", error);
      } finally {
        setLoading(false);
      }
<<<<<<< HEAD
=======

      if (isMounted) {
        setLoading(false);
      }
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
<<<<<<< HEAD
      <SafeAreaView style={styles.loadingContainer}>
=======
      <View style={styles.loadingContainer}>
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
        <ActivityIndicator size="large" color="#F97316" />
      </SafeAreaView>
    );
  }

  return (
<<<<<<< HEAD
    <SafeAreaView style={styles.container}>
=======
    <View style={styles.container}>
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.content}>
        <Image source={welcomeImage} style={styles.image} />

<<<<<<< HEAD
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
=======
      <Text style={styles.title}>Hey! Welcome</Text>
      <Text style={styles.subtitle}>
        Challenge your mind with fun facts and tough questions.
      </Text>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/signup")}>
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
  );
}

const { width, height } = Dimensions.get("window");

const styles = StyleSheet.create({
<<<<<<< HEAD
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
=======
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
<<<<<<< HEAD
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
=======
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f4f5", // Equivalent to "bg-custom-gray"
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
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
<<<<<<< HEAD
    fontSize: 32,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
    color: "#000000",
=======
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    color: "#000000",
    marginBottom: 8,
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
<<<<<<< HEAD
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
=======
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
>>>>>>> 23c2f7f36b47f22318689210ca8ab29fe6058cf3
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
});
