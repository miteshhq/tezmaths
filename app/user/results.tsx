// app/user/results.tsx
import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Share,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { captureRef } from "react-native-view-shot";

const shareConfig = {
  additionalText: "Check out my math quiz results! 🧠✨",
  appStoreLink: "https://apps.apple.com/app/tezmaths/id123456789", // Replace with actual App Store link
  playStoreLink:
    "https://play.google.com/store/apps/details?id=com.tezmaths.app", // Replace with actual Play Store link
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
      console.log("Starting share process...");

      // Capture the card as an image
      const uri = await captureRef(cardRef.current, {
        format: "png",
        quality: 1.0,
        result: "tmpfile",
        width: 400,
        height: 600,
      });

      console.log("Image captured:", uri);

      // Prepare share message with links
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

      // Different sharing approach for different platforms
      if (Platform.OS === "ios") {
        // iOS can share both image and text together
        await Share.share({
          title: "My TezMaths Quiz Results",
          message: shareMessage,
          url: `file://${uri}`,
        });
      } else {
        // Android - try to share both
        const result = await Share.share(
          {
            title: "My TezMaths Quiz Results",
            message: shareMessage,
            url: `file://${uri}`,
          },
          {
            dialogTitle: "Share your TezMaths results",
            excludedActivityTypes: [],
          }
        );

        console.log("Share result:", result);
      }
    } catch (error) {
      console.error("Error sharing:", error);

      // Fallback to text-only sharing if image capture fails
      try {
        const downloadLinks =
          Platform.OS === "ios"
            ? `📱 iPhone: ${shareConfig.appStoreLink}\n📱 Android: ${shareConfig.playStoreLink}`
            : `📱 Android: ${shareConfig.playStoreLink}\n📱 iPhone: ${shareConfig.appStoreLink}`;

        const fallbackMessage =
          `${shareConfig.additionalText}\n\n` +
          `🏆 I scored ${quizScore} points on Level ${currentLevel} of TezMaths!\n` +
          `"${getMotivationalQuote()}"\n\n` +
          `${shareConfig.downloadText}\n\n` +
          `${downloadLinks}\n\n` +
          `${shareConfig.hashtags}`;

        await Share.share({
          title: "My TezMaths Quiz Results",
          message: fallbackMessage,
        });

        Alert.alert(
          "Shared as Text",
          "Image capture failed, but your results were shared as text!",
          [{ text: "OK" }]
        );
      } catch (fallbackError) {
        console.error("Fallback share error:", fallbackError);
        Alert.alert("Share Error", "Unable to share. Please try again later.", [
          { text: "OK" },
        ]);
      }
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
        return require("../../assets/avatars/avatar1.png");
      case "2":
        return require("../../assets/avatars/avatar2.png");
      case "3":
        return require("../../assets/avatars/avatar3.png");
      case "4":
        return require("../../assets/avatars/avatar4.png");
      case "5":
        return require("../../assets/avatars/avatar5.png");
      case "6":
        return require("../../assets/avatars/avatar6.png");
      default:
        return require("../../assets/avatars/avatar1.png");
    }
  };

  return (
    <View className="flex-1 bg-white justify-center items-center p-4">
      {/* Shareable Card - This will be captured as image */}
      <View
        ref={cardRef}
        collapsable={false}
        className="bg-gray-100 border-4 border-white p-4 rounded-3xl shadow-xl w-full max-w-md"
        style={{
          // Ensure the card looks good when captured
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowOpacity: 0.3,
          shadowRadius: 4.65,
          elevation: 8,
          backgroundColor: "#f3f4f6", // Ensure background color is set
        }}
      >
        {/* User Info */}
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

        <Text className="text-2xl font-bold text-center text-gray-800 mb-4">
          {getMotivationalQuote()}
        </Text>
        <Text className="text-3xl font-black text-center text-gray-900 mb-2">
          Score: {quizScore}
        </Text>

        {/* Performance */}
        {/* <View className="flex-row justify-between mb-6">
          <View className="items-center">
            <Text className="text-gray-700">Correct</Text>
            <Text className="text-2xl font-bold text-green-600">
              {correctAnswers}/{totalQuestions}
            </Text>
          </View>

          <View className="items-center">
            <Text className="text-gray-700">Accuracy</Text>
            <Text className="text-2xl font-bold text-purple-800">
              {percentage}%
            </Text>
          </View>
        </View> */}

        <Text className="text-3xl mt-2 mb-2 font-black text-center text-white p-2 bg-primary rounded-xl">
          Download Now
        </Text>

        <View className="items-center mb-8">
          <Text className="text-xl font-bold text-center text-gray-800 mb-2">
            TezMaths
          </Text>

          <Text className="text-gray-800 text-center">
            Sharpen your speed, master your math!
          </Text>
        </View>

        {/* Level indicator for the card */}
        <View className="items-center">
          <Text className="text-lg font-bold text-center text-gray-600">
            Level {currentLevel} {isPassed ? "✅ Completed" : "💪 In Progress"}
          </Text>
        </View>
      </View>

      {/* Action Buttons - Outside the shareable card */}
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
              tintColor={"#FF6B35"}
            />
          </View>
        </TouchableOpacity>

        {isPassed && currentLevel < 6 && (
          <TouchableOpacity
            className={`py-3 px-6 flex-1 ml-2 border border-black rounded-full`}
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

        <TouchableOpacity
          className={`py-3 px-6 flex-1 ml-2 border border-black rounded-full`}
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

        {/* <TouchableOpacity
          className={`py-3 px-6 flex-1 ml-2 border border-black rounded-full`}
          onPress={isPassed && currentLevel < 6 ? handleNextLevel : handleShare}
        >
          <View className="flex flex-row items-center justify-center gap-2">
            <Text className="font-black text-2xl text-center">
              {isPassed && currentLevel < 6 ? "Next Level" : "Share"}
            </Text>
            <Image
              source={require("../../assets/icons/share.png")}
              style={{ width: 20, height: 20 }}
              tintColor={"#FF6B35"}
            />
          </View>
        </TouchableOpacity> */}
      </View>

      {/* Watermark */}
      <Text className="text-primary text-sm mt-3">
        TezMaths - Sharpen Your Speed
      </Text>
    </View>
  );
}
