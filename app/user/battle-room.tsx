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
  const [battleStarting, setBattleStarting] = useState(false);
  const [opponentFound, setOpponentFound] = useState(false);

  const userId = auth.currentUser?.uid;
  const navigationRef = useRef(false);
  const timeoutRef = useRef(null);
  const battleStartTimeoutRef = useRef(null);
  const battleNavigationTimeoutRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
      navigationRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (battleStartTimeoutRef.current) {
        clearTimeout(battleStartTimeoutRef.current);
      }
      if (battleNavigationTimeoutRef.current) {
        clearTimeout(battleNavigationTimeoutRef.current);
      }
    };
  }, []);

  const safeNavigate = useCallback(
    (path, params = {}) => {
      if (!isMounted || navigationRef.current || isNavigating) return;

      navigationRef.current = true;
      setIsNavigating(true);

      console.log("Navigating to:", path);

      setTimeout(() => {
        if (isMounted && navigationRef.current) {
          try {
            router.push(path);
          } catch (error) {
            console.error("Navigation error:", error);
            navigationRef.current = false;
            setIsNavigating(false);
          }
        }
      }, 100);
    },
    [isMounted, router, isNavigating]
  );

  // Handle matchmaking timeout
  useEffect(() => {
    if (!room?.matchmakingRoom) return;

    const playerCount = Object.keys(room.players || {}).length;

    if (playerCount >= 2) {
      setMatchmakingTimeout(false);
      setOpponentFound(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    if (playerCount === 1) {
      timeoutRef.current = setTimeout(() => {
        if (isMounted && Object.keys(room.players || {}).length < 2) {
          console.log("Matchmaking timeout triggered");
          setMatchmakingTimeout(true);
        }
      }, 30000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [room?.matchmakingRoom, room?.players, isMounted]);

  useEffect(() => {
    if (
      room?.matchmakingRoom &&
      !battleStarting &&
      !matchmakingTimeout &&
      Object.keys(room.players || {}).length === 2 &&
      room.hostId === userId &&
      room.status === "waiting" &&
      !room.autoStartTriggered &&
      !room.battleStarting // Add this check
    ) {
      console.log("Auto-starting matchmaking battle...");
      setBattleStarting(true);

      battleStartTimeoutRef.current = setTimeout(async () => {
        try {
          const currentRoom = await battleManager.validateRoomExists(roomId);
          if (
            currentRoom &&
            Object.values(currentRoom.players || {}).filter((p) => p.ready)
              .length === 2
          ) {
            await battleManager.startBattle(roomId);
          }
        } catch (error) {
          console.error("Failed to auto-start battle:", error);
          setBattleStarting(false);
        }
      }, 2000);
    }

    return () => {
      if (battleStartTimeoutRef.current) {
        clearTimeout(battleStartTimeoutRef.current);
        battleStartTimeoutRef.current = null;
      }
    };
  }, [
    room?.matchmakingRoom,
    room?.players,
    room?.hostId,
    room?.status,
    room?.autoStartTriggered,
    room?.battleStarting,
    userId,
    roomId,
    battleStarting,
    matchmakingTimeout,
  ]);

  // Main room listener
  useEffect(() => {
    if (!roomId || !isMounted) return;

    console.log("Setting up room listener for:", roomId);

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

          console.log("Room data updated:", {
            status: roomData?.status,
            playerCount: Object.keys(roomData?.players || {}).length,
            hasQuestions: !!roomData?.questions,
            isMatchmaking: roomData?.matchmakingRoom,
          });

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

          // FIXED: Enhanced navigation to battle screen
          if (
            roomData.status === "playing" &&
            roomData.questions &&
            roomData.questions.length > 0 &&
            !navigationRef.current &&
            !isNavigating
          ) {
            console.log("Battle is ready, navigating to battle screen");
            setBattleStarting(true);

            // Add a small delay to ensure all players are synchronized
            battleNavigationTimeoutRef.current = setTimeout(() => {
              if (isMounted && !navigationRef.current) {
                safeNavigate(
                  `/user/battle-screen?roomId=${roomId}&question=${
                    roomData.currentQuestion || 0
                  }`
                );
              }
            }, 500);
          }
        });

        return () => {
          if (unsubscribe) unsubscribe();
          battleManager.updatePlayerConnection(roomId, false);
        };
      } catch (error) {
        console.error("Room error:", error);
        if (isMounted) {
          setError(error);
        }
      }
    };

    validateAndListen();
  }, [roomId, isMounted, safeNavigate, isNavigating]);

  const handleStartBattle = async () => {
    if (isNavigating || battleStarting) return;

    try {
      const connectedPlayersCount = Object.values(room.players).filter(
        (p) => p.connected
      ).length;
      const readyPlayersCount = Object.values(room.players).filter(
        (p) => p.ready
      ).length;

      if (connectedPlayersCount < 2) {
        Alert.alert(
          "Not Enough Players",
          "At least 2 players must be connected to start the battle."
        );
        return;
      }

      if (readyPlayersCount < connectedPlayersCount) {
        Alert.alert(
          "Players Not Ready",
          "All connected players must mark themselves as ready to start the battle."
        );
        return;
      }

      console.log("Starting battle with", connectedPlayersCount, "players...");
      setBattleStarting(true);
      await battleManager.startBattle(roomId);
    } catch (error) {
      console.error("Start battle error:", error);
      setBattleStarting(false);
      Alert.alert("Error", error.message);
    }
  };

  const toggleReady = async () => {
    try {
      await battleManager.toggleReady(roomId);
    } catch (error) {
      console.error("Toggle ready error:", error);
      Alert.alert("Error", "Failed to update ready status.");
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await battleManager.leaveRoom(roomId);
      router.replace("/user/multiplayer-mode-selection");
    } catch (error) {
      console.error("Leave room error:", error);
      Alert.alert("Error", "Failed to leave room.");
      router.replace("/user/multiplayer-mode-selection");
    }
  };

  if (error) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text className="text-red-500 text-xl">{error.message}</Text>
        <TouchableOpacity
          onPress={() => router.replace("/user/multiplayer-mode-selection")}
        >
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
        <TouchableOpacity
          onPress={() => router.replace("/user/multiplayer-mode-selection")}
        >
          <Text className="text-blue-500 mt-4">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Matchmaking room logic
  if (room.matchmakingRoom) {
    const playerCount = Object.keys(room.players || {}).length;

    if (matchmakingTimeout) {
      return (
        <View className="flex-1 justify-center items-center p-4">
          <Text className="text-2xl text-center mb-4">
            ⏱️ Matchmaking Timed Out
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            We couldn't find an opponent within 30 seconds.
          </Text>
          <TouchableOpacity
            className="bg-red-500 px-6 py-3 rounded-lg"
            onPress={() => router.replace("/user/multiplayer-mode-selection")}
          >
            <Text className="text-white font-bold">Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (battleStarting || room.status === "playing") {
      return (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#10B981" />
          <Text className="text-2xl mt-4 text-green-600 font-bold">
            Starting Battle...
          </Text>
          <Text className="text-gray-500 mt-2">Get ready to compete!</Text>
        </View>
      );
    }

    if (playerCount < 2) {
      return (
        <View className="flex-1 justify-center items-center p-4">
          <ActivityIndicator size="large" color="#9333ea" />
          <Text className="text-2xl mt-4 font-bold">
            🔍 Finding Opponent...
          </Text>
          <Text className="text-gray-500 mt-2">Players: {playerCount}/2</Text>
          <Text className="text-sm text-gray-400 mt-4 text-center">
            This may take up to 30 seconds
          </Text>

          <TouchableOpacity
            className="mt-6 bg-gray-200 px-4 py-2 rounded-lg"
            onPress={() => router.replace("/user/multiplayer-mode-selection")}
          >
            <Text className="text-gray-700 font-bold">Cancel Search</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Opponent found - Show for a moment then auto-start
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#10B981" />
        <Text className="text-2xl mt-4 text-green-600 font-bold">
          Opponent Found!
        </Text>
        <Text className="text-gray-500 mt-2">Preparing battle...</Text>
      </View>
    );
  }

  // Regular room (quiz code) logic
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
              {id === userId && " (You)"}
            </Text>
            <Text
              className={`${
                player.ready ? "text-green-600" : "text-red-600"
              } font-semibold`}
            >
              {player.ready ? "✅ Ready" : "❌ Not Ready"}
            </Text>
          </View>
        ))}
      </View>

      {!room.players[userId]?.ready && (
        <Text className="text-red-500 text-center mb-4">
          Please mark yourself as ready to start the battle!
        </Text>
      )}

      <View className="flex-row justify-between mb-4">
        <TouchableOpacity
          className={`px-6 py-3 rounded-lg ${
            room.players[userId]?.ready ? "bg-red-500" : "bg-blue-500"
          }`}
          onPress={toggleReady}
        >
          <Text className="text-white font-bold">
            {room.players[userId]?.ready ? "Unready" : "Ready Up"}
          </Text>
        </TouchableOpacity>

        {isHost === "true" && (
          <TouchableOpacity
            className={`px-6 py-3 rounded-lg ${
              Object.values(room.players).filter((p) => p.ready).length <
                Object.values(room.players).filter((p) => p.connected).length ||
              battleStarting
                ? "bg-gray-400"
                : "bg-green-500"
            }`}
            onPress={handleStartBattle}
            disabled={
              Object.values(room.players).filter((p) => p.ready).length <
                Object.values(room.players).filter((p) => p.connected).length ||
              battleStarting
            }
          >
            <Text className="text-white font-bold">
              {battleStarting ? "Starting..." : "Start Battle"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        className="mt-auto bg-red-500 px-6 py-3 rounded-lg self-center"
        onPress={handleLeaveRoom}
      >
        <Text className="text-white font-bold">Leave Room</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
