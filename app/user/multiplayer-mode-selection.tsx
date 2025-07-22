import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  ImageBackground,
  Keyboard,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { battleManager } from "../../utils/battleManager";
import { get, ref, remove } from "firebase/database";
import type { BattleEntry } from "../../components/battlescoreBoard";
import BattleScoreBoard from "../../components/battlescoreBoard";
import { fetchLast5BattleResults } from "../../utils/saveBattleResult";
import { auth, database } from "../../firebase/firebaseConfig";

type Player = {
  name: string;
};

export default function MultiplayerModeSelection() {
  const router = useRouter();

  const [showQuizCodeInput, setShowQuizCodeInput] = useState(false);
  const [quizCode, setQuizCode] = useState("");
  const [joiningRoom, setJoiningRoom] = useState(false);

  const [battleResults, setBattleResults] = useState([]);

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [playersInRoom, setPlayersInRoom] = useState<Record<string, Player>>(
    {}
  );

  const [searchingRandom, setSearchingRandom] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Add state management for operations
  const [operationInProgress, setOperationInProgress] = useState(false);
  const [lastOperationTime, setLastOperationTime] = useState(0);

  const matchmakingListenerRef = useRef(null);
  const roomListenerRef = useRef(null);

  const MAX_PLAYERS = 2; // Fixed to 2 players for battles

  const performCleanup = useCallback(async () => {
    if (operationInProgress) {
      console.log("Operation in progress, skipping cleanup");
      return;
    }

    console.log("Performing multiplayer cleanup");

    try {
      setOperationInProgress(true);

      if (roomListenerRef.current) {
        roomListenerRef.current();
        roomListenerRef.current = null;
      }

      if (matchmakingListenerRef.current) {
        matchmakingListenerRef.current();
        matchmakingListenerRef.current = null;
      }

      await battleManager.cancelMatchmaking();

      if (roomId) {
        await battleManager.leaveRoom(roomId);
      }

      console.log("Multiplayer cleanup completed");
    } catch (error) {
      console.warn("Cleanup error:", error);
    } finally {
      setOperationInProgress(false);
    }
  }, [roomId, operationInProgress]);

  useFocusEffect(
    useCallback(() => {
      console.log("MultiplayerModeSelection focused");

      const handleFocus = async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await battleManager.cancelMatchmaking();
          console.log("Matchmaking cancelled on focus");
        } catch (error) {
          console.warn("Focus cleanup error:", error);
        }
      };

      handleFocus();

      return () => {
        console.log("MultiplayerModeSelection unfocused");
      };
    }, [])
  );

  useEffect(() => {
    const backAction = () => {
      if (!operationInProgress) {
        router.push("/user/home");
      }
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [router, operationInProgress]);

  useEffect(() => {
    return () => {
      performCleanup();
    };
  }, [performCleanup]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardHeight(300);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (roomId) {
        battleManager.removeRoomListener(roomId);
      }
    };
  }, [roomId]);

  const debounceOperation = useCallback(
    (operation: () => Promise<void>, delay = 1000) => {
      const now = Date.now();
      if (now - lastOperationTime < delay) {
        console.log("Operation debounced");
        return;
      }
      setLastOperationTime(now);
      return operation();
    },
    [lastOperationTime]
  );

  const resetAllStates = useCallback(() => {
    setShowQuizCodeInput(false);
    setShowCreateRoom(false);
    setSearchingRandom(false);
    setQuizCode("");
    setRoomName("");
    setRoomCode("");
    setRoomId("");
    setPlayersInRoom({});
    setJoiningRoom(false);
    setCreatingRoom(false);
  }, []);

  const handleShowQuizCodeInput = () => {
    if (operationInProgress) return;
    resetAllStates();
    setShowQuizCodeInput(true);
  };

  const handleShowCreateRoom = () => {
    if (operationInProgress) return;
    resetAllStates();
    setShowCreateRoom(true);
  };

  const handleJoinQuizCode = async () => {
    if (operationInProgress || joiningRoom) return;

    if (quizCode.length < 4) {
      Alert.alert(
        "Invalid Code",
        "Please enter a valid quiz code (minimum 4 characters)"
      );
      return;
    }

    setJoiningRoom(true);
    setOperationInProgress(true);

    try {
      console.log("Attempting to join room with code:", quizCode);
      const { roomId: foundRoomId } = await battleManager.joinRoom(quizCode);
      console.log("Successfully joined room:", foundRoomId);

      await new Promise((resolve) => setTimeout(resolve, 500));

      router.push(`/user/battle-room?roomId=${foundRoomId}&isHost=false`);
    } catch (error) {
      console.error("Join room error:", error);
      Alert.alert("Error", error.message);
    } finally {
      setJoiningRoom(false);
      setOperationInProgress(false);
    }
  };

  const shareRoomDetails = async (roomId: string, roomCode: string) => {
    try {
      const message = `🎮 Join my TezMaths Battle Room!\n\n🔑 Room Code: ${roomCode}\n\nOpen the app and enter the code to join. Let's battle it out! 🚀`;
      await Share.share({ message });
    } catch (error) {
      console.error("Failed to share room details:", error);
      Alert.alert("Error", "Could not share room details.");
    }
  };

  const handleCreateRoom = async () => {
    if (operationInProgress || creatingRoom) {
      console.log("Create room operation already in progress");
      return;
    }

    return debounceOperation(async () => {
      setCreatingRoom(true);
      setOperationInProgress(true);

      try {
        const user = auth.currentUser;
        if (!user?.uid) {
          Alert.alert("Error", "You must be logged in to create a room");
          return;
        }

        console.log("Creating room for user:", user.uid);

        if (roomListenerRef.current) {
          roomListenerRef.current();
          roomListenerRef.current = null;
        }

        if (roomId) {
          try {
            await battleManager.leaveRoom(roomId);
          } catch (err) {
            console.warn("Failed to leave previous room:", err);
          }
        }

        setRoomId("");
        setRoomCode("");
        setPlayersInRoom({});

        await new Promise((resolve) => setTimeout(resolve, 500));

        const finalRoomName = roomName?.trim() || "Battle Room";

        console.log("Creating room with name:", finalRoomName);
        const roomData = await battleManager.createRoom(finalRoomName, 2);

        if (roomData?.roomId && roomData?.roomCode) {
          setRoomId(roomData.roomId);
          setRoomCode(roomData.roomCode);

          console.log("Room created successfully:", {
            roomId: roomData.roomId,
            roomCode: roomData.roomCode,
          });

          const unsubscribe = battleManager.addRoomListener(
            roomData.roomId,
            (updatedRoomData) => {
              console.log("Room data updated:", updatedRoomData);
              if (updatedRoomData?.players) {
                setPlayersInRoom(updatedRoomData.players);

                if (updatedRoomData.status === "playing") {
                  console.log("Battle starting, navigating to battle screen");
                  setShowCreateRoom(false);
                  router.push({
                    pathname: "/user/battle-screen",
                    params: {
                      roomId: roomData.roomId,
                      isHost: "true",
                    },
                  });
                }
              }
            }
          );

          roomListenerRef.current = unsubscribe;
        } else {
          throw new Error("Failed to create room - invalid response");
        }
      } catch (error) {
        console.error("Create room error:", error);
        Alert.alert("Error", "Failed to create room. Please try again.");

        setRoomId("");
        setRoomCode("");
        setPlayersInRoom({});
      } finally {
        setCreatingRoom(false);
        setOperationInProgress(false);
      }
    });
  };

  const startBattleRoom = async () => {
    if (operationInProgress) return;

    if (Object.keys(playersInRoom).length < 2) {
      Alert.alert("Need More Players", "Wait for at least 2 players to join");
      return;
    }

    setOperationInProgress(true);

    try {
      console.log("Starting battle for room:", roomId);
      await battleManager.startBattle(roomId);

      await new Promise((resolve) => setTimeout(resolve, 500));

      router.push(`/user/battle-screen?roomId=${roomId}&isHost=true`);
    } catch (error) {
      console.error("Start battle error:", error);
      Alert.alert("Error", error.message || "Failed to start battle");
    } finally {
      setOperationInProgress(false);
    }
  };

  const cancelRoomCreation = useCallback(async () => {
    if (operationInProgress || creatingRoom) {
      console.log("Cannot cancel - operation in progress");
      return;
    }

    setOperationInProgress(true);

    try {
      if (roomId) {
        const user = auth.currentUser;
        const userId = user?.uid;

        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);

        if (snapshot.exists()) {
          const roomData = snapshot.val();
          if (roomData.hostId === userId) {
            await remove(roomRef);
            console.log("Room deleted by host");
          } else {
            await battleManager.leaveRoom(roomId);
            console.log("Left room as guest");
          }
        }
      }

      if (roomListenerRef.current) {
        roomListenerRef.current();
        roomListenerRef.current = null;
      }
    } catch (error) {
      console.error("Cancel room error:", error);
    } finally {
      resetAllStates();
      setOperationInProgress(false);
    }
  }, [roomId, operationInProgress, creatingRoom, resetAllStates]);

  const handleRandomMatch = async () => {
    if (operationInProgress || searchingRandom) {
      console.log("Random match already in progress");
      return;
    }

    return debounceOperation(async () => {
      setSearchingRandom(true);
      setOperationInProgress(true);
      resetAllStates();
      setSearchingRandom(true);

      try {
        console.log("Starting random match search");

        const user = auth.currentUser;
        if (!user?.uid) {
          throw new Error("User not authenticated");
        }

        const { roomId, isHost } = await battleManager.findRandomMatch(2);
        console.log("Random match found:", { roomId, isHost });

        await new Promise((res) => setTimeout(res, 1000));

        router.push(
          `/user/battle-room?roomId=${roomId}&isHost=${
            isHost ? "true" : "false"
          }`
        );
      } catch (error) {
        console.error("Random match error:", error);
        Alert.alert("Matchmaking Failed", error.message || "Room not found");
      } finally {
        setSearchingRandom(false);
        setOperationInProgress(false);
      }
    });
  };

  const cancelRandomSearch = useCallback(async () => {
    if (operationInProgress) return;

    setOperationInProgress(true);
    setSearchingRandom(false);

    try {
      await battleManager.cancelMatchmaking();
      console.log("Random search cancelled");
    } catch (error) {
      console.error("Cancel matchmaking error:", error);
    } finally {
      setOperationInProgress(false);
    }

    if (roomId) {
      try {
        await battleManager.leaveRoom(roomId);
      } catch (error) {
        console.error("Leave room error:", error);
      }
      setRoomId("");
    }
  }, [roomId, operationInProgress]);

  useEffect(() => {
    const fetchResults = async () => {
      if (roomId) {
        try {
          const results = await fetchLast5BattleResults(roomId);
          setBattleResults(results);
        } catch (error) {
          console.warn("Failed to fetch battle results:", error);
          setBattleResults([]);
        }
      }
    };
    fetchResults();
  }, [roomId]);

  const formattedResults = battleResults.map((entry) => ({
    ...entry,
    name: playersInRoom[entry.userId]?.name || "Player",
    opponentScore: entry.opponentScore || 0,
  }));

  const handleCancelQuizCode = () => {
    if (operationInProgress) return;
    resetAllStates();
    Keyboard.dismiss();
  };

  const handleCancelCreateRoom = () => {
    if (operationInProgress) return;
    resetAllStates();
    Keyboard.dismiss();
  };

  return (
    <View className="flex-1 bg-white">
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-6 py-6">
          <View className="flex-row justify-center items-center gap-3">
            <Image
              source={require("../../assets/icons/swords.png")}
              style={{ width: 32, height: 32 }}
              tintColor="#FFFFFF"
            />
            <Text className="text-white text-3xl font-black">Battle Mode</Text>
          </View>
        </View>
      </ImageBackground>

      <ScrollView
        className="bg-white"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: keyboardHeight > 0 ? keyboardHeight : 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 py-6">
          <View className="flex-col justify-center items-center mb-6">
            <Text className="text-custom-purple text-3xl font-black text-center">
              Choose Your Battle Mode!
            </Text>
            <Text className="text-custom-purple text-center text-base mt-3 italic leading-6">
              Experience competitive math battles with players worldwide.
              Challenge yourself and climb the leaderboard!
            </Text>
          </View>
        </View>

        <View className="px-5 flex flex-col gap-6">
          {/* Random Player Mode */}
          <View className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <View className="w-full h-2 bg-primary"></View>
            <View className="p-6 flex flex-col items-center gap-5">
              <View className="flex flex-col items-center gap-2">
                <Text className="text-2xl text-custom-purple font-black">
                  🎯 Random Player
                </Text>
                <Text className="text-sm text-center text-custom-purple leading-5">
                  Get matched with a random opponent for an exciting battle!
                  Quick and competitive.
                </Text>
              </View>

              {!searchingRandom ? (
                <TouchableOpacity
                  onPress={handleRandomMatch}
                  disabled={operationInProgress}
                  className="w-full"
                >
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      opacity: operationInProgress ? 0.7 : 1,
                    }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-4 px-8">
                      <Text className="text-white font-bold text-lg text-center">
                        Find Random Battle
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ) : (
                <View className="flex flex-col items-center gap-4">
                  <ActivityIndicator size="large" color="#76184F" />
                  <Text className="text-custom-purple font-bold text-lg">
                    Searching for opponent...
                  </Text>
                  <TouchableOpacity
                    className="px-6 py-3 bg-custom-gray rounded-lg"
                    onPress={cancelRandomSearch}
                    disabled={operationInProgress}
                  >
                    <Text className="text-custom-purple font-bold">
                      Cancel Search
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Quiz Code Mode */}
          <View className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <View className="w-full h-2 bg-primary"></View>
            <View className="p-6 flex flex-col items-center gap-5">
              <View className="flex flex-col items-center gap-2">
                <Text className="text-2xl text-custom-purple font-black">
                  🔑 Quiz Code
                </Text>
                <Text className="text-sm text-center text-custom-purple leading-5">
                  Join a specific battle using a quiz code from your friend!
                  Perfect for private matches.
                </Text>
              </View>

              {!showQuizCodeInput ? (
                <TouchableOpacity
                  onPress={handleShowQuizCodeInput}
                  disabled={operationInProgress}
                  className="w-full"
                >
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      opacity: operationInProgress ? 0.7 : 1,
                    }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-4 px-8">
                      <Text className="text-white font-bold text-lg text-center">
                        Enter Quiz Code
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ) : (
                <View className="w-full flex flex-col gap-4">
                  <TextInput
                    className="border-2 border-custom-purple rounded-xl px-4 py-4 text-center text-lg font-bold text-custom-purple bg-light-orange"
                    placeholder="Enter Quiz Code"
                    placeholderTextColor="#76184F"
                    value={quizCode}
                    onChangeText={setQuizCode}
                    maxLength={8}
                    autoCapitalize="characters"
                    autoFocus={true}
                    returnKeyType="done"
                    onSubmitEditing={handleJoinQuizCode}
                    blurOnSubmit={true}
                    editable={!operationInProgress}
                  />
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      className="flex-1"
                      onPress={handleJoinQuizCode}
                      disabled={joiningRoom || operationInProgress}
                    >
                      <ImageBackground
                        source={require("../../assets/gradient.jpg")}
                        style={{
                          borderRadius: 12,
                          overflow: "hidden",
                          opacity: joiningRoom || operationInProgress ? 0.7 : 1,
                        }}
                        imageStyle={{ borderRadius: 12 }}
                      >
                        <View className="py-4 flex-row justify-center items-center gap-2">
                          {joiningRoom && (
                            <ActivityIndicator size="small" color="white" />
                          )}
                          <Text className="text-white font-bold text-base">
                            {joiningRoom ? "Joining..." : "Join Battle"}
                          </Text>
                        </View>
                      </ImageBackground>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="px-6 py-4 bg-custom-gray rounded-xl"
                      onPress={handleCancelQuizCode}
                      disabled={operationInProgress}
                    >
                      <Text className="text-custom-purple font-bold">
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Create Room Mode */}
          <View className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <View className="w-full h-2 bg-primary"></View>
            <View className="p-6 flex flex-col items-center gap-5">
              <View className="flex flex-col items-center gap-2">
                <Text className="text-2xl text-custom-purple font-black">
                  🏠 Create Room
                </Text>
                <Text className="text-sm text-center text-custom-purple leading-5">
                  Create your own battle room and invite friends to join! Be the
                  host and control the game.
                </Text>
              </View>

              {!showCreateRoom ? (
                <TouchableOpacity
                  onPress={handleShowCreateRoom}
                  disabled={operationInProgress}
                  className="w-full"
                >
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      opacity: operationInProgress ? 0.7 : 1,
                    }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-4 px-8">
                      <Text className="text-white font-bold text-lg text-center">
                        Create New Room
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ) : (
                <View className="w-full flex flex-col gap-4">
                  <TextInput
                    className="border-2 border-custom-purple rounded-xl px-4 py-4 text-center text-lg text-custom-purple bg-light-orange"
                    placeholder="Enter Room Name (Optional)"
                    placeholderTextColor="#76184F"
                    value={roomName}
                    onChangeText={setRoomName}
                    maxLength={20}
                    returnKeyType="done"
                    onSubmitEditing={handleCreateRoom}
                    blurOnSubmit={true}
                    editable={!operationInProgress}
                  />

                  {!roomCode ? (
                    <View className="flex-row gap-3">
                      <TouchableOpacity
                        className="flex-1"
                        onPress={handleCreateRoom}
                        disabled={creatingRoom || operationInProgress}
                      >
                        <ImageBackground
                          source={require("../../assets/gradient.jpg")}
                          style={{
                            borderRadius: 12,
                            overflow: "hidden",
                            opacity:
                              creatingRoom || operationInProgress ? 0.7 : 1,
                          }}
                          imageStyle={{ borderRadius: 12 }}
                        >
                          <View className="py-4 flex-row justify-center items-center gap-2">
                            {creatingRoom && (
                              <ActivityIndicator size="small" color="white" />
                            )}
                            <Text className="text-white font-bold text-base">
                              {creatingRoom ? "Creating..." : "Generate Room"}
                            </Text>
                          </View>
                        </ImageBackground>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="px-6 py-4 bg-custom-gray rounded-xl"
                        onPress={handleCancelCreateRoom}
                        disabled={operationInProgress}
                      >
                        <Text className="text-custom-purple font-bold">
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className="flex flex-col gap-4">
                      <View className="bg-light-orange rounded-xl p-5 border-2 border-primary">
                        <Text className="text-center text-custom-purple font-bold text-base mb-1">
                          Room Code
                        </Text>
                        <Text className="text-center text-custom-purple font-black text-3xl tracking-wider">
                          {roomCode}
                        </Text>
                        <Text className="text-center text-custom-purple text-sm mt-2 opacity-80">
                          Players: {Object.keys(playersInRoom).length}/
                          {MAX_PLAYERS}
                        </Text>
                      </View>

                      {Object.keys(playersInRoom).length > 1 && (
                        <View className="bg-custom-gray rounded-xl p-4">
                          <Text className="text-center text-custom-purple font-bold text-base mb-3">
                            Players Joined:
                          </Text>
                          {Object.entries(playersInRoom).map(
                            ([playerId, player]) => (
                              <Text
                                key={playerId}
                                className="text-center text-custom-purple text-base py-1"
                              >
                                • {player.name}
                              </Text>
                            )
                          )}
                        </View>
                      )}

                      <View className="flex-row gap-3">
                        <TouchableOpacity
                          className="flex-1 py-4 bg-purple-100 rounded-xl"
                          onPress={() => shareRoomDetails(roomId, roomCode)}
                          disabled={operationInProgress}
                        >
                          <Text className="text-custom-purple font-bold text-center text-base">
                            📱 Share Code
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          className="flex-1"
                          onPress={startBattleRoom}
                          disabled={
                            operationInProgress ||
                            Object.keys(playersInRoom).length < 2
                          }
                        >
                          <ImageBackground
                            source={require("../../assets/gradient.jpg")}
                            style={{
                              borderRadius: 12,
                              overflow: "hidden",
                              opacity:
                                operationInProgress ||
                                Object.keys(playersInRoom).length < 2
                                  ? 0.7
                                  : 1,
                            }}
                            imageStyle={{ borderRadius: 12 }}
                          >
                            <View className="py-4">
                              <Text className="text-white font-bold text-center text-base">
                                🚀 Start Battle
                              </Text>
                            </View>
                          </ImageBackground>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        className="py-3 bg-light-orange border-2 border-red-300 rounded-xl"
                        onPress={cancelRoomCreation}
                        disabled={operationInProgress}
                      >
                        <Text className="text-red-600 font-bold text-center text-base">
                          ❌ Cancel Room
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>

        {battleResults.length > 0 && (
          <>
            <View className="border-t border-gray-200 mx-5 my-8" />
            <View className="px-5 mb-8">
              <BattleScoreBoard players={formattedResults as BattleEntry[]} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
