// app/user/results.tsx
import React from "react";
import { View, Text, TouchableOpacity, Image, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const quizScore = Number(params.quizScore) || 0;
  const correctAnswers = Number(params.correctAnswers) || 0;
  const totalQuestions = Number(params.totalQuestions) || 1;
  const currentLevel = Number(params.currentLevel) || 1;
  const username = params.username || "Player";
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
      const shareMessage = `I scored ${quizScore} points on level ${currentLevel} of TezMaths! 🧠\n\n"${getMotivationalQuote()}"\n\nSharpen your speed, master your math!`;

      await Share.share({
        message: shareMessage,
        title: "My Math Quiz Results",
      });
    } catch (error) {
      console.error("Error sharing:", error);
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

  return (
    <View className="flex-1 bg-primary justify-center items-center p-4">
      <View className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md">
        {/* User Info */}
        <View className="items-center mb-6">
          <Text className="text-2xl font-bold text-purple-800">{username}</Text>
          <Text className="text-gray-600">Level {currentLevel} Attempted</Text>
        </View>

        {/* Result Status */}
        <View
          className={`p-4 rounded-2xl items-center mb-6 ${
            isPassed ? "bg-green-100" : "bg-red-100"
          }`}
        >
          <Text
            className={`text-xl font-bold ${
              isPassed ? "text-green-600" : "text-red-600"
            }`}
          >
            {isPassed ? "PASSED" : "FAILED"}
          </Text>
          <Text
            className={`text-sm ${
              isPassed ? "text-green-600" : "text-red-600"
            }`}
          >
            {getResultMessage()}
          </Text>
        </View>

        {/* Score Display */}
        <View className="bg-gradient-to-r from-orange-400 to-purple-800 p-6 rounded-2xl items-center mb-8">
          <Text className="text-3xl font-bold text-purple-800 mb-0">
            +{quizScore}
          </Text>
          <Text className="text-gray-600 text-sm font-bold">POINTS</Text>
        </View>

        {/* Performance */}
        <View className="flex-row justify-between mb-6">
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
        </View>

        {/* Motivational Section */}
        <View className="items-center mb-8">
          <Text className="text-xl font-bold text-center text-gray-800 mb-2">
            TezMaths
          </Text>
          <Text className="text-xl font-bold text-center text-gray-800 mb-2">
            {getMotivationalQuote()}
          </Text>
          <Text className="text-gray-600 text-center italic">
            Sharpen your speed, master your math!
          </Text>
        </View>

        {/* Action Buttons */}
        <View className="flex-row justify-between">
          <TouchableOpacity
            className="bg-gray-300 py-3 px-6 rounded-xl flex-1 mr-2"
            onPress={() => router.push("/user/home")}
          >
            <Text className="text-gray-800 font-bold text-center">Home</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`py-3 px-6 rounded-xl flex-1 ml-2 ${
              isPassed && currentLevel < 6 ? "bg-green-500" : "bg-orange-500"
            }`}
            onPress={
              isPassed && currentLevel < 6 ? handleNextLevel : handleShare
            }
          >
            <Text className="text-white font-bold text-center">
              {isPassed && currentLevel < 6 ? "Next Level" : "Share"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Watermark */}
      <Text className="text-white text-sm mt-8">
        TezMaths - Sharpen Your Speed
      </Text>
    </View>
  );
}
