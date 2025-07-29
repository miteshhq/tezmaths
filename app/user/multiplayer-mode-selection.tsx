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
import { auth } from "../../firebase/firebaseConfig";

export default function MultiplayerModeSelection() {
  const router = useRouter();

  // Simplified state management - removed complex gameState
  const [randomMode, setRandomMode] = useState({
    searching: false,
    countdown: 0,
  });

  const [quizCodeMode, setQuizCodeMode] = useState({
    visible: false,
    code: "",
    joining: false,
  });

  const [createRoomMode, setCreateRoomMode] = useState({
    visible: false,
    name: "",
    creating: false,
    roomId: "",
    roomCode: "",
    players: {},
  });

  const [isLoading, setIsLoading] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Single listener ref
  const roomListenerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // Replace the useEffect for battle state reset
  useEffect(() => {
    const resetBattleState = async () => {
      try {
        // Add auth check first
        if (!auth.currentUser?.uid) {
          console.log("No authenticated user, skipping battle state reset");
          return;
        }

        // Add loading state to prevent navigation during reset
        setIsLoading(true);

        // Make reset with shorter timeout
        const resetPromise = battleManager.resetUserBattleState();
        const timeoutPromise = new Promise(
          (_, reject) =>
            setTimeout(() => reject(new Error("Reset timeout")), 2000) // Reduced timeout
        );

        await Promise.race([resetPromise, timeoutPromise]);
        console.log("Battle state reset completed safely");
      } catch (error) {
        // Don't crash the app - just log the error
        console.warn(
          "Battle state reset failed (non-critical):",
          error.message
        );
      } finally {
        // Always clear loading state
        setIsLoading(false);
      }
    };

    // Add loading state check before reset
    if (auth.currentUser?.uid) {
      resetBattleState();
    }
  }, []);

  // Add safety check for all navigation functions
  const handleRandomMatch = useCallback(async () => {
    if (isLoading || randomMode.searching) return;

    // Add auth check before proceeding
    if (!auth.currentUser?.uid) {
      Alert.alert("Authentication Error", "Please sign in to play battles");
      return;
    }

    console.log("Starting random match search");
    setIsLoading(true);
    setRandomMode({ searching: true, countdown: 30 });

    // Add error boundary
    try {
      await battleManager.resetUserBattleState();

      // Rest of the existing code...
      const { roomId, isHost } = await battleManager.findRandomMatch(2);

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      console.log(`Random match found - Room: ${roomId}, Host: ${isHost}`);

      setRandomMode({ searching: false, countdown: 0 });
      router.replace(`/user/battle-room?roomId=${roomId}&isHost=${isHost}`);
    } catch (error) {
      // Enhanced error handling
      console.error("Random match failed:", error);
      setRandomMode({ searching: false, countdown: 0 });

      let errorMessage = "Failed to find a match. Please try again.";
      if (error.message.includes("auth")) {
        errorMessage = "Authentication error. Please sign in again.";
      } else if (error.message.includes("timeout")) {
        errorMessage =
          "Connection timeout. Please check your internet and try again.";
      }

      Alert.alert("Matchmaking Failed", errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, randomMode.searching, router]);

  // Simple cleanup - only what's necessary
  const performCleanup = useCallback(async () => {
    console.log("Performing simple cleanup");

    try {
      // Clear countdown
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      // Remove room listener
      if (roomListenerRef.current) {
        roomListenerRef.current();
        roomListenerRef.current = null;
      }

      // Cancel matchmaking if in random mode
      if (randomMode.searching) {
        await battleManager.cancelMatchmaking();
      }
    } catch (error) {
      console.warn("Cleanup error:", error);
    }
  }, [randomMode.searching]);

  // Fixed Random Mode Handler - MUCH SIMPLER
  const handleRandomMatch = useCallback(async () => {
    if (isLoading || randomMode.searching) return;

    console.log("Starting random match search");
    setIsLoading(true);
    setRandomMode({ searching: true, countdown: 30 });

    await battleManager.resetUserBattleState();

    // Countdown timer
    countdownIntervalRef.current = setInterval(() => {
      setRandomMode((prev) => {
        if (prev.countdown <= 1) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          handleCancelRandomSearch();
          return { ...prev, countdown: 0, searching: false };
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);

    try {
      const { roomId, isHost } = await battleManager.findRandomMatch(2);

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      console.log(`Random match found - Room: ${roomId}, Host: ${isHost}`);

      // Clean navigation
      setRandomMode({ searching: false, countdown: 0 });
      router.replace(`/user/battle-room?roomId=${roomId}&isHost=${isHost}`);
    } catch (error) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      console.error("Random match failed:", error);
      setRandomMode({ searching: false, countdown: 0 });

      Alert.alert(
        "Matchmaking Failed",
        error.message || "Failed to find a match. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, randomMode.searching, router]);

  // Cancel Random Search
  const handleCancelRandomSearch = useCallback(async () => {
    console.log("Cancelling random search");

    await battleManager.resetUserBattleState();

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    try {
      await battleManager.cancelMatchmaking();
    } catch (error) {
      console.warn("Cancel matchmaking error:", error);
    }

    setRandomMode({ searching: false, countdown: 0 });
    setIsLoading(false);
  }, []);

  // Quiz Code Input Handler
  const handleQuizCodeInput = useCallback((text) => {
    const cleanCode = text
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    setQuizCodeMode((prev) => ({ ...prev, code: cleanCode }));
  }, []);

  // Join Quiz Code
  const handleJoinQuizCode = useCallback(async () => {
    const { code } = quizCodeMode;

    if (code.length < 4) {
      Alert.alert(
        "Invalid Code",
        "Please enter a valid quiz code (minimum 4 characters)"
      );
      return;
    }

    if (quizCodeMode.joining) return;

    console.log("Attempting to join room with code:", code);
    setQuizCodeMode((prev) => ({ ...prev, joining: true }));

    try {
      const { roomId } = await battleManager.joinRoom(code);
      console.log("Successfully joined room:", roomId);

      setQuizCodeMode({ visible: false, code: "", joining: false });
      router.replace(`/user/battle-room?roomId=${roomId}&isHost=false`);
    } catch (error) {
      console.error("Join room failed:", error);

      let errorMessage = "Failed to join room";
      if (error.message.includes("not found")) {
        errorMessage = "Room code not found or expired";
      } else if (error.message.includes("full")) {
        errorMessage = "Room is full";
      } else if (error.message.includes("playing")) {
        errorMessage = "Game already in progress";
      }

      Alert.alert("Cannot Join Room", errorMessage);
    } finally {
      setQuizCodeMode((prev) => ({ ...prev, joining: false }));
    }
  }, [quizCodeMode.code, quizCodeMode.joining, router]);

  // Create Room Handler - SIMPLIFIED
  const handleCreateRoom = useCallback(async () => {
    if (createRoomMode.creating) return;

    console.log("Creating new room");

    const user = auth.currentUser;
    if (!user?.uid) {
      Alert.alert("Authentication Error", "Please sign in to create a room");
      return;
    }

    setCreateRoomMode((prev) => ({ ...prev, creating: true }));

    try {
      const roomName = createRoomMode.name.trim() || "Battle Room";
      const roomData = await battleManager.createRoom(roomName, 4);

      if (!roomData?.roomId || !roomData?.roomCode) {
        throw new Error("Invalid room data received");
      }

      console.log("Room created:", roomData);

      setCreateRoomMode((prev) => ({
        ...prev,
        roomId: roomData.roomId,
        roomCode: roomData.roomCode,
        creating: false,
      }));

      // Set up room listener
      const unsubscribe = battleManager.addRoomListener(
        roomData.roomId,
        (updatedRoomData) => {
          if (!updatedRoomData) {
            console.warn("Room deleted, resetting states");
            setCreateRoomMode((prev) => ({
              ...prev,
              roomId: "",
              roomCode: "",
              players: {},
            }));
            return;
          }

          console.log(
            "Room updated:",
            updatedRoomData.players
              ? Object.keys(updatedRoomData.players).length
              : 0,
            "players"
          );

          if (updatedRoomData.players) {
            setCreateRoomMode((prev) => ({
              ...prev,
              players: updatedRoomData.players,
            }));
          }

          // Navigate when battle starts
          if (updatedRoomData.status === "playing") {
            console.log("Battle starting, navigating to battle screen");
            if (roomListenerRef.current) {
              roomListenerRef.current();
              roomListenerRef.current = null;
            }
            router.replace({
              pathname: "/user/battle-screen",
              params: {
                roomId: roomData.roomId,
                isHost: "true",
              },
            });
          }
        }
      );

      roomListenerRef.current = unsubscribe;
    } catch (error) {
      console.error("Create room failed:", error);

      setCreateRoomMode((prev) => ({
        ...prev,
        creating: false,
        roomId: "",
        roomCode: "",
        players: {},
      }));

      let errorMessage = "Failed to create room. Please try again.";
      if (error.message.includes("auth")) {
        errorMessage = "Authentication error. Please sign in again.";
      }

      Alert.alert("Room Creation Failed", errorMessage);
    }
  }, [createRoomMode.creating, createRoomMode.name, router]);

  // Start Battle
  const handleStartBattle = useCallback(async () => {
    const playerCount = Object.keys(createRoomMode.players).length;

    if (playerCount < 2) {
      Alert.alert("Need More Players", "Wait for at least 2 players to join");
      return;
    }

    console.log("Starting battle for room:", createRoomMode.roomId);

    try {
      await battleManager.startBattle(createRoomMode.roomId);
      console.log("Battle start request sent");
    } catch (error) {
      console.error("Start battle failed:", error);
      Alert.alert("Start Battle Failed", error.message || "Please try again");
    }
  }, [createRoomMode.players, createRoomMode.roomId]);

  // Share Room
  const handleShareRoom = useCallback(async () => {
    try {
      const message = `🎮 Join my TezMaths Battle Room!\n\n🔑 Room Code: ${createRoomMode.roomCode}\n\nOpen the app and enter the code to join. Let's battle it out! 🚀`;
      await Share.share({ message });
    } catch (error) {
      console.error("Share failed:", error);
      Alert.alert("Share Failed", "Could not share room details.");
    }
  }, [createRoomMode.roomCode]);

  // Mode switchers - SIMPLE
  const showQuizCodeMode = () => {
    setQuizCodeMode((prev) => ({ ...prev, visible: true }));
  };

  const showCreateRoomMode = () => {
    setCreateRoomMode((prev) => ({ ...prev, visible: true }));
  };

  const cancelMode = () => {
    setQuizCodeMode({ visible: false, code: "", joining: false });
    setCreateRoomMode({
      visible: false,
      name: "",
      creating: false,
      roomId: "",
      roomCode: "",
      players: {},
    });
    if (roomListenerRef.current) {
      roomListenerRef.current();
      roomListenerRef.current = null;
    }
    Keyboard.dismiss();
  };

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      console.log("Component unmounting - performing cleanup");
      performCleanup();
    };
  }, [performCleanup]);

  // Back handler
  useEffect(() => {
    const backAction = () => {
      performCleanup().then(() => {
        router.replace("/user/home");
      });
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );
    return () => backHandler.remove();
  }, [performCleanup, router]);

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

  return (
    <View className="flex-1 bg-white">
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-4">
          <View className="flex-row justify-center items-center gap-2">
            <Image
              source={require("../../assets/icons/swords.png")}
              style={{ width: 24, height: 24 }}
              tintColor="#FF6B35"
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
          <View className="flex-col justify-center items-center mb-0">
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
          <View className="bg-white rounded-2xl border border-black overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="p-6 py-4 flex flex-col items-center gap-5">
              <View className="flex flex-col items-center gap-2">
                <Text className="text-2xl text-custom-purple font-black">
                  Random Player
                </Text>
                <Text className="text-sm text-center text-custom-purple leading-5">
                  Get matched with a random opponent for an exciting battle!
                  Quick and competitive.
                </Text>
              </View>

              {!randomMode.searching ? (
                <TouchableOpacity
                  onPress={handleRandomMatch}
                  disabled={isLoading}
                  className="w-full"
                >
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      opacity: isLoading ? 0.7 : 1,
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
                  {randomMode.countdown > 0 && (
                    <Text className="text-gray-600 text-sm">
                      Time remaining: {randomMode.countdown}s
                    </Text>
                  )}
                  <TouchableOpacity
                    className="px-6 py-3 bg-custom-gray rounded-lg"
                    onPress={handleCancelRandomSearch}
                    disabled={isLoading}
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
          <View className="bg-white rounded-2xl border border-black overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="p-6 py-4 flex flex-col items-center gap-5">
              <View className="flex flex-col items-center gap-2">
                <Text className="text-2xl text-custom-purple font-black">
                  Quiz Code
                </Text>
                <Text className="text-sm text-center text-custom-purple leading-5">
                  Join a specific battle using a quiz code from your friend!
                  Perfect for private matches.
                </Text>
              </View>

              {!quizCodeMode.visible ? (
                <TouchableOpacity
                  onPress={showQuizCodeMode}
                  disabled={isLoading}
                  className="w-full"
                >
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      opacity: isLoading ? 0.7 : 1,
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
                    className="border-2 border-custom-purple rounded-xl px-4 py-4 text-center text-lg font-bold text-black bg-light-orange"
                    placeholder="Enter Quiz Code"
                    placeholderTextColor="#000"
                    value={quizCodeMode.code}
                    onChangeText={handleQuizCodeInput}
                    maxLength={8}
                    autoCapitalize="characters"
                    autoFocus={true}
                    returnKeyType="done"
                    onSubmitEditing={handleJoinQuizCode}
                    blurOnSubmit={true}
                    editable={!quizCodeMode.joining}
                  />
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      className="flex-1"
                      onPress={handleJoinQuizCode}
                      disabled={quizCodeMode.joining}
                    >
                      <ImageBackground
                        source={require("../../assets/gradient.jpg")}
                        style={{
                          borderRadius: 12,
                          overflow: "hidden",
                          opacity: quizCodeMode.joining ? 0.7 : 1,
                        }}
                        imageStyle={{ borderRadius: 12 }}
                      >
                        <View className="py-4 flex-row justify-center items-center gap-2">
                          {quizCodeMode.joining && (
                            <ActivityIndicator size="small" color="white" />
                          )}
                          <Text className="text-white font-bold text-base">
                            {quizCodeMode.joining
                              ? "Joining..."
                              : "Join Battle"}
                          </Text>
                        </View>
                      </ImageBackground>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="px-6 py-4 bg-custom-gray rounded-xl"
                      onPress={cancelMode}
                      disabled={quizCodeMode.joining}
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
          <View className="bg-white rounded-2xl border border-black overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="p-6 py-4 flex flex-col items-center gap-5">
              <View className="flex flex-col items-center gap-2">
                <Text className="text-2xl text-custom-purple font-black">
                  🏠 Create Room
                </Text>
                <Text className="text-sm text-center text-custom-purple leading-5">
                  Create your own battle room and invite friends to join! Be the
                  host and control the game.
                </Text>
              </View>

              {!createRoomMode.visible ? (
                <TouchableOpacity
                  onPress={showCreateRoomMode}
                  disabled={isLoading}
                  className="w-full"
                >
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      opacity: isLoading ? 0.7 : 1,
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
                    className="border-2 border-custom-purple rounded-xl px-4 py-4 text-center text-lg text-black bg-light-orange"
                    placeholder="Enter Room Name (Optional)"
                    placeholderTextColor="#000"
                    value={createRoomMode.name}
                    onChangeText={(text) =>
                      setCreateRoomMode((prev) => ({ ...prev, name: text }))
                    }
                    maxLength={20}
                    returnKeyType="done"
                    onSubmitEditing={handleCreateRoom}
                    blurOnSubmit={true}
                    editable={!createRoomMode.creating}
                  />

                  {!createRoomMode.roomCode ? (
                    <View className="flex-row gap-3">
                      <TouchableOpacity
                        className="flex-1"
                        onPress={handleCreateRoom}
                        disabled={createRoomMode.creating}
                      >
                        <ImageBackground
                          source={require("../../assets/gradient.jpg")}
                          style={{
                            borderRadius: 12,
                            overflow: "hidden",
                            opacity: createRoomMode.creating ? 0.7 : 1,
                          }}
                          imageStyle={{ borderRadius: 12 }}
                        >
                          <View className="py-4 flex-row justify-center items-center gap-2">
                            {createRoomMode.creating && (
                              <ActivityIndicator size="small" color="white" />
                            )}
                            <Text className="text-white font-bold text-base">
                              {createRoomMode.creating
                                ? "Creating..."
                                : "Generate Room"}
                            </Text>
                          </View>
                        </ImageBackground>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="px-6 py-4 bg-custom-gray rounded-xl"
                        onPress={cancelMode}
                        disabled={createRoomMode.creating}
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
                          {createRoomMode.roomCode}
                        </Text>
                        <Text className="text-center text-custom-purple text-sm mt-2 opacity-80">
                          Players: {Object.keys(createRoomMode.players).length}
                          /4
                        </Text>
                      </View>

                      {Object.keys(createRoomMode.players).length > 1 && (
                        <View className="bg-custom-gray rounded-xl p-4">
                          <Text className="text-center text-custom-purple font-bold text-base mb-3">
                            Players Joined:
                          </Text>
                          {Object.entries(createRoomMode.players).map(
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
                          onPress={handleShareRoom}
                          disabled={isLoading}
                        >
                          <Text className="text-custom-purple font-bold text-center text-base">
                            📱 Share Code
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          className="flex-1"
                          onPress={handleStartBattle}
                          disabled={
                            isLoading ||
                            Object.keys(createRoomMode.players).length < 2
                          }
                        >
                          <ImageBackground
                            source={require("../../assets/gradient.jpg")}
                            style={{
                              borderRadius: 12,
                              overflow: "hidden",
                              opacity:
                                isLoading ||
                                Object.keys(createRoomMode.players).length < 2
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
                        onPress={cancelMode}
                        disabled={isLoading}
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
      </ScrollView>
    </View>
  );
}
