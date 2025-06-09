import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Share,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { captureRef } from "react-native-view-shot";

const shareConfig = {
  additionalText: "Check out my battle results on TezMaths! ⚔️✨",
  appStoreLink: "https://apps.apple.com/app/tezmaths/id123456789", // Replace with actual link
  playStoreLink:
    "https://play.google.com/store/apps/details?id=com.tezmaths.app", // Replace with actual link
  downloadText: "Join the battle on TezMaths now!",
  hashtags: "#TezMaths #MathBattle #BrainTraining",
};

export default function BattleResultsScreen() {
  const { players, totalQuestions, currentUserId } = useLocalSearchParams();
  const cardRef = useRef();
  let parsedPlayers = [];

  try {
    parsedPlayers = JSON.parse(players || "[]");
  } catch (error) {
    console.error("BattleResultsScreen - Parse error:", error);
  }

  const userRank =
    parsedPlayers.findIndex((p) => p.userId === currentUserId) + 1;
  const userScore =
    parsedPlayers.find((p) => p.userId === currentUserId)?.score || 0;

  const firstPlace = parsedPlayers[0];
  const secondPlace = parsedPlayers[1];
  const thirdPlace = parsedPlayers[2];
  const otherPlayers = parsedPlayers.slice(3);

  const getMotivationalQuote = () => {
    const quotes = [
      "Victory is earned through sharp minds!",
      "Every battle makes you stronger!",
      "Second place is just the first step to first!",
      "Keep fighting, greatness awaits!",
      "Math battles build champions!",
    ];
    if (userRank === 1) return quotes[0];
    if (userRank === 2) return quotes[1];
    if (userRank === 3) return quotes[2];
    if (userRank <= parsedPlayers.length / 2) return quotes[3];
    return quotes[4];
  };

  const handleShare = async () => {
    try {
      // const uri = await captureRef(cardRef.current, {
      //   format: "png",
      //   quality: 1.0,
      //   result: "tmpfile",
      //   width: 400,
      //   height: 600,
      // });

      const downloadLinks =
        Platform.OS === "ios"
          ? `📱 iPhone: ${shareConfig.appStoreLink}\n📱 Android: ${shareConfig.playStoreLink}`
          : `📱 Android: ${shareConfig.playStoreLink}\n📱 iPhone: ${shareConfig.appStoreLink}`;

      const shareMessage =
        `${shareConfig.additionalText}\n\n` +
        `🏆 I ranked #${userRank} with ${userScore} points in a math battle!\n` +
        `"${getMotivationalQuote()}"\n\n` +
        `${shareConfig.downloadText}\n\n` +
        `${downloadLinks}\n\n` +
        `${shareConfig.hashtags}`;

      await Share.share({
        title: "My TezMaths Battle Results",
        message: shareMessage,
        // url: `file://${uri}`,
      });
    } catch (error) {
      console.error("Share error:", error);
      Alert.alert("Share Error", "Unable to share. Please try again.", [
        { text: "OK" },
      ]);
    }
  };

  return (
    <View className="flex-1 bg-white justify-center items-center p-4">
      <View
        ref={cardRef}
        collapsable={false}
        className="bg-gray-100 border-4 border-white p-4 rounded-3xl shadow-xl w-full max-w-md"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 4.65,
          elevation: 8,
        }}
      >
        <Text className="text-3xl font-black text-primary text-center mb-6">
          Battle Results
        </Text>

        <View className="mb-6">
          <Text className="text-2xl font-bold text-center">
            {userRank === 1 ? "🏆 You Won!" : `You Ranked #${userRank}`}
          </Text>
          <Text className="text-xl text-center">
            Your Score: {userScore} pts
          </Text>
          <Text className="text-lg text-center italic mt-2">
            "{getMotivationalQuote()}"
          </Text>
        </View>

        <View className="flex-row items-end justify-center h-48 mb-8 border-b">
          {secondPlace && (
            <View className="bg-gray-300 p-2 w-20 h-32 rounded-t-lg justify-end items-center mx-1">
              <Text className="text-black font-bold text-lg">🥈</Text>
              <Text className="font-bold text-center p-1">
                {secondPlace.username}
              </Text>
              <Text className="font-bold text-center">
                {secondPlace.score} pts
              </Text>
            </View>
          )}
          {firstPlace && (
            <View className="bg-yellow-400 p-2 w-24 h-40 rounded-t-lg justify-end items-center mx-1">
              <Text className="text-black font-bold text-lg">🥇</Text>
              <Text className="font-bold text-center p-1">
                {firstPlace.username}
              </Text>
              <Text className="font-bold text-center">
                {firstPlace.score} pts
              </Text>
            </View>
          )}
          {thirdPlace && (
            <View className="bg-amber-600 p-2 w-20 h-24 rounded-t-lg justify-end items-center mx-1">
              <Text className="text-black font-bold text-lg">🥉</Text>
              <Text className="font-bold text-center p-1">
                {thirdPlace.username}
              </Text>
              <Text className="font-bold text-center">
                {thirdPlace.score} pts
              </Text>
            </View>
          )}
        </View>

        <ScrollView className="w-full max-w-md mb-4">
          {otherPlayers.map((player, index) => (
            <View
              key={player.userId}
              className={`flex-row justify-between items-center p-4 rounded-lg mb-2 ${
                player.userId === currentUserId ? "bg-blue-100" : "bg-gray-100"
              }`}
            >
              <Text className="text-xl font-bold">
                {index + 4}. {player.username}
                {player.userId === currentUserId && " (You)"}
              </Text>
              <Text className="text-xl">{player.score} pts</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View className="flex-row justify-between mt-6 w-full max-w-md">
        <TouchableOpacity
          className="py-3 px-6 border border-black rounded-full flex-1 mr-2"
          onPress={() => router.push("/user/home")}
        >
          <View className="flex-row items-center justify-center gap-2">
            <Text className="font-black text-2xl">Home</Text>
            <Image
              source={require("../../assets/icons/home.png")}
              style={{ width: 20, height: 20 }}
              tintColor="#FF6B35"
            />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="py-3 px-6 border border-black rounded-full flex-1 ml-2"
          onPress={handleShare}
        >
          <View className="flex-row items-center justify-center gap-2">
            <Text className="font-black text-2xl">Share</Text>
            <Image
              source={require("../../assets/icons/share.png")}
              style={{ width: 20, height: 20 }}
              tintColor="#FF6B35"
            />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
