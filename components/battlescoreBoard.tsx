import React from "react";
import { View, Text, Image } from "react-native";
import { auth } from "../firebase/firebaseConfig";
import { Entypo } from "@expo/vector-icons";


export type BattleEntry = {
  userId: string;
  score: number;
  name: string;
  opponentScore?: number;
  timestamp?: number;
};


interface Props {
  players: BattleEntry[];
}

const medalColors = ["#F97316", "#A3A3A3", "#D97706"]; // Gold, Silver, Bronze

const BattleScoreBoard: React.FC<Props> = ({ players }) => {
  const currentUserId = auth.currentUser?.uid;

  return (
    <View className="bg-orange-50 rounded-2xl p-4 border border-orange-200">
      <Text className="text-center text-xl font-black text-black mb-2">
        Battle Score
      </Text>
      <View className="h-1 bg-orange-400 w-full mb-3 rounded-full" />

      {players.map((entry, index) => {
        const isCurrentUser = entry.userId === currentUserId;

        const showMedal = index < 3;
        const borderClass = isCurrentUser
          ? "border-2 border-orange-500 bg-orange-100"
          : "";
        const nameTextClass = isCurrentUser
          ? "text-orange-600 font-extrabold"
          : "text-purple-800 font-semibold";

        return (
          <View
            key={index}
            className={`flex-row items-center justify-between p-3 rounded-xl mb-2 ${borderClass}`}
          >
            {/* Left: Rank + Avatar + Name */}
            <View className="flex-row items-center gap-3">
              {/* Rank or Medal */}
              <View
                className="w-6 h-6 rounded-full items-center justify-center"
                style={{
                  backgroundColor: showMedal ? medalColors[index] : "#E5E7EB",
                }}
              >
                <Text className="text-white text-xs font-bold">
                  {index + 1}
                </Text>
              </View>

              {/* Avatar */}
              <View className="w-8 h-8 rounded-full bg-gray-300 items-center justify-center">
                <Entypo name="user" size={16} color="#888" />
              </View>

              {/* Name */}
              <Text className={`text-base ${nameTextClass}`}>{entry.name}</Text>
            </View>

            {/* Right: Score */}
            <Text className="text-base text-gray-800 font-medium">
              {entry.score} vs {entry.opponentScore}{" "}
              {isCurrentUser && (
                <Text className="text-sm text-gray-500">(You)</Text>
              )}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default BattleScoreBoard;
