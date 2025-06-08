// app/user/battle-results.tsx
import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { useLocalSearchParams, router } from "expo-router";

export default function BattleResultsScreen() {
  const { players, totalQuestions } = useLocalSearchParams();
  let parsedPlayers = [];
  try {
    parsedPlayers = JSON.parse(players || "[]");
  } catch (error) {
    console.error("BattleResultsScreen - Parse error:", error);
  }

  return (
    <View className="flex-1 bg-white justify-center items-center p-4">
      <View className="bg-gray-100 border-4 border-white p-4 rounded-3xl w-full max-w-md">
        <Text className="text-3xl font-black text-primary text-center mb-4">
          Battle Results
        </Text>
        {parsedPlayers.map((player, index) => (
          <View key={player.userId} className="flex-row justify-between mb-2">
            <Text className="text-xl font-bold">
              {index + 1}. {player.username}
            </Text>
            <Text className="text-xl">{player.score} pts</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        className="py-3 px-6 border border-black rounded-full mt-6"
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
    </View>
  );
}
