// app/user/profile.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";
import {
  ref,
  get,
  update,
  onValue,
  query,
  orderByChild,
  limitToLast,
} from "firebase/database";
import { signOut } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import SoundManager from "../../components/soundManager";

// Predefined avatar options
const avatarOptions = [
  { id: 0, source: require("../../assets/avatars/avatar1.png") },
  { id: 1, source: require("../../assets/avatars/avatar2.png") },
  { id: 2, source: require("../../assets/avatars/avatar3.png") },
  { id: 3, source: require("../../assets/avatars/avatar4.png") },
  { id: 4, source: require("../../assets/avatars/avatar5.png") },
  { id: 5, source: require("../../assets/avatars/avatar6.png") },
];

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
    avatar: 0, // Default to first avatar
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userRank, setUserRank] = useState<number>(0);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);

  // Get avatar image source based on avatar ID
  const getAvatarSource = () => {
    // Find the avatar option that matches the user's avatar ID
    const avatar = avatarOptions.find((av) => av.id === userData.avatar);
    return avatar ? avatar.source : avatarOptions[0].source;
  };

  useEffect(() => {
    const now = Date.now();
    if (now - lastRefreshTime > 5000) {
      fetchUserRank();
      setLastRefreshTime(now);
    }
  }, [userData, lastRefreshTime]);

  const fetchUserRank = async () => {
    try {
      const usersRef = query(
        ref(database, "users"),
        orderByChild("totalPoints"),
        limitToLast(100)
      );
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const users = Object.entries(snapshot.val())
          .map(([id, user]: [string, any]) => ({
            id,
            username: user.username || "Unknown",
            totalPoints: user.totalPoints ?? 0,
          }))
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((user, index) => ({ ...user, rank: index + 1 }));

        const currentUser = users.find(
          (user) => user.username === userData.username
        );
        if (currentUser) {
          setUserRank(currentUser.rank);
        } else {
          setUserRank(0);
        }
      }
    } catch (error) {
      console.error("[PROFILE] Failed to fetch user rank:", error);
      setUserRank(0);
    }
  };

  useEffect(() => {
    loadUserData();
    fetchUserRank();

    // Set up real-time listener for user data changes
    const userId = auth.currentUser?.uid;
    if (userId) {
      const userRef = ref(database, `users/${userId}`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const formattedData = {
            fullName: data.fullName || "Unavailable",
            username: data.username || "Unavailable",
            email: data.email || "Unavailable",
            referrals: data.referrals ?? 0,
            points: data.points ?? 0,
            totalPoints: data.totalPoints ?? 0,
            highestCompletedLevelCompleted:
              data.highestCompletedLevelCompleted ?? 0,
            avatar: data.avatar ?? 0, // Add avatar field
          };

          setUserData(formattedData);
          AsyncStorage.setItem("userData", JSON.stringify(formattedData));

          setTimeout(() => fetchUserRank(), 1000);
        }
      });

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

      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const referrals =
          typeof data.referrals === "number" ? data.referrals : 0;
        const totalPoints =
          typeof data.totalPoints === "number" ? data.totalPoints : 0;

        // Handle avatar data - convert to number if needed
        let avatarValue = 0;
        if (typeof data.avatar === "number") {
          avatarValue = data.avatar;
        } else if (typeof data.avatar === "string") {
          avatarValue = parseInt(data.avatar) || 0;
        }

        // Ensure avatar is within valid range (0-5)
        const avatar = avatarValue >= 0 && avatarValue <= 5 ? avatarValue : 0;

        const formattedData = {
          fullName: data.fullName || "Unavailable",
          username: data.username || "Unavailable",
          email: data.email || "Unavailable",
          referrals: referrals,
          points: data.points ?? 0,
          totalPoints: totalPoints,
          highestCompletedLevelCompleted:
            data.highestCompletedLevelCompleted ?? 0,
          avatar: avatar,
        };

        setUserData(formattedData);
        await AsyncStorage.setItem("userData", JSON.stringify(formattedData));
      }
      setLoading(false);
    } catch (error) {
      console.error("[PROFILE] Failed to load user data:", error);
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadUserData();
      setRefreshing(false);
    } catch (error) {
      console.error("[PROFILE] Error refreshing data:", error);
      setRefreshing(false);
    }
  };

  const handleCopyReferralCode = async () => {
    try {
      const referralCode = userData.username;
      await Clipboard.setStringAsync(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[PROFILE] Failed to copy referral code:", error);
    }
  };

  const handleEditProfile = () => {
    router.push("/user/edit-profile");
  };

  const handleLogout = async () => {
    const LEVEL_STORAGE_KEY = "highestLevelReached";

    await SoundManager.stopSound("levelSoundEffect");
    await SoundManager.stopSound("clappingSoundEffect");
    await SoundManager.stopSound("victorySoundEffect");
    await SoundManager.stopSound("failSoundEffect");

    try {
      const userId = auth.currentUser?.uid;
      if (userId) {
        const userRef = ref(database, `users/${userId}`);
        const storedLevel = await AsyncStorage.getItem(LEVEL_STORAGE_KEY);
        const highestCompletedLevel = Number(storedLevel) || 0;

        await update(userRef, {
          highestCompletedLevelCompleted: highestCompletedLevel,
        });

        await AsyncStorage.clear();
      }

      await signOut(auth);
      router.push("/login");
    } catch (error: any) {
      console.error("[PROFILE] Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header Section */}
      <View className="bg-white px-4 pt-12 pb-6">
        <View className="flex-row justify-between items-start mb-6">
          <Text className="text-2xl font-bold text-gray-900">My Profile</Text>
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-red-500 px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-semibold text-sm">LOG OUT</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <View className="bg-white border border-primary rounded-2xl p-6 mb-6 shadow-sm">
          <View className="flex-row justify-between items-start mb-4">
            <View className="flex-row items-center">
              {/* Avatar Image */}
              <View className="w-12 h-12 bg-gray-200 rounded-full mr-4 justify-center items-center overflow-hidden">
                <Image
                  source={getAvatarSource()}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              </View>
              <View>
                <Text className="text-lg font-bold text-gray-900">
                  {userData.fullName}
                </Text>
                <Text className="text-gray-600">@{userData.username}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleEditProfile}>
              <Text className="text-primary font-medium">edit profile</Text>
            </TouchableOpacity>
          </View>

          {/* Stats Section */}
          <View className="bg-gray-50 rounded-xl p-4">
            <Text className="text-gray-700 font-semibold mb-3">Your Stats</Text>
            <View className="flex-row justify-between">
              <View className="items-center">
                <Text className="text-2xl font-bold text-primary">
                  {userData.totalPoints % 1 !== 0
                    ? Math.round(userData.totalPoints * 10) / 10
                    : userData.totalPoints || 0}
                </Text>
                <Text className="text-gray-600 text-sm">Score</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold text-primary">
                  {userData.highestCompletedLevelCompleted
                    .toString()
                    .padStart(2, "0")}
                </Text>
                <Text className="text-gray-600 text-sm">Levels</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold text-primary">
                  #{userRank > 0 ? userRank : "—"}
                </Text>
                <Text className="text-gray-600 text-sm">Ranking</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Refer & Earn Section */}
        <View className="bg-gray-900 rounded-2xl p-6">
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-white text-lg font-bold">Refer & Earn</Text>
              <Text className="text-gray-300 text-sm flex-wrap">
                Share referrals with your friends & {"\n"}Earn 10 xp on each
                download
              </Text>
            </View>
            <View className="w-8 h-8 bg-primary rounded-full justify-center items-center">
              <Text className="text-white font-bold">+</Text>
            </View>
          </View>

          {/* Referral Code */}
          <View className="bg-gray-800 rounded-xl p-4 mb-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-white font-semibold">
                {userData.username}
              </Text>
              <TouchableOpacity onPress={handleCopyReferralCode}>
                <View className="bg-primary px-3 py-1 rounded">
                  <Text className="text-white text-xs font-semibold">Copy</Text>
                </View>
              </TouchableOpacity>
            </View>
            <Text className="text-gray-400 text-xs">
              Share this code with friends
            </Text>
          </View>

          {/* Stats */}
          <View className="flex-row justify-between mb-4">
            <View className="items-center">
              <Text className="text-white text-xl font-bold">
                {userData.referrals}
              </Text>
              <Text className="text-gray-400 text-sm">Sent</Text>
            </View>
            <View className="items-center">
              <Text className="text-white text-xl font-bold">
                {userData.referrals}
              </Text>
              <Text className="text-gray-400 text-sm">Joined</Text>
            </View>
            <View className="items-center">
              <Text className="text-white text-xl font-bold">
                {userData.referrals * 10}XP
              </Text>
              <Text className="text-gray-400 text-sm">Earned</Text>
            </View>
          </View>

          {/* Invite Button */}
          <TouchableOpacity
            onPress={handleCopyReferralCode}
            className="bg-primary py-3 rounded-xl"
          >
            <Text className="text-white text-center font-bold">
              INVITE A FRIEND
            </Text>
          </TouchableOpacity>

          <Text className="text-gray-400 text-xs text-center mt-2">
            Share your referral code with friends
          </Text>
        </View>

        {/* Copy Success Message */}
        {copied && (
          <View className="mt-4 bg-green-100 border border-green-400 rounded-lg p-3">
            <Text className="text-green-800 text-center font-medium">
              Referral code copied to clipboard!
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
