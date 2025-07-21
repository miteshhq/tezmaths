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
  const [isNavigating, setIsNavigating] = useState(false);
  const [battleStarting, setBattleStarting] = useState(false);
  const [opponentFound, setOpponentFound] = useState(false);
  const [autoReadyToggled, setAutoReadyToggled] = useState(false);
  const [playersInRoom, setPlayersInRoom] = useState({});

  const [battleStartAttempted, setBattleStartAttempted] = useState(false);

  const [navigationLock, setNavigationLock] = useState(false);

  const userId = auth.currentUser?.uid;
  const navigationRef = useRef(false);
  const timeoutRef = useRef(null);
  const battleStartTimeoutRef = useRef(null);
  const battleNavigationTimeoutRef = useRef(null);
  const cleanupRef = useRef(false);

  const roomListenerRef = useRef<(() => void) | null>(null);

  const performCleanup = useCallback(() => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;

    // Clear all timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Remove listeners
    if (roomListenerRef.current) {
      roomListenerRef.current();
      roomListenerRef.current = null;
    }

    // Reset states
    setBattleStarting(false);
    setBattleStartAttempted(false);
    setMatchmakingTimeout(false);
  }, [roomId]);

  useBattleStartListener(roomId as string, isHost === "true");

  useEffect(() => {
    if (!roomId) return;

    const roomRef = ref(database, `rooms/${roomId}/players`);

    const handleSnapshot = (snapshot: any) => {
      try {
        if (!snapshot || typeof snapshot.val !== "function") {
          console.warn("Invalid snapshot received:", snapshot);
          setPlayersInRoom({});
          return;
        }

        const data = snapshot.val();
        setPlayersInRoom(data || {}); // fallback if null
      } catch (err) {
        console.error("Failed to process player data:", err);
        setPlayersInRoom({}); // fallback to prevent crash
      }
    };

    onValue(roomRef, handleSnapshot);

    return () => {
      try {
        off(roomRef, "value", handleSnapshot);
      } catch (error) {
        console.warn("Error detaching Firebase listener:", error);
      }
    };
  }, [roomId]);

  useEffect(() => {
    const unsubscribe = battleManager.listenToRoom(roomId, (roomData) => {
      if (!roomData) return;

      if (roomData.status === "playing") {
        // Auto-navigate for non-hosts
        router.replace({
          pathname: "/user/battle-room",
          params: { roomId },
        });
      }
    });

    return () => unsubscribe();
  }, [roomId]);

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
    setIsMounted(true);
    setBattleStartAttempted(false);
    return () => {
      setIsMounted(false);
      navigationRef.current = false;
      setBattleStartAttempted(false);
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
    (path) => {
      if (navigationLock) {
        console.log("Navigation blocked - already navigating");
        return;
      }

      setNavigationLock(true);

      // Use replace instead of push to prevent stack buildup
      router.replace(path);

      // Reset lock after navigation
      setTimeout(() => setNavigationLock(false), 1000);
    },
    [navigationLock]
  );

  useEffect(() => {
    if (!room?.matchmakingRoom || !roomId) return;

    // Fallback battle start if auto-start fails
    const fallbackTimer = setTimeout(() => {
      if (
        room.status === "waiting" &&
        Object.keys(room.players || {}).length === 2 &&
        room.hostId === userId &&
        !battleStartAttempted
      ) {
        // console.log("Fallback: Starting battle manually");
        handleStartBattle();
      }
    }, 10000); // 10 second fallback

    return () => clearTimeout(fallbackTimer);
  }, [room, roomId, userId, battleStartAttempted]);

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
          //   console.log("Matchmaking timeout triggered");

          // Clean up the room entirely
          try {
            await battleManager.deleteRoom(roomId); // Add this method to battleManager
            setMatchmakingTimeout(true);
          } catch (error) {
            console.error("Failed to delete room:", error);
            setMatchmakingTimeout(true);
          }
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
    return () => {
      // Clean up all timeouts and states
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (battleStartTimeoutRef.current)
        clearTimeout(battleStartTimeoutRef.current);
      if (battleNavigationTimeoutRef.current)
        clearTimeout(battleNavigationTimeoutRef.current);

      // Reset all battle-related states
      setBattleStarting(false);
      setBattleStartAttempted(false);
      setMatchmakingTimeout(false);
      setOpponentFound(false);

      // Update connection status
      if (roomId) {
        battleManager.updatePlayerConnection(roomId, false);
      }
    };
  }, []);

  useEffect(() => {
    if (
      room?.matchmakingRoom &&
      Object.keys(room.players || {}).length === 2 &&
      room.status === "waiting"
    ) {
      const players = Object.values(room.players || {}) as RoomPlayer[];
      const readyAndConnectedCount = players.filter(
        (p: RoomPlayer) => p.ready && p.connected
      ).length;

      if (readyAndConnectedCount === 2 && room.hostId === userId) {
        // console.log("Starting battle immediately with 2 ready players...");
        const startBattle = async () => {
          try {
            await battleManager.startBattle(roomId);
            safeNavigate(`/user/battle-screen?roomId=${roomId}&question=0`);
          } catch (error) {
            console.error("Battle start failed:", error);
            Alert.alert("Battle Start Failed", error.message, [
              {
                text: "Try Again",
                onPress: () => setBattleStartAttempted(false),
              },
              {
                text: "Go Back",
                onPress: () => safeNavigate("/user/multiplayer-mode-selection"),
              },
            ]);
          }
        };
        startBattle();
      }
    }
  }, [
    room?.matchmakingRoom,
    room?.players,
    room?.status,
    room?.hostId,
    userId,
    roomId,
    safeNavigate,
  ]);

  useEffect(() => {
    const checkInitialStatus = async () => {
      const roomSnap = await get(ref(database, `rooms/${roomId}`));
      const roomData = roomSnap.val();
      if (roomData?.status === "playing") {
        console.log("Room already started, navigating...");
        router.replace(`/user/battle-screen?roomId=${roomId}`);
      }
    };

    checkInitialStatus();
  }, []);

  // Enhanced fallback navigation timer
  useEffect(() => {
    if (battleStarting && room?.matchmakingRoom && battleStartAttempted) {
      const fallbackTimer = setTimeout(() => {
        // console.log("=== FALLBACK TIMER TRIGGERED ===");
        // console.log("Room status:", room?.status);
        // console.log("Has questions:", !!room?.questions);
        // console.log("Questions length:", room?.questions?.length);

        if (
          room?.status === "playing" &&
          room?.questions &&
          room?.questions.length > 0
        ) {
          //   console.log("Room is ready, forcing navigation...");
          safeNavigate(`/user/battle-screen?roomId=${roomId}&question=0`);
        } else {
          //   console.log("Battle failed to start properly, resetting...");
          setBattleStarting(false);
          setBattleStartAttempted(false);
          Alert.alert(
            "Battle Failed",
            "Unable to start battle. Please try again.",
            [
              {
                text: "Retry",
                onPress: () => {
                  setBattleStartAttempted(false);
                },
              },
              {
                text: "Go Back",
                onPress: () => safeNavigate("/user/multiplayer-mode-selection"),
              },
            ]
          );
        }
      }, 8000); // 8 seconds

      return () => clearTimeout(fallbackTimer);
    }
  }, [
    battleStarting,
    room?.matchmakingRoom,
    battleStartAttempted,
    room?.status,
    room?.questions,
    roomId,
  ]);

  useEffect(() => {
    const handleConnection = async () => {
      if (roomId) {
        await battleManager.updatePlayerConnection(roomId, true);
      }
    };

    handleConnection();

    return () => {
      if (roomId) {
        battleManager.updatePlayerConnection(roomId, false);
      }
    };
  }, [roomId]);

  // Main room listener
  useEffect(() => {
    if (!roomId || !isMounted) return;

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

        const unsubscribe = battleManager.listenToRoom(
          roomId,
          async (roomData) => {
            if (!isMounted || navigationRef.current) return;

            setRoom(roomData);
            setLoading(false);

            // ✅ Auto toggle ready ONCE on join
            if (
              roomData.players &&
              roomData.players[userId] &&
              !roomData.players[userId].ready &&
              !autoReadyToggled
            ) {
              try {
                await battleManager.toggleReady(roomId);
                setAutoReadyToggled(true); // Prevent re-toggling
              } catch (err) {
                console.error("Auto toggleReady failed:", err);
              }
            }
          }
        );

        return () => {
          if (unsubscribe) unsubscribe();
          battleManager.updatePlayerConnection(roomId, false);
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
  }, [roomId, isMounted, safeNavigate, autoReadyToggled]);

  useEffect(() => {
    if (!roomId || navigationLock) return;

    const roomRef = ref(database, `rooms/${roomId}`);

    const handleSnapshot = (snapshot) => {
      const roomData = snapshot.val();
      if (!roomData || navigationLock) return;

      // Only navigate on status change to playing
      if (roomData.status === "playing" && !navigationLock) {
        console.log("Room status changed to playing - navigating");
        safeNavigate({
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
  }, [roomId, isHost, navigationLock, safeNavigate]);

  const handleStartBattle = async () => {
    if (isNavigating || battleStarting) return;

    try {
      setBattleStarting(true);
      setBattleStartAttempted(true);
      await battleManager.startBattle(roomId); // ⬅️ triggers `status: "playing"`
      // no need to manually navigate — listener handles that
    } catch (error) {
      console.error("Start battle error:", error);
      setBattleStarting(false);
      setBattleStartAttempted(false);
      Alert.alert("Error", "Failed to start battle");
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
              performCleanup(); // ADD THIS LINE
              router.replace("/user/multiplayer-mode-selection");
            }}
          >
            <Text className="text-white font-bold">Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // For matchmaking rooms, update the "Starting Battle..." section:
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

    // Show opponent found only when confirmed
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
// function onValue(roomRef: DatabaseReference, arg1: (snapshot: any) => void) {
//   throw new Error("Function not implemented.");
// }
