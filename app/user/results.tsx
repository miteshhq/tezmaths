import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  BackHandler,
} from "react-native";
import Share from "react-native-share"; // Use react-native-share instead of React Native's Share
import ViewShot from "react-native-view-shot";
import SoundManager from "../../components/soundManager";

// Import logo as a module declaration instead of direct import
const logo = require("../../assets/branding/tezmaths-full-logo.png");

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

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const cardRef = useRef<View>(null);
  const viewShotRef = useRef<ViewShot>(null);
  const [userData, setUserData] = useState({ username: "player" });
  const [isSharing, setIsSharing] = useState(false);

   const navigationInProgress = useRef(false);

  // Parameter parsing (same as original)
  const totalGameTimeMs =
    Number.parseInt(
      Array.isArray(params.totalGameTime)
        ? params.totalGameTime[0]
        : params.totalGameTime || "0"
    ) || 0;
  const quizScore =
    Number.parseInt(
      Array.isArray(params.quizScore)
        ? params.quizScore[0]
        : params.quizScore || "0"
    ) || 0;
  const correctAnswers =
    Number.parseInt(
      Array.isArray(params.correctAnswers)
        ? params.correctAnswers[0]
        : params.correctAnswers || "0"
    ) || 0;
  const totalQuestions =
    Number.parseInt(
      Array.isArray(params.totalQuestions)
        ? params.totalQuestions[0]
        : params.totalQuestions || "1"
    ) || 1;
  const currentLevel =
    Number.parseInt(
      Array.isArray(params.currentLevel)
        ? params.currentLevel[0]
        : params.currentLevel || "1"
    ) || 1;
  const username = Array.isArray(params.username)
    ? params.username[0]
    : params.username || "player";
  const fullname = Array.isArray(params.fullname)
    ? params.fullname[0]
    : params.fullname || "Player";
  const avatar = Array.isArray(params.avatar)
    ? params.avatar[0]
    : params.avatar || "0";
  const isPassed = Array.isArray(params.isPassed)
    ? params.isPassed[0]
    : params.isPassed;

  const percentage = Math.round((correctAnswers / totalQuestions) * 100);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const cachedData = await AsyncStorage.getItem("userData");
        if (cachedData) {
          const data = JSON.parse(cachedData);
          setUserData(data);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };
    loadUserData();
  }, []);

  

    const handleHomeNavigation = useCallback(() => {
      if (navigationInProgress.current) return;
  
      navigationInProgress.current = true;
  
      // **FIXED: Immediate navigation without delays**
      router.replace("/user/home");
  
      // Cleanup in background after navigation
    }, []);

  // **FIXED: Handle back button properly**
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (!navigationInProgress.current) {
          handleHomeNavigation();
        }
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => backHandler.remove();
    }, [])
  );

  // Play victory or failure sound when screen is focused
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const playResultSound = async () => {
        try {
          if (quizScore > 0) {
            await SoundManager.playSound("victorySoundEffect");
          } else {
            await SoundManager.playSound("failSoundEffect");
          }
        } catch (error) {
          // console.error("Error playing result sound:", error);
        }
      };
      playResultSound();

      return () => {
        if (active) {
          if (isPassed) {
            SoundManager.stopSound("victorySoundEffect").catch(console.error);
          } else {
            SoundManager.stopSound("failSoundEffect").catch(console.error);
          }
          active = false;
        }
      };
    }, [isPassed, quizScore])
  );

  // Motivational quotes based on performance
  const motivationalQuotes = [
    "Your brain is faster than you think!",
    "Math mastery is within your reach!",
    "Every problem solved makes you stronger!",
    "Persistence turns failure into achievement!",
    "Math is not about numbers, but understanding!",
  ];

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours >= 1) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes >= 1) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getMotivationalQuote = () => {
    if (percentage >= 90) return motivationalQuotes[0];
    if (percentage >= 75) return motivationalQuotes[1];
    if (percentage >= 60) return motivationalQuotes[2];
    if (percentage >= 50) return motivationalQuotes[3];
    return motivationalQuotes[4];
  };

  const getShareMessage = () => {
    const shareMessage = `${shareConfig.additionalText}
      
      🏆 I scored total ${quizScore} points on TezMaths Quiz!
      "${getMotivationalQuote()}"
      
      🎯 Use my referral code: ${userData.username.toUpperCase()}
      👆 Get bonus points when you sign up!
      
      ${shareConfig.playStoreLink}
      
      ${shareConfig.downloadText}
      
      ${shareConfig.hashtags}`;

    return shareMessage;
  };

  const avatarImages = (avatar: string) => {
    switch (avatar) {
      case "0":
        return require("../../assets/avatars/avatar1.jpg");
      case "1":
        return require("../../assets/avatars/avatar2.jpg");
      case "2":
        return require("../../assets/avatars/avatar3.jpg");
      case "3":
        return require("../../assets/avatars/avatar4.jpg");
      case "4":
        return require("../../assets/avatars/avatar5.jpg");
      case "5":
        return require("../../assets/avatars/avatar6.jpg");
      default:
        return require("../../assets/avatars/avatar1.jpg");
    }
  };

  // Fixed image + text sharing logic from the original version
  const shareImageAndText = async () => {
    setIsSharing(true);
    try {
      // Capture the image from ViewShot
      if (!viewShotRef.current) throw new Error("ViewShot ref not available");
      const uri = await viewShotRef.current.capture();

      // Save image to file system
      const timestamp = Date.now();
      const newUri = `${FileSystem.documentDirectory}tezmaths_result_${timestamp}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: newUri });

      // Use react-native-share for proper image + text sharing
      const shareOptions = {
        title: "Check this out!",
        message: getShareMessage(),
        url: newUri, // Share the captured image URI
        type: "image/jpeg",
      };

      await Share.open(shareOptions);
    } catch (error: any) {
      Alert.alert("Sharing failed", error.message || "Something went wrong.");
      console.error("Share error:", error);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <ScrollView
      className="bg-white"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-1 bg-white justify-center items-center p-4">
        {/* Shareable Card wrapped in ViewShot */}
        <ViewShot
          ref={viewShotRef}
          options={{
            format: "png",
            quality: 0.9,
            result: "tmpfile",
            snapshotContentContainer: false,
          }}
          style={{ backgroundColor: "white" }}
        >
          <View
            ref={cardRef}
            collapsable={false}
            className="bg-custom-gray border-4 border-white p-4 rounded-3xl shadow-xl w-full"
            style={{
              backgroundColor: "#f5f5f5",
            }}
          >
            <View className="items-center mb-6">
              <Text className="text-2xl font-bold text-gray-500">
                @{username}
              </Text>
            </View>

            <View className="rounded-full h-40 w-40 border-4 border-primary bg-white overflow-hidden mx-auto">
              <Image
                source={avatarImages(avatar)}
                style={{ width: "100%", height: "100%" }}
              />
            </View>

            <View className="items-center mb-6">
              <Text className="text-4xl text-center mt-4 font-black uppercase text-primary">
                {fullname}
              </Text>
            </View>

            <Text className="text-2xl font-bold text-center text-black mb-4">
              {getMotivationalQuote()}
            </Text>
            <Text className="text-3xl font-black text-center text-black mb-1">
              Score: {quizScore}
            </Text>

            <Text className="text-primary text-base font-medium text-center mb-2">
              Time Spent: {formatTime(totalGameTimeMs)}
            </Text>

            <Text className="text-2xl mt-2 mb-2 font-black text-center text-white py-2 px-4 mx-auto bg-primary rounded-xl">
              Download Now
            </Text>

            <View className="items-center mb-8 mt-3">
              <Image source={logo} style={{ height: 30, width: 140 }} />

              <Text className="text-black text-center">
                Sharpen your speed, master your math!
              </Text>
            </View>
          </View>
        </ViewShot>

        {/* Action Buttons */}
        <View className="flex-row justify-between mt-6 w-full max-w-md">
          <TouchableOpacity
            className="py-3 px-6 flex-1 mr-1 border border-black rounded-full"
            onPress={() =>
              router.push({
                pathname: "/user/home",
              })
            }
          >
            <View className="flex flex-row items-center justify-center gap-2">
              <Text className="font-black text-2xl text-center">Home</Text>
              <Image
                source={require("../../assets/icons/home.png")}
                style={{ width: 20, height: 20 }}
                tintColor={"#FF6B35"}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            className="py-3 px-6 flex-1 ml-1 border border-black rounded-full"
            onPress={shareImageAndText}
            disabled={isSharing}
          >
            {isSharing ? (
              <ActivityIndicator color="#FF6B35" />
            ) : (
              <View className="flex flex-row items-center justify-center gap-2">
                <Text className="font-black text-2xl text-center">Share</Text>
                <Image
                  source={require("../../assets/icons/share.png")}
                  style={{ width: 20, height: 20 }}
                  tintColor={"#FF6B35"}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text className="text-primary text-sm mt-3">
          TezMaths - Sharpen Your Speed
        </Text>
      </View>
    </ScrollView>
  );
}
