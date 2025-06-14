import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../firebase/firebaseConfig";
import { battleManager } from "../../utils/battleManager";

export default function BattleRoom() {
  const router = useRouter();
  const { roomId, isHost } = useLocalSearchParams();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matchmakingTimeout, setMatchmakingTimeout] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const userId = auth.currentUser?.uid;
  const navigationRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
      navigationRef.current = false;
    };
  }, []);

  const safeNavigate = useCallback(
    (path, params = {}) => {
      if (!isMounted || navigationRef.current || isNavigating) return;

      navigationRef.current = true;
      setIsNavigating(true);

      //   console.log("Navigating to:", path);

      setTimeout(() => {
        if (isMounted && navigationRef.current) {
          try {
            router.push(path);
          } catch (error) {
            // console.error("Navigation error:", error);
            navigationRef.current = false;
            setIsNavigating(false);
          }
        }
      }, 300); // Increased delay
    },
    [isMounted, router, isNavigating]
  );

  useEffect(() => {
    if (!room?.matchmakingRoom) return;

    const playerCount = Object.keys(room.players || {}).length;

    if (playerCount >= 2) {
      setMatchmakingTimeout(false);
      return;
    }

    const timer = setTimeout(() => {
      if (playerCount < 2 && isMounted) {
        setMatchmakingTimeout(true);
      }
    }, 30000);

    return () => clearTimeout(timer);
  }, [room?.matchmakingRoom, room?.players, isMounted]);

  useEffect(() => {
    if (!roomId || !isMounted) return;

    // console.log("Setting up room listener for:", roomId);

    const validateAndListen = async () => {
      try {
        const roomExists = await battleManager.validateRoomExists(roomId);
        if (!roomExists) {
          Alert.alert("Room Expired", "This battle room no longer exists", [
            {
              text: "OK",
              onPress: () => safeNavigate("/user/multiplayer-mode-selection"),
            },
          ]);
          return;
        }

        const unsubscribe = battleManager.listenToRoom(roomId, (roomData) => {
          if (!isMounted || navigationRef.current) return;

          //   console.log("Room data updated:", roomData);

          if (!roomData) {
            Alert.alert("Room Closed", "The battle room has been closed", [
              {
                text: "OK",
                onPress: () => safeNavigate("/user/multiplayer-mode-selection"),
              },
            ]);
            return;
          }

          setRoom(roomData);
          setLoading(false);

          // Check if battle should start
          if (
            roomData.status === "playing" &&
            roomData.questions &&
            roomData.questions.length > 0 &&
            roomData.currentQuestion !== undefined
          ) {
            // console.log("Battle is starting, navigating to battle screen");
            safeNavigate(
              `/user/battle-screen?roomId=${roomId}&question=${roomData.currentQuestion}`
            );
          }
        });

        return () => {
          if (unsubscribe) unsubscribe();
          battleManager.updatePlayerConnection(roomId, false);
        };
      } catch (error) {
        // console.error("Room error:", error);
        if (isMounted) {
          setError(error);
        }
      }
    };

    validateAndListen();
  }, [roomId, isMounted, safeNavigate]);

  const handleStartBattle = async () => {
    if (isNavigating) return;

    try {
      const readyPlayersCount = Object.values(room.players).filter(
        (p) => p.ready
      ).length;
      if (readyPlayersCount < 2) {
        Alert.alert(
          "Not enough players",
          "At least 2 players need to be ready to start the battle."
        );
        return;
      }

      //   console.log("Starting battle...");
      await battleManager.startBattle(roomId);
      router.push(`/user/battle-screen?roomId=${roomId}`);
    } catch (error) {
      // console.error("Start battle error:", error);
      Alert.alert("Error", error.message);
    }
  };

  const toggleReady = async () => {
    try {
      await battleManager.toggleReady(roomId);
    } catch (error) {
      // console.error("Toggle ready error:", error);
    }
  };

  if (error) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text className="text-red-500 text-xl">{error.message}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-blue-500 mt-4">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" />
        <Text className="mt-2">Loading room...</Text>
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

  const tryStartBattle = async () => {
    try {
      await battleManager.startBattle(roomId);
      router.push(`/user/battle-screen?roomId=${roomId}&question=0`);
    } catch (error) {
      // console.error("Error starting battle:", error);
      Alert.alert("Error", "Failed to start the battle. Please try again.");
    }
  };

  // Handle matchmaking room states
  if (room.matchmakingRoom) {
    const playerCount = Object.keys(room.players || {}).length;

    if (matchmakingTimeout) {
      return (
        <View className="flex-1 justify-center items-center">
          <Text className="text-2xl text-center">Matchmaking timed out</Text>
          <TouchableOpacity
            className="mt-4 bg-red-500 px-4 py-2 rounded"
            onPress={() => router.back()}
          >
            <Text className="text-white">Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (playerCount < 2) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#9333ea" />
          <Text className="text-2xl mt-4">Waiting for opponent...</Text>
          <Text className="text-gray-500 mt-2">Players: {playerCount}/2</Text>
        </View>
      );
    }

    if (!Object.values(room.players).every((p) => p.ready)) {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#9333ea" />
          <Text className="text-2xl mt-4">
            Waiting for players to ready up...
          </Text>
          <Text className="text-gray-500 mt-2">Players: {playerCount}/2</Text>
        </View>
      );
    }

    // Start battle when both players are ready
    tryStartBattle();

    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#10B981" />
        <Text className="text-2xl mt-4">Starting battle...</Text>
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
        {!room.matchmakingRoom && (
          <TouchableOpacity
            className="px-6 py-3 bg-blue-500 rounded-lg"
            onPress={toggleReady}
          >
            <Text className="text-white font-bold">
              {room.players[userId]?.ready ? "Unready" : "Ready Up"}
            </Text>
          </TouchableOpacity>
        )}
        {isHost === "true" && !room.matchmakingRoom && (
          <TouchableOpacity
            className="px-6 py-3 bg-green-500 rounded-lg"
            onPress={handleStartBattle}
            disabled={
              Object.values(room.players).filter((p) => p.ready).length < 2 ||
              isNavigating
            }
          >
            <Text className="text-white font-bold">
              {isNavigating ? "Starting..." : "Start Battle"}
            </Text>
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
