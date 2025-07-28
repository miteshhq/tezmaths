// app/user/profile.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  get,
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref,
  update,
} from "firebase/database";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Share,
} from "react-native";
import SoundManager from "../../components/soundManager";
import { auth, database } from "../../firebase/firebaseConfig";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

const shareConfig = {
  additionalText:
    "🧮 Discover TezMaths - the ultimate free math-boosting app! Features multiple quizzes, proven tricks, comprehensive guides, and so much more to supercharge your mathematical skills! 🚀",
  playStoreLink:
    "https://play.google.com/store/apps/details?id=com.tezmathsteam.tezmaths",
  downloadText:
    "📲 Download TezMaths now and unlock your mathematical potential!",
  hashtags:
    "#TezMaths #MathQuiz #BrainTraining #Education #MathSkills #LearningApp #FreeApp",
};

// Predefined avatar options
const avatarOptions = [
  { id: 0, source: require("../../assets/avatars/avatar1.jpg") },
  { id: 1, source: require("../../assets/avatars/avatar2.jpg") },
  { id: 2, source: require("../../assets/avatars/avatar3.jpg") },
  { id: 3, source: require("../../assets/avatars/avatar4.jpg") },
  { id: 4, source: require("../../assets/avatars/avatar5.jpg") },
  { id: 5, source: require("../../assets/avatars/avatar6.jpg") },
];

