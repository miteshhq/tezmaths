// app/user/profile.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";
import { ref, get, update, onValue } from "firebase/database";
import { signOut } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import SoundManager from "./components/souund/soundManager";

export default function ProfileScreen() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>({
    fullName: "Unavailable",
    username: "Unavailable",
    email: "Unavailable",
    referrals: 0,
    points: 0,
    totalPoints: 0,
    highestCompletedLevelCompleted: 0,
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadUserData();

    // Set up real-time listener for user data changes
    const userId = auth.currentUser?.uid;
    if (userId) {
      const userRef = ref(database, `users/${userId}`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          console.log("[PROFILE] Real-time update received:", data);

          const formattedData = {
            fullName: data.fullName || "Unavailable",
            username: data.username || "Unavailable",
            email: data.email || "Unavailable",
            referrals: data.referrals ?? 0,
            points: data.points ?? 0,
            totalPoints: data.totalPoints ?? 0,
            highestCompletedLevelCompleted:
              data.highestCompletedLevelCompleted ?? 0,
          };

          setUserData(formattedData);
          AsyncStorage.setItem("userData", JSON.stringify(formattedData)).catch(
            (err) =>
              console.error("Error saving user data to AsyncStorage:", err)
          );
        }
      });

      // Clean up listener on component unmount
      return () => unsubscribe();
    }
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);

      const userId = auth.currentUser?.uid;
      if (!userId) {
        console.warn("[PROFILE] No authenticated user found.");
        setLoading(false);
        return;
      }

      console.log("[PROFILE] Loading user data for ID:", userId);
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        // Get the latest data from Firebase
        const data = snapshot.val();
        console.log("[PROFILE] Raw user data from Firebase:", data);

        // Ensure referrals and totalPoints are numbers
        const referrals =
          typeof data.referrals === "number" ? data.referrals : 0;
        const totalPoints =
          typeof data.totalPoints === "number" ? data.totalPoints : 0;

        const formattedData = {
          fullName: data.fullName || "Unavailable",
          username: data.username || "Unavailable",
          email: data.email || "Unavailable",
          referrals: referrals,
          points: data.points ?? 0,
          totalPoints: totalPoints,
          highestCompletedLevelCompleted:
            data.highestCompletedLevelCompleted ?? 0,
        };

        console.log("[PROFILE] Formatted user data:", formattedData);

        // If referrals are missing in the database but should exist, fix it
        if (data.referrals === undefined && userId) {
          console.log("[PROFILE] Referrals field missing, fixing...");
          await update(userRef, { referrals: 0 });
        }

        // If totalPoints are missing in the database but should exist, fix it
        if (data.totalPoints === undefined && userId) {
          console.log("[PROFILE] TotalPoints field missing, fixing...");
          await update(userRef, { totalPoints: 0 });
        }

        // Update state with the latest data
        setUserData(formattedData);

        // Overwrite AsyncStorage with the latest data
        await AsyncStorage.setItem("userData", JSON.stringify(formattedData));
      } else {
        console.warn("[PROFILE] User data not found in the database.");
      }

      setLoading(false);
    } catch (error) {
      console.error("[PROFILE] Failed to load user data:", error);
      setLoading(false);
    }
  };

  const handleCopyReferralLink = async () => {
    try {
      const referralLink = `https://trivia.com/${userData.username}`;
      await Clipboard.setStringAsync(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Show alert to confirm copy
      Alert.alert(
        "Link Copied!",
        `Share your referral link: ${referralLink} with friends to earn points!`
      );
    } catch (error) {
      console.error("[PROFILE] Failed to copy referral link:", error);
      Alert.alert("Error", "Failed to copy referral link.");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        console.warn("[PROFILE] No authenticated user found for refresh.");
        setRefreshing(false);
        return;
      }

      // Force a fresh read from the database
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        console.log("[PROFILE] Fresh data loaded on refresh:", data);

        // Ensure referrals and totalPoints are numbers
        const referrals =
          typeof data.referrals === "number" ? data.referrals : 0;
        const totalPoints =
          typeof data.totalPoints === "number" ? data.totalPoints : 0;

        // Update the UI with fresh data
        const formattedData = {
          fullName: data.fullName || "Unavailable",
          username: data.username || "Unavailable",
          email: data.email || "Unavailable",
          referrals: referrals,
          points: data.points ?? 0,
          totalPoints: totalPoints,
          highestCompletedLevelCompleted:
            data.highestCompletedLevelCompleted ?? 0,
        };

        // If data is missing these fields, repair them
        const updates: any = {};
        if (data.referrals === undefined) updates.referrals = 0;
        if (data.totalPoints === undefined) updates.totalPoints = 0;

        if (Object.keys(updates).length > 0) {
          console.log("[PROFILE] Repairing missing fields:", updates);
          await update(userRef, updates);
        }

        setUserData(formattedData);
        await AsyncStorage.setItem("userData", JSON.stringify(formattedData));

        Alert.alert("Data Refreshed", "Your profile data has been updated.");
      } else {
        Alert.alert("Error", "Could not find your user data.");
      }
    } catch (error) {
      console.error("[PROFILE] Error refreshing data:", error);
      Alert.alert("Refresh Failed", "Could not refresh your profile data.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    const LEVEL_STORAGE_KEY = "highestLevelReached";

    // Stop sounds
    await SoundManager.stopSound("levelSoundEffect");
    await SoundManager.stopSound("clappingSoundEffect");
    await SoundManager.stopSound("victorySoundEffect");
    await SoundManager.stopSound("failSoundEffect");

    try {
      console.log("[PROFILE] Logging out...");
      const userId = auth.currentUser?.uid;
      if (userId) {
        const userRef = ref(database, `users/${userId}`);
        // Get the stored level before clearing AsyncStorage
        const storedLevel = await AsyncStorage.getItem(LEVEL_STORAGE_KEY);
        const highestCompletedLevel = Number(storedLevel) || 0;

        // Update user data with the highest completed level
        await update(userRef, {
          highestCompletedLevelCompleted: highestCompletedLevel,
        });

        // Clear AsyncStorage
        await AsyncStorage.clear();
      }

      await signOut(auth);

      Alert.alert("Logged out", "You have successfully logged out.");
      router.push("/login");
    } catch (error: any) {
      console.error("[PROFILE] Logout failed:", error);
      Alert.alert("Logout failed", error.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#F7C948" />
      ) : (
        <>
          {/* User Information */}
          <Text style={styles.fullName}>{userData.fullName}</Text>
          <Text style={styles.username}>@{userData.username}</Text>

          {/* Referrals and Points */}
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Referrals</Text>
            <Text style={styles.infoValue}>{userData.referrals}</Text>
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Points</Text>
            <Text style={styles.infoValue}>
              {userData.totalPoints.toFixed()}
            </Text>
          </View>

          {/* Referral Link Section */}
          <Text style={styles.referralTitle}>Refer friends</Text>
          <View style={styles.referralContainer}>
            <Text style={styles.referralLink}>
              https://trivia.com/{userData.username}
            </Text>
            <TouchableOpacity onPress={handleCopyReferralLink}>
              <Text style={styles.copyButton}>📋</Text>
            </TouchableOpacity>
          </View>
          {copied && <Text style={styles.copiedText}>Copied</Text>}

          {/* Refresh Button */}
          <TouchableOpacity
            style={[styles.refreshButton, refreshing && styles.buttonDisabled]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <Text style={styles.refreshText}>
              {refreshing ? "Refreshing..." : "Refresh Data"}
            </Text>
          </TouchableOpacity>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#FFF2CC",
    paddingHorizontal: 0,
    alignItems: "flex-start",
    paddingVertical: 20,
  },
  fullName: {
    fontSize: 26,
    color: "#333",
    fontFamily: "Poppins-Bold",
    marginLeft: 20,
  },
  username: {
    fontSize: 16,
    color: "#666",
    fontFamily: "Poppins-Regular",
    marginLeft: 20,
    marginBottom: 15,
  },
  infoContainer: {
    backgroundColor: "#F5E3B8",
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginVertical: 5,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoTitle: {
    fontSize: 16,
    color: "#333",
    fontFamily: "Poppins-Bold",
  },
  infoValue: {
    fontSize: 16,
    color: "#333",
    fontFamily: "Poppins-Regular",
  },
  referralTitle: {
    fontSize: 18,
    color: "#333",
    fontFamily: "Poppins-Bold",
    marginVertical: 10,
    marginLeft: 20,
  },
  referralContainer: {
    backgroundColor: "#F5E3B8",
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  referralLink: {
    fontSize: 16,
    color: "#333",
    fontFamily: "Poppins-Regular",
  },
  copyButton: {
    fontSize: 18,
    color: "#333",
    fontFamily: "Poppins-Bold",
  },
  copiedText: {
    fontSize: 14,
    color: "#000",
    fontFamily: "Poppins-Bold",
    marginTop: 5,
    marginLeft: 20,
  },
  refreshButton: {
    backgroundColor: "#F7C948",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    width: "100%",
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: "#cccccc",
    opacity: 0.7,
  },
  refreshText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Poppins-Bold",
  },
  logoutButton: {
    backgroundColor: "#FF5A5F",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    width: "100%",
    marginTop: 10,
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Poppins-Bold",
  },
});
