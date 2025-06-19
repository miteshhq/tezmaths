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
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import SoundManager from "../../components/soundManager";
import logo from "../../assets/branding/tezmaths-full-logo.png";
import { auth } from "../../firebase/firebaseConfig";

const shareConfig = {
  additionalText: "Check out my battle results on TezMaths! ⚔️✨",
  playStoreLink:
    "https://play.google.com/store/apps/details?id=com.tezmathsteam.tezmaths",
  downloadText: "Join the battle on TezMaths now!",
  hashtags: "#TezMaths #MathBattle #BrainTraining",
};

const avatarImages = (avatar) => {
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

export default function BattleResultsScreen() {
  const { players, totalQuestions } = useLocalSearchParams();
  const cardRef = useRef();

  const currentUserId = auth.currentUser?.uid;

  let parsedPlayers = [];

  try {
    parsedPlayers = JSON.parse(players || "[]");
  } catch (error) {
    // console.error("BattleResultsScreen - Parse error:", error);
  }

  // Sort players by score (highest first)
  parsedPlayers = parsedPlayers.sort((a, b) => b.score - a.score);

  const userRank =
    parsedPlayers.findIndex((p) => p.userId === currentUserId) + 1;
  const userScore =
    parsedPlayers.find((p) => p.userId === currentUserId)?.score || 0;

  // Play victory sound on focus if userRank is 1
  useFocusEffect(() => {
    if (userRank === 1) {
      SoundManager.playSound("victorySoundEffect").catch(console.error);
    }
    return () => {
      if (userRank === 1) {
        SoundManager.stopSound("victorySoundEffect").catch(console.error);
      }
    };
  });

  const renderProfileImages = () => {
    if (!parsedPlayers || parsedPlayers.length === 0) return null;

    const elements = [];
    parsedPlayers.forEach((player, index) => {
      // Add player profile
      elements.push(
        <View key={`player-${player.userId}`} className="items-center">
          <View className="rounded-full bg-gray-300 items-center justify-center border-2 border-primary">
            {player ? (
              <Image
                source={avatarImages(player.avatar)}
                className="w-full h-full rounded-full"
                style={{ width: 48, height: 48 }}
                resizeMode="cover"
              />
            ) : (
              <Text className="text-primary font-bold">
                {(player.username || "P").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Text className="text-xs mt-1 text-center max-w-16" numberOfLines={1}>
            {player.username}
          </Text>
        </View>
      );

      // Add sword between players (except after last player)
      if (index < parsedPlayers.length - 1) {
        elements.push(
          <View key={`sword-${index}`} className="items-center justify-center">
            <Image
              source={require("../../assets/icons/swords.png")} // You'll add this later
              style={{ width: 12, height: 12 }}
              tintColor="#F05A2A"
            />
          </View>
        );
      }
    });

    return (
      <View className="flex-row items-center justify-center space-x-2 mb-4">
        {elements}
      </View>
    );
  };

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
      const downloadLinks = `📱 Android: ${shareConfig.playStoreLink}`;

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
      });
    } catch (error) {
      //   console.error("Share error:", error);
      Alert.alert("Share Error", "Unable to share. Please try again.", [
        { text: "OK" },
      ]);
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
        <View
          ref={cardRef}
          collapsable={false}
          className="bg-custom-gray border-4 border-white p-4 rounded-3xl shadow-xl w-full max-w-md"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 4.65,
            elevation: 8,
          }}
        >
          <Text className="text-3xl font-bold text-black text-center mb-6">
            Battle With Friends
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

          {renderProfileImages()}

          <Text className="text-2xl text-black font-bold text-center w-full mb-2">
            Battle Score
          </Text>

          <ScrollView className="w-full max-w-md mb-4">
            {parsedPlayers.map((player, index) => (
              <View
                key={player.userId}
                className={`flex-row justify-between items-center p-4 py-2 rounded-lg mb-2 bg-light-orange ${
                  player.userId === currentUserId
                    ? "border-2 border-primary"
                    : "border-transparent border-2"
                }`}
              >
                <Text className="text-xl font-bold">
                  {index + 1}. {player.username}
                  {player.userId === currentUserId ? " (You)" : ""}
                </Text>
                <Text className="text-xl">{player.score} pts</Text>
              </View>
            ))}
          </ScrollView>

          <Text className="text-3xl mt-2 mb-2 font-black text-center text-white p-2 bg-primary rounded-xl">
            Download Now
          </Text>

          <View className="items-center mb-8 mt-3">
            <Image source={logo} style={{ height: 30, width: 140 }} />
            <Text className="text-black text-center">
              Sharpen your speed, master your math!
            </Text>
          </View>
        </View>

        <View className="flex-row justify-between mt-6 w-full max-w-md">
          <TouchableOpacity
            className="py-3 px-6 border border-black rounded-full flex-1 mr-1"
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
            className="py-3 px-6 border border-black rounded-full flex-1 ml-1"
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
    </ScrollView>
  );
}
