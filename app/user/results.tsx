import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import React, { useRef, useCallback } from "react";
import {
  Alert,
  Image,
  Platform,
  Share,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import SoundManager from "../../components/soundManager";
import logo from "../../assets/branding/tezmaths-full-logo.png";

const shareConfig = {
  additionalText: "Check out my math quiz results! 🧠✨",
  appStoreLink: "https://apps.apple.com/app/tezmaths/id123456789",
  playStoreLink:
    "https://play.google.com/store/apps/details?id=com.tezmathsteam.tezmaths",
  downloadText: "Download TezMaths now and challenge yourself!",
  hashtags: "#TezMaths #MathQuiz #BrainTraining #Education",
};

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const cardRef = useRef();

  const quizScore = Number(params.quizScore) || 0;
  const correctAnswers = Number(params.correctAnswers) || 0;
  const totalQuestions = Number(params.totalQuestions) || 1;
  const currentLevel = Number(params.currentLevel) || 1;
  const username = params.username || "player";
  const fullname = params.fullname || "Player";
  const avatar = params.avatar || "1";
  const isPassed = params.isPassed === "true";

  const percentage = Math.round((correctAnswers / totalQuestions) * 100);

  // Play victory or failure sound when screen is focused
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const playResultSound = async () => {
        try {
          if (isPassed) {
            await SoundManager.playSound("victorySoundEffect");
          } else {
            await SoundManager.playSound("failSoundEffect");
          }
        } catch (error) {
          console.error("Error playing result sound:", error);
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
    }, [isPassed])
  );

  // Motivational quotes based on performance
  const motivationalQuotes = [
    "Your brain is faster than you think!",
    "Math mastery is within your reach!",
    "Every problem solved makes you stronger!",
    "Persistence turns failure into achievement!",
    "Math is not about numbers, but understanding!",
  ];

  const getMotivationalQuote = () => {
    if (percentage >= 90) return motivationalQuotes[0];
    if (percentage >= 75) return motivationalQuotes[1];
    if (percentage >= 60) return motivationalQuotes[2];
    if (percentage >= 50) return motivationalQuotes[3];
    return motivationalQuotes[4];
  };

  const getResultMessage = () => {
    if (isPassed) {
      return currentLevel < 6
        ? `🎉 Level ${currentLevel + 1} Unlocked!`
        : "🏆 All Levels Completed!";
    }
    return "💪 Keep Practicing!";
  };

  const handleShare = async () => {
    try {
      const downloadLinks =
        Platform.OS === "ios"
          ? `📱 iPhone: ${shareConfig.appStoreLink}\n📱 Android: ${shareConfig.playStoreLink}`
          : `📱 Android: ${shareConfig.playStoreLink}\n📱 iPhone: ${shareConfig.appStoreLink}`;

      const shareMessage =
        `${shareConfig.additionalText}\n\n` +
        `🏆 I scored ${quizScore} points on Level ${currentLevel}!\n` +
        `"${getMotivationalQuote()}"\n\n` +
        `${shareConfig.downloadText}\n\n` +
        `${downloadLinks}\n\n` +
        `${shareConfig.hashtags}`;

      if (Platform.OS === "ios") {
        await Share.share({
          title: "My TezMaths Quiz Results",
          message: shareMessage,
        });
      } else {
        await Share.share(
          {
            title: "My TezMaths Quiz Results",
            message: shareMessage,
          },
          {
            dialogTitle: "Share your TezMaths results",
          }
        );
      }
    } catch (error) {
      console.error("Error sharing:", error);
      Alert.alert("Share Error", "Unable to share. Please try again later.", [
        { text: "OK" },
      ]);
    }
  };

  const handleNextLevel = () => {
    if (isPassed && currentLevel < 6) {
      router.push({
        pathname: "/user/quiz-screen",
        params: { level: currentLevel + 1 },
      });
    } else {
      router.push("/user/home");
    }
  };

  const avatarImages = (avatar) => {
    switch (avatar) {
      case "1":
        return require("../../assets/avatars/avatar1.jpg");
      case "2":
        return require("../../assets/avatars/avatar2.jpg");
      case "3":
        return require("../../assets/avatars/avatar3.jpg");
      case "4":
        return require("../../assets/avatars/avatar4.jpg");
      case "5":
        return require("../../assets/avatars/avatar5.jpg");
      case "6":
        return require("../../assets/avatars/avatar6.jpg");
      default:
        return require("../../assets/avatars/avatar1.jpg");
    }
  };

  return (
    <View className="flex-1 bg-white justify-center items-center p-4">
      {/* Shareable Card */}
      <View
        ref={cardRef}
        collapsable={false}
        className="bg-custom-gray border-4 border-white p-4 rounded-3xl shadow-xl w-full max-w-md"
      >
        <View className="items-center mb-6">
          <Text className="text-2xl font-bold text-gray-500">@{username}</Text>
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
        <Text className="text-3xl font-black text-center text-black mb-2">
          Score: {quizScore}
        </Text>

        <Text className="text-3xl mt-2 mb-2 font-black text-center text-white p-2 bg-primary rounded-xl">
          Download Now
        </Text>

        <View className="items-center mb-8 mt-3">
          <Image source={logo} style={{ height: 30, width: 140 }} />

          <Text className="text-black text-center">
            Sharpen your speed, master your math!
          </Text>
        </View>

        <View className="items-center">
          <Text className="text-lg font-bold text-center text-gray-600">
            Level {currentLevel} {isPassed ? "✅ Completed" : "💪 In Progress"}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View className="flex-row justify-between mt-6 w-full max-w-md">
        <TouchableOpacity
          className="py-3 px-6 flex-1 mr-2 border border-black rounded-full"
          onPress={() => router.push("/user/home")}
        >
          <View className="flex flex-row items-center justify-center gap-2">
            <Text className="font-black text-2xl text-center">Home</Text>
            <Image
              source={require("../../assets/icons/home.png")}
              style={{ width: 20, height: 20 }}
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          className="py-3 px-6 flex-1 ml-2 border border-black rounded-full"
          onPress={handleShare}
        >
          <View className="flex flex-row items-center justify-center gap-2">
            <Text className="font-black text-2xl text-center">Share</Text>
            <Image
              source={require("../../assets/icons/share.png")}
              style={{ width: 20, height: 20 }}
              tintColor={"#FF6B35"}
            />
          </View>
        </TouchableOpacity>
      </View>

      <View className="flex-row justify-between mt-6 w-full max-w-md">
      {isPassed && currentLevel < 6 && (
          <TouchableOpacity
            className={`py-3 px-6 flex-1 w-full ml-2 border border-black rounded-full`}
            onPress={handleNextLevel}
          >
            <View className="flex flex-row items-center justify-center gap-2">
              <Text className="font-black text-2xl text-center">
                Next Level
              </Text>
              <Image
                source={require("../../assets/icons/share.png")}
                style={{ width: 20, height: 20 }}
                tintColor={"#FF6B35"}
              />
            </View>
          </TouchableOpacity>
      )}
      </View>

      {/* Footer */}
      <Text className="text-primary text-sm mt-3">
        TezMaths - Sharpen Your Speed
      </Text>
    </View>
  );
}
