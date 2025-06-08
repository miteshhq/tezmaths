import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { battleManager } from "../../utils/battleManager";

export default function ResultsScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;

    const unsubscribe = battleManager.listenToRoom(roomId, (roomData) => {
      if (roomData?.results) {
        setResults(roomData.results);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      battleManager.cleanup();
    };
  }, [roomId]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white p-4">
      <Text className="text-2xl font-bold text-center my-4">
        Battle Results
      </Text>

      <View className="mb-6">
        {results
          .sort((a, b) => b.score - a.score)
          .map((player, index) => (
            <View
              key={player.playerId}
              className="flex-row items-center py-3 border-b"
            >
              <Text className="text-xl w-8">#{index + 1}</Text>
              <Text className="flex-1 text-xl">{player.name}</Text>
              <Text className="text-xl font-bold">{player.score} pts</Text>
            </View>
          ))}
      </View>

      <TouchableOpacity
        className="bg-purple-500 px-6 py-3 rounded-lg self-center"
        onPress={() => router.replace("/")}
      >
        <Text className="text-white font-bold text-lg">
          Return to Main Menu
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
