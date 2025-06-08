import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { battleManager } from "../../utils/battleManager";
import { auth } from "../../firebase/firebaseConfig";

export default function BattleRoom() {
  const router = useRouter();
  const { roomId, isHost } = useLocalSearchParams();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const userId = auth.currentUser?.uid;

  // Listen to room updates
  useEffect(() => {
    if (!roomId) return;

    const validateAndListen = async () => {
      try {
        const roomExists = await battleManager.validateRoomExists(roomId);
        if (!roomExists) {
          Alert.alert("Room Expired", "This battle room no longer exists", [
            {
              text: "OK",
              onPress: () => router.replace("/user/multiplayer-mode-selection"),
            },
          ]);
          return;
        }

        const unsubscribe = battleManager.listenToRoom(roomId, (roomData) => {
          if (!roomData) {
            Alert.alert("Room Closed", "The battle room has been closed", [
              {
                text: "OK",
                onPress: () =>
                  router.replace("/user/multiplayer-mode-selection"),
              },
            ]);
            return;
          }

          setRoom(roomData);
          setLoading(false);

          // Handle automatic game start
          if (roomData.status === "playing" && roomData.currentQuestion === 0) {
            router.replace(`/user/battle-screen?roomId=${roomId}&question=0`);
          }
        });

        return () => {
          unsubscribe();
          battleManager.updatePlayerConnection(roomId, false);
        };
      } catch (error) {
        console.error("Room error:", error);
        router.replace("/user/multiplayer-mode-selection");
      }
    };

    validateAndListen();
  }, [roomId]);

  // Start battle handler
  const handleStartBattle = async () => {
    try {
      await battleManager.startBattle(roomId);
    } catch (error) {
      alert(error.message);
    }
  };

  // Toggle ready status
  const toggleReady = async () => {
    await battleManager.toggleReady(roomId);
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!room) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text>Room not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-blue-500 mt-4">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white p-4">
      <Text className="text-2xl font-bold text-center my-4">
        {room.roomName}
      </Text>
      <Text className="text-center text-lg mb-6">Room Code: {room.code}</Text>

      <View className="mb-6">
        <Text className="text-xl font-semibold mb-2">Players:</Text>
        {Object.entries(room.players).map(([id, player]) => (
          <View key={id} className="flex-row items-center py-2 border-b">
            <Text className="flex-1 text-lg">
              {player.name} {player.isHost && "(Host)"}
            </Text>
            <Text>{player.ready ? "✅ Ready" : "❌ Not Ready"}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row justify-between mb-4">
        <TouchableOpacity
          className="px-6 py-3 bg-blue-500 rounded-lg"
          onPress={toggleReady}
        >
          <Text className="text-white font-bold">
            {room.players[userId]?.ready ? "Unready" : "Ready Up"}
          </Text>
        </TouchableOpacity>

        {isHost === "true" && (
          <TouchableOpacity
            className="px-6 py-3 bg-green-500 rounded-lg"
            onPress={handleStartBattle}
            disabled={
              Object.values(room.players).filter((p) => p.ready).length < 2
            }
          >
            <Text className="text-white font-bold">Start Battle</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        className="mt-auto bg-red-500 px-6 py-3 rounded-lg self-center"
        onPress={() => router.back()}
      >
        <Text className="text-white font-bold">Leave Room</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
