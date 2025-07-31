import { useLocalSearchParams, useRouter } from "expo-router";
import { get, ref, off, onValue } from "firebase/database";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";
import { battleManager } from "../../utils/battleManager";
import useBattleStartListener from "../../utils/battlelistner";
import { useFocusEffect } from "expo-router";

interface RoomPlayer {
  name: string;
  username?: string;
  avatar?: number;
  score?: number;
  userId?: string;
  isHost?: boolean;
  ready: boolean;
  connected: boolean;
}

interface Room {
  roomName?: string;
  code?: string;
  players: Record<string, RoomPlayer>;
  status: string;
  hostId?: string;
  matchmakingRoom?: boolean;
  questions?: any[];
  currentQuestion?: number;
}

export default function BattleRoom() {
  const router = useRouter();
  const { roomId, isHost } = useLocalSearchParams();

  useEffect(() => {
    if (!roomId) {
      Alert.alert("Error", "Room not found.");
      router.replace("/user/home");
    }
  }, [roomId]);

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matchmakingTimeout, setMatchmakingTimeout] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [battleStarting, setBattleStarting] = useState(false);
  const [opponentFound, setOpponentFound] = useState(false);
  const startTriggered = useRef(false);
  const [battleStartAttempted, setBattleStartAttempted] = useState(false);

  const userId = auth.currentUser?.uid;
  const timeoutRef = useRef(null);
  const battleStartTimeoutRef = useRef(null);
  const cleanupRef = useRef(false);

  // Simplified cleanup function
  const performCleanup = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;

    console.log("Battle room cleanup starting");

    try {
      // Clear all timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (battleStartTimeoutRef.current) {
        clearTimeout(battleStartTimeoutRef.current);
        battleStartTimeoutRef.current = null;
      }

      // Update connection status
      if (roomId) {
        await battleManager.updatePlayerConnection(roomId, false);
      }

      // Reset states
      setBattleStarting(false);
      setBattleStartAttempted(false);
      setMatchmakingTimeout(false);
      setOpponentFound(false);
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      // Reset cleanup flag after a delay
      setTimeout(() => {
        cleanupRef.current = false;
      }, 1000);
    }
  }, [roomId]);

  useBattleStartListener(roomId as string, isHost === "true");

  // Reset state & listeners on focus
  useFocusEffect(
    useCallback(() => {
      setOpponentFound(false);
      startTriggered.current = false;
      battleManager.resetUserBattleState();
      return () => battleManager.resetUserBattleState();
    }, [])
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
      timeoutRef.current = setTimeout(async () => {
        if (isMounted && Object.keys(room.players || {}).length < 2) {
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
  }, [room?.matchmakingRoom, room?.players, isMounted, roomId]);

  useEffect(() => {
    if (!roomId) return;

    const checkRoomExists = async () => {
      const snap = await get(ref(database, `rooms/${roomId}`));
      if (!snap.exists()) {
        Alert.alert(
          "Room Not Available",
          "This room has been deleted or expired."
        );
        router.replace("/user/multiplayer-mode-selection");
      }
    };

    checkRoomExists();
  }, [roomId]);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
      performCleanup();
    };
  }, [performCleanup]);

  // Connect to room
  useEffect(() => {
    const connectToRoom = async () => {
      if (roomId) {
        await battleManager.updatePlayerConnection(roomId, true);
      }
    };

    connectToRoom();

    return () => {
      if (roomId) {
        battleManager.updatePlayerConnection(roomId, false);
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (
      room?.matchmakingRoom &&
      Object.keys(room.players || {}).length === 2 &&
      room.status === "waiting" &&
      !startTriggered.current
    ) {
      const connectedCnt = Object.values(room.players || {}).filter(
        (p) => p.connected
      ).length;
      const isHost = room.hostId === userId;

      // Only trigger once when two connected and I'm host
      if (connectedCnt === 2 && isHost) {
        startTriggered.current = true;
        setOpponentFound(true);
        setBattleStarting(true);
        setBattleStartAttempted(true);
        battleManager.startBattle(roomId).catch((error) => {
          console.error("Battle start failed:", error);
          setBattleStarting(false);
          setBattleStartAttempted(false);
          startTriggered.current = false;
        });
      }
    }
  }, [room, roomId, userId]);

  // Main room listener
  useEffect(() => {
    if (!roomId || !isMounted) return;

    const validateAndListen = async () => {
      try {
        const roomExists = await battleManager.validateRoomExists(roomId);
        if (!roomExists.exists) {
          Alert.alert("Room Expired", "This battle room no longer exists", [
            {
              text: "OK",
              onPress: () => router.replace("/user/multiplayer-mode-selection"),
            },
          ]);
          return;
        }

        const unsubscribe = battleManager.listenToRoom(
          roomId,
          async (roomData) => {
            setRoom(roomData);
            setLoading(false);
          }
        );

        return () => {
          if (unsubscribe) unsubscribe();
        };
      } catch (error) {
        if (error.message.includes("permission")) {
          Alert.alert(
            "Permission Error",
            "You don't have permission to access this room"
          );
        } else {
          setError(error);
        }
      }
    };

    validateAndListen();
  }, [roomId, isMounted]);

  // Listen for battle start
  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(database, `rooms/${roomId}`);

    const handleSnapshot = (snapshot) => {
      const roomData = snapshot.val();
      if (!roomData) return;

      // Navigate when battle starts
      if (roomData.status === "playing") {
        console.log("Room status changed to playing - navigating");
        router.replace({
          pathname: "/user/battle-screen",
          params: { roomId, isHost },
        });
      }
    };

    const unsubscribe = onValue(roomRef, handleSnapshot);

    return () => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn("Error unsubscribing:", error);
      }
    };
  }, [roomId, isHost]);

  const handleStartBattle = async () => {
    if (battleStarting) return;

    try {
      setBattleStarting(true);
      setBattleStartAttempted(true);
      await battleManager.startBattle(roomId);
    } catch (error) {
      console.error("Start battle error:", error);
      setBattleStarting(false);
      setBattleStartAttempted(false);
      Alert.alert("Error", "Failed to start battle");
    }
  };

  // FIXED: Ready/Unready button functionality
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
      await performCleanup();
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
            onPress={() => {
              performCleanup();
              router.replace("/user/multiplayer-mode-selection");
            }}
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
            {room.status === "playing"
              ? "Loading Battle..."
              : "Starting Battle..."}
          </Text>
          <Text className="text-gray-500 mt-2">
            {room.status === "playing"
              ? "Preparing questions..."
              : "Get ready to compete!"}
          </Text>
          {battleStartAttempted && (
            <Text className="text-blue-500 mt-2 text-sm">
              This may take a few seconds...
            </Text>
          )}
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
              {(player as RoomPlayer).name}{" "}
              {(player as RoomPlayer).isHost && "(Host)"}
              {id === userId && " (You)"}
            </Text>
            <Text
              className={`${
                (player as RoomPlayer).ready ? "text-green-600" : "text-red-600"
              } font-semibold`}
            >
              {(player as RoomPlayer).ready ? "✅ Ready" : "❌ Not Ready"}
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
              Object.values(room.players).filter((p: RoomPlayer) => p.ready)
                .length <
                Object.values(room.players).filter(
                  (p: RoomPlayer) => p.connected
                ).length || battleStarting
                ? "bg-gray-400"
                : "bg-green-500"
            }`}
            onPress={handleStartBattle}
            disabled={
              Object.values(room.players).filter((p: RoomPlayer) => p.ready)
                .length <
                Object.values(room.players).filter(
                  (p: RoomPlayer) => p.connected
                ).length || battleStarting
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
