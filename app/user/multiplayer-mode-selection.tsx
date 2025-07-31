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

  // CRITICAL FIX: Simplified state management
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
  const componentMounted = useRef(true);
  const navigationInProgress = useRef(false);

  // CRITICAL FIX: Initialize component
  useEffect(() => {
    componentMounted.current = true;
    navigationInProgress.current = false;

    return () => {
      componentMounted.current = false;
    };
  }, []);

  // CRITICAL FIX: Reset battle state on component mount
  useEffect(() => {
    const resetBattleState = async () => {
      try {
        await battleManager.resetUserBattleState();
        console.log("Battle state reset on multiplayer mode selection mount");
      } catch (error) {
        console.warn("Error resetting battle state:", error);
      }
    };

    resetBattleState();
  }, []);

  // CRITICAL FIX: Enhanced cleanup
  const performCleanup = useCallback(async () => {
    if (!componentMounted.current) return;

    console.log("Performing enhanced cleanup");

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

      // Complete battle manager cleanup
      await battleManager.resetUserBattleState();
    } catch (error) {
      console.warn("Cleanup error:", error);
    }
  }, [randomMode.searching]);

  // Fixed Random Mode Handler
  const handleRandomMatch = useCallback(async () => {
    if (isLoading || randomMode.searching || navigationInProgress.current)
      return;

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

      if (componentMounted.current && !navigationInProgress.current) {
        navigationInProgress.current = true;
        setRandomMode({ searching: false, countdown: 0 });
        router.replace(`/user/battle-room?roomId=${roomId}&isHost=${isHost}`);
      }
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

    if (quizCodeMode.joining || navigationInProgress.current) return;

    console.log("Attempting to join room with code:", code);
    setQuizCodeMode((prev) => ({ ...prev, joining: true }));

    try {
      const { roomId } = await battleManager.joinRoom(code);
      console.log("Successfully joined room:", roomId);

      if (componentMounted.current && !navigationInProgress.current) {
        navigationInProgress.current = true;
        setQuizCodeMode({ visible: false, code: "", joining: false });
        router.replace(`/user/battle-room?roomId=${roomId}&isHost=false`);
      }
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

  // Create Room Handler
  const handleCreateRoom = useCallback(async () => {
    const { name } = createRoomMode;

    if (!name.trim()) {
      Alert.alert("Room Name Required", "Please enter a room name");
      return;
    }

    if (createRoomMode.creating || navigationInProgress.current) return;

    console.log("Creating room with name:", name);
    setCreateRoomMode((prev) => ({ ...prev, creating: true }));

    try {
      const { roomId, roomCode } = await battleManager.createRoom(name.trim());
      console.log("Room created successfully:", { roomId, roomCode });

      if (componentMounted.current && !navigationInProgress.current) {
        navigationInProgress.current = true;
        setCreateRoomMode({
          visible: false,
          name: "",
          creating: false,
          roomId: "",
          roomCode: "",
          players: {},
        });
        router.replace(`/user/battle-room?roomId=${roomId}&isHost=true`);
      }
    } catch (error) {
      console.error("Create room failed:", error);
      Alert.alert("Failed to Create Room", error.message || "Please try again");
    } finally {
      setCreateRoomMode((prev) => ({ ...prev, creating: false }));
    }
  }, [createRoomMode.name, createRoomMode.creating, router]);

  // Share Room Code
  const handleShareRoom = useCallback(async () => {
    try {
      await Share.share({
        message: `Join my TezMaths battle! Use code: ${createRoomMode.roomCode}`,
        title: "TezMaths Battle Invitation",
      });
    } catch (error) {
      console.error("Share failed:", error);
    }
  }, [createRoomMode.roomCode]);

  // CRITICAL FIX: Proper back handler with cleanup
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (randomMode.searching) {
          handleCancelRandomSearch();
          return true;
        }

        if (quizCodeMode.visible) {
          setQuizCodeMode({ visible: false, code: "", joining: false });
          return true;
        }

        if (createRoomMode.visible) {
          setCreateRoomMode({
            visible: false,
            name: "",
            creating: false,
            roomId: "",
            roomCode: "",
            players: {},
          });
          return true;
        }

        if (!navigationInProgress.current && componentMounted.current) {
          navigationInProgress.current = true;
          performCleanup().then(() => {
            if (componentMounted.current) {
              router.replace("/user/home");
            }
          });
        }
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => {
        backHandler.remove();
      };
    }, [
      randomMode.searching,
      quizCodeMode.visible,
      createRoomMode.visible,
      handleCancelRandomSearch,
      performCleanup,
      router,
    ])
  );

  // Keyboard listeners
  useEffect(() => {
    const keyboardDidShow = (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    };

    const keyboardDidHide = () => {
      setKeyboardHeight(0);
    };

    const showSubscription = Keyboard.addListener(
      "keyboardDidShow",
      keyboardDidShow
    );
    const hideSubscription = Keyboard.addListener(
      "keyboardDidHide",
      keyboardDidHide
    );

    return () => {
      showSubscription?.remove();
      hideSubscription?.remove();
    };
  }, []);

  // CRITICAL FIX: Complete cleanup on unmount
  useEffect(() => {
    return () => {
      componentMounted.current = false;
      navigationInProgress.current = true;

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      if (roomListenerRef.current) {
        roomListenerRef.current();
        roomListenerRef.current = null;
      }

      performCleanup().catch(console.error);
    };
  }, [performCleanup]);

  // Go back to home
  const goBack = useCallback(async () => {
    if (navigationInProgress.current) return;

    navigationInProgress.current = true;
    await performCleanup();

    if (componentMounted.current) {
      router.replace("/user/home");
    }
  }, [performCleanup, router]);

  return (
    <View className="flex-1 bg-white" style={{ paddingBottom: keyboardHeight }}>
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        style={{ overflow: "hidden", marginTop: 20 }}
      >
        <View className="px-4 py-6">
          <View className="flex-row justify-between items-center">
            <TouchableOpacity onPress={goBack}>
              <Image
                source={require("../../assets/icons/quitquiz.png")}
                style={{ width: 24, height: 24 }}
                tintColor="white"
              />
            </TouchableOpacity>
            <Text className="text-white text-2xl font-black">Battle Mode</Text>
            <View style={{ width: 24 }} />
          </View>
        </View>
      </ImageBackground>

      <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-center mb-6 text-gray-800">
          Choose Battle Mode
        </Text>

        {/* Random Match Section */}
        <View className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 mb-4 shadow-lg">
          <View className="flex-row items-center mb-4">
            <Text className="text-white text-xl font-bold ml-3">
              Random Match
            </Text>
          </View>

          <Text className="text-white text-sm mb-4 opacity-90">
            Find a random opponent and battle instantly!
          </Text>

          {randomMode.searching ? (
            <View className="items-center">
              <ActivityIndicator size="large" color="white" />
              <Text className="text-white mt-2 font-semibold">
                Finding opponent... {randomMode.countdown}s
              </Text>
              <TouchableOpacity
                className="mt-3 bg-white/20 px-4 py-2 rounded-lg"
                onPress={handleCancelRandomSearch}
              >
                <Text className="text-white font-bold">Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              className="bg-white py-3 px-6 rounded-xl"
              onPress={handleRandomMatch}
              disabled={isLoading}
            >
              <Text className="text-purple-600 font-bold text-center text-lg">
                {isLoading ? "Starting..." : "Find Match"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quiz Code Section */}
        <View className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-6 mb-4 shadow-lg">
          <View className="flex-row items-center mb-4">
            <Text className="text-white text-xl font-bold ml-3">
              Join with Code
            </Text>
          </View>

          <Text className="text-white text-sm mb-4 opacity-90">
            Enter a quiz code to join a friend's battle
          </Text>

          {quizCodeMode.visible ? (
            <View>
              <TextInput
                className="bg-white p-4 rounded-xl text-lg font-mono text-center mb-3"
                placeholder="Enter Quiz Code"
                value={quizCodeMode.code}
                onChangeText={handleQuizCodeInput}
                autoCapitalize="characters"
                maxLength={8}
                autoFocus
              />
              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 bg-white/20 py-3 px-6 rounded-xl"
                  onPress={() =>
                    setQuizCodeMode({
                      visible: false,
                      code: "",
                      joining: false,
                    })
                  }
                >
                  <Text className="text-white font-bold text-center">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 py-3 px-6 rounded-xl ${
                    quizCodeMode.code.length >= 4 ? "bg-white" : "bg-white/50"
                  }`}
                  onPress={handleJoinQuizCode}
                  disabled={
                    quizCodeMode.code.length < 4 || quizCodeMode.joining
                  }
                >
                  <Text
                    className={`font-bold text-center ${
                      quizCodeMode.code.length >= 4
                        ? "text-blue-600"
                        : "text-gray-400"
                    }`}
                  >
                    {quizCodeMode.joining ? "Joining..." : "Join"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              className="bg-white py-3 px-6 rounded-xl"
              onPress={() =>
                setQuizCodeMode({ ...quizCodeMode, visible: true })
              }
            >
              <Text className="text-blue-600 font-bold text-center text-lg">
                Enter Code
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Create Room Section */}
        <View className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-6 shadow-lg">
          <View className="flex-row items-center mb-4">
          
            <Text className="text-white text-xl font-bold ml-3">
              Create Room
            </Text>
          </View>

          <Text className="text-white text-sm mb-4 opacity-90">
            Create a private room and invite friends
          </Text>

          {createRoomMode.visible ? (
            <View>
              <TextInput
                className="bg-white p-4 rounded-xl text-lg mb-3"
                placeholder="Enter Room Name"
                value={createRoomMode.name}
                onChangeText={(text) =>
                  setCreateRoomMode({ ...createRoomMode, name: text })
                }
                maxLength={30}
                autoFocus
              />
              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 bg-white/20 py-3 px-6 rounded-xl"
                  onPress={() =>
                    setCreateRoomMode({
                      visible: false,
                      name: "",
                      creating: false,
                      roomId: "",
                      roomCode: "",
                      players: {},
                    })
                  }
                >
                  <Text className="text-white font-bold text-center">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 py-3 px-6 rounded-xl ${
                    createRoomMode.name.trim() ? "bg-white" : "bg-white/50"
                  }`}
                  onPress={handleCreateRoom}
                  disabled={
                    !createRoomMode.name.trim() || createRoomMode.creating
                  }
                >
                  <Text
                    className={`font-bold text-center ${
                      createRoomMode.name.trim()
                        ? "text-green-600"
                        : "text-gray-400"
                    }`}
                  >
                    {createRoomMode.creating ? "Creating..." : "Create"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              className="bg-white py-3 px-6 rounded-xl"
              onPress={() =>
                setCreateRoomMode({ ...createRoomMode, visible: true })
              }
            >
              <Text className="text-green-600 font-bold text-center text-lg">
                Create Room
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="h-8" />
      </ScrollView>
    </View>
  );
}