export default function ProfileScreen() {
  const currentUserId = auth.currentUser?.uid;
  const router = useRouter();
  const [userData, setUserData] = useState<any>({
    fullName: "Unavailable",
    username: "Unavailable",
    email: "Unavailable",
    referrals: 0,
    referralsSent: 0,
    points: 0,
    totalPoints: 0,
    highScore: 0,
    highestCompletedLevelCompleted: 0,
    avatar: 0,
    currentLevel: 0,
    completedLevelsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userRank, setUserRank] = useState<number>(0);

  // Get avatar image source based on avatar ID
  const getAvatarSource = () => {
    const avatar = avatarOptions.find((av) => av.id === userData.avatar);
    return avatar ? avatar.source : avatarOptions[0].source;
  };

  const fetchUserRank = async () => {
    try {
      const usersRef = query(ref(database, "users"), limitToLast(1000));
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const users = Object.entries(snapshot.val())
          .map(([id, user]: [string, any]) => ({
            id,
            username: user.username || "Unknown",
            highScore: user.highScore ?? 0,
            email: user.email || "",
          }))
          .filter(
            (user) =>
              user.email !== "tezmaths@admin.com" &&
              user.username.toLowerCase() !== "admin"
          )
          .sort((a, b) => b.highScore - a.highScore)
          .map((user, index) => ({ ...user, rank: index + 1 }));

        const currentUser = users.find((user) => user.id === currentUserId);
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

  // Fixed useEffect for fetching user rank
  useEffect(() => {
    if (currentUserId && userData.highScore !== undefined) {
      const timeoutId = setTimeout(() => {
        fetchUserRank();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [currentUserId, userData.highScore]);

  // Fixed useEffect for loading user data
  useEffect(() => {
    loadUserData();

    const userId = auth.currentUser?.uid;
    if (userId) {
      const userRef = ref(database, `users/${userId}`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();

          // Calculate values properly within this scope
          const referrals =
            typeof data.referrals === "number" ? data.referrals : 0;
          const totalPoints =
            typeof data.totalPoints === "number" ? data.totalPoints : 0;

          // Handle avatar data
          let avatarValue = 0;
          if (typeof data.avatar === "number") {
            avatarValue = data.avatar;
          } else if (typeof data.avatar === "string") {
            avatarValue = parseInt(data.avatar) || 0;
          }
          const avatar = avatarValue >= 0 && avatarValue <= 5 ? avatarValue : 0;

          const formattedData = {
            fullName: data.fullName || "Unavailable",
            username: data.username || "Unavailable",
            email: data.email || "Unavailable",
            referrals: referrals,
            referralsSent: data.referralsSent || 0,
            points: data.points ?? 0,
            totalPoints: totalPoints,
            highScore: data.highScore ?? 0,
            highestCompletedLevelCompleted:
              data.highestCompletedLevelCompleted ?? 0,
            avatar: avatar,
            currentLevel: data.currentLevel,
            completedLevelsCount: data.completedLevels
              ? Object.values(data.completedLevels).filter(
                  (level) => level === true
                ).length
              : 0,
          };

          setUserData(formattedData);
          AsyncStorage.setItem("userData", JSON.stringify(formattedData));
        }
      });

      return () => unsubscribe();
    }
  }, [currentUserId]);

  const loadUserData = async () => {
    try {
      setLoading(true);

      const userId = auth.currentUser?.uid;
      if (!userId) {
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

        // Handle avatar data
        let avatarValue = 0;
        if (typeof data.avatar === "number") {
          avatarValue = data.avatar;
        } else if (typeof data.avatar === "string") {
          avatarValue = parseInt(data.avatar) || 0;
        }
        const avatar = avatarValue >= 0 && avatarValue <= 5 ? avatarValue : 0;

        const formattedData = {
          fullName: data.fullName || "Unavailable",
          username: data.username || "Unavailable",
          email: data.email || "Unavailable",
          referrals: referrals,
          referralsSent: data.referralsSent || 0,
          points: data.points ?? 0,
          totalPoints: totalPoints,
          highScore: data.highScore ?? 0,
          highestCompletedLevelCompleted:
            data.highestCompletedLevelCompleted ?? 0,
          avatar: avatar,
          currentLevel: data.currentLevel,
          completedLevelsCount: data.completedLevels
            ? Object.values(data.completedLevels).filter(
                (level) => level === true
              ).length
            : 0,
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

  const handleCopyMessage = async () => {
    try {
      const shareMessage = `${shareConfig.additionalText}
  
  🎯 Use my referral code: ${userData.username.toUpperCase()}
  👆 Get bonus points when you sign up!
  
  ${shareConfig.playStoreLink}
  
  ${shareConfig.downloadText}
  
  ${shareConfig.hashtags}`;

      await Clipboard.setStringAsync(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[PROFILE] Failed to copy share message:", error);
    }
  };

  const handleShareMessage = async () => {
    try {
      const shareMessage = `${shareConfig.additionalText}
  
  🎯 Use my referral code: ${userData.username.toUpperCase()}
  👆 Get bonus points when you sign up!
  
  ${shareConfig.playStoreLink}
  
  ${shareConfig.downloadText}
  
  ${shareConfig.hashtags}`;

      const userId = auth.currentUser?.uid;

      if (userId) {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        let prevReferralsSentCount = 0;

        if (snapshot.exists()) {
          const data = snapshot.val();
          prevReferralsSentCount = data.referralsSent ? data.referralsSent : 0;
        }

        await update(userRef, {
          referralsSent: prevReferralsSentCount + 1,
        });
      }

      await Share.share({
        message: shareMessage,
        title: "🧮 Join me on TezMaths!",
      });
    } catch (error) {
      console.error("[PROFILE] Failed to share message:", error);
    }
  };

  const handleEditProfile = () => {
    router.push("/user/edit-profile");
  };

  const handleLogout = async () => {
    const LEVEL_STORAGE_KEY = "highestLevelReached";

    // Stop all sounds
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
      }

      // Firebase logout
      await signOut(auth);

      // Clear Google Sign-In session to force account chooser
      try {
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
        await auth().signOut();
      } catch (googleError) {
        console.log(
          "[PROFILE] Google Sign-In already signed out or not configured:",
          googleError
        );
      }

      // Clear async storage
      await AsyncStorage.removeItem("userData");
      await AsyncStorage.removeItem(LEVEL_STORAGE_KEY);
      await AsyncStorage.removeItem("@google_signin_user");
      await AsyncStorage.removeItem("google_signin_account");
      await AsyncStorage.clear();

      router.replace("/login");
    } catch (error) {
      console.error("[PROFILE] Logout failed:", error);
      // As a fallback, try redirect anyway
      router.replace("/login");
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#F05A2A" />
        <Text className="text-gray-600 text-base mt-4">Loading Profile...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-4">
          <View className="flex-row justify-center items-center gap-2">
            <Image
              source={require("../../assets/icons/profile.png")}
              style={{ width: 24, height: 24 }}
              tintColor="#FF6B35"
            />
            <Text className="text-white text-3xl font-black">My Profile</Text>
          </View>
        </View>
      </ImageBackground>
      <ScrollView
        className="flex-1 bg-white"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header Section */}
        <View className="bg-white px-4 pt-12 pb-6 flex flex-col gap-8">
          {/* Profile Card */}
          <View className="bg-white border border-primary rounded-2xl p-6 shadow-sm">
            <View className="flex-row justify-between items-start">
              <View className="flex flex-row items-center justify-between w-full">
                <View className="flex-row items-center">
                  {/* Avatar Image */}
                  <View className="w-16 h-16 bg-gray-200 rounded-full mr-4 justify-center items-center overflow-hidden">
                    <Image
                      source={getAvatarSource()}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  </View>
                  <View>
                    <View className="flex flex-row items-center gap-2">
                      <Text className="text-2xl font-black text-custom-purple w-fit">
                        {userData.fullName}
                      </Text>
                      <TouchableOpacity onPress={handleEditProfile}>
                        <Image
                          source={require("../../assets/icons/edit-profile.png")}
                          style={{ width: 18, height: 18 }}
                          tintColor="#000"
                        />
                      </TouchableOpacity>
                    </View>

                    <View className="flex justify-between flex-row gap-1 max-w-64 mt-2">
                      <Text className="text-gray-600 text-lg">
                        @{userData.username}
                      </Text>
                      <TouchableOpacity
                        onPress={handleLogout}
                        className="bg-primary px-2 py-1 rounded-lg"
                      >
                        <Text className="text-white font-semibold text-xs">
                          LOG OUT
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Stats Section */}
          <View className="border border-primary rounded-xl">
            <Text className="text-custom-purple text-xl w-full text-center font-black py-2 border-b border-primary">
              Your Stats
            </Text>
            <View className="flex-row justify-between p-4">
              <View className="items-center">
                <Text className="text-2xl font-black text-custom-purple">
                  {userData.highScore % 1 !== 0
                    ? Math.round(userData.highScore * 10) / 10
                    : userData.highScore || 0}
                </Text>
                <Text className="text-custom-purple text-lg">High Score</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-black text-custom-purple">
                  {userData.completedLevelsCount || 0}
                </Text>
                <Text className="text-custom-purple text-lg">Levels</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-black text-custom-purple">
                  #{userRank > 0 ? userRank : "—"}
                </Text>
                <Text className="text-custom-purple text-lg">Ranking</Text>
              </View>
            </View>
          </View>

          {/* Copy Success Message */}
          {copied && (
            <View className=" bg-green-100 border border-green-400 rounded-lg p-3">
              <Text className="text-green-800 text-center font-medium">
                Referral code copied to clipboard!
              </Text>
            </View>
          )}

          {/* Refer & Earn Section */}
          <ImageBackground
            source={require("../../assets/gradient.jpg")}
            style={{ borderRadius: 20, overflow: "hidden" }}
          >
            <View className="rounded-2xl p-6">
              <View className="flex-col gap-2 mb-4">
                <View className="flex flex-row w-full justify-between">
                  <Text className="text-white text-3xl font-black">
                    Refer & Earn
                  </Text>
                  <View className="w-8 h-8 bg-primary rounded-full justify-center items-center">
                    <Text className="text-white font-bold">+</Text>
                  </View>
                </View>
                <Text className="text-gray-300 text-sm flex-wrap">
                  Share TezMaths with your friends & Earn 10 XP on each
                  download!
                </Text>
              </View>

              {/* Referral Code */}
              <View className="bg-white/5 rounded-xl p-4 mb-4">
                <View className="flex-row justify-between items-center">
                  <Text className="text-white font-semibold">
                    {userData.username.toUpperCase()}
                  </Text>
                  <TouchableOpacity onPress={handleCopyMessage}>
                    <View className="bg-primary px-3 py-1 rounded">
                      <Text className="text-white text-md font-semibold">
                        Copy
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Stats */}
              <View className="flex-row justify-between mb-4">
                <View className="items-center">
                  <Text className="text-white text-xl font-bold">
                    {userData.referralsSent}
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
                onPress={handleShareMessage}
                className="bg-primary py-3 rounded-xl"
              >
                <Text className="text-white text-center font-bold">
                  INVITE A FRIEND
                </Text>
              </TouchableOpacity>
            </View>
          </ImageBackground>
        </View>
      </ScrollView>
    </View>
  );
}

// we need to properly calcualte and storethe sent count in the db, and use that properly instead of showing hte successful referrals count ! and check for the achivements file, we need to caulcate the level thing in that file same as the profile file and use that for all kind of calculations. not the currnet level thing.
