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
import {get, ref, remove,} from "firebase/database";
import type { BattleEntry } from "../../components/battlescoreBoard";
import BattleScoreBoard from "../../components/battlescoreBoard";
import { fetchLast5BattleResults } from '../../utils/saveBattleResult';
import {auth, database} from '../../firebase/firebaseConfig'





type Player = {
  name: string;
  // add other properties if needed
};

export default function MultiplayerModeSelection() {
  const router = useRouter();

  const [clearingRooms, setClearingRooms] = useState(false);

  const [showQuizCodeInput, setShowQuizCodeInput] = useState(false);
  const [quizCode, setQuizCode] = useState("");
  const [joiningRoom, setJoiningRoom] = useState(false);

  const [last5Scores, setLast5Scores] = useState([]);
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

  

  const MAX_PLAYERS = 4;

  const cleanupRef = useRef(false);
  const roomListenerRef = useRef(null);

  // Complete state reset function
  const resetAllStates = useCallback(() => {
    setShowQuizCodeInput(false);
    setQuizCode("");
    setJoiningRoom(false);
    setShowCreateRoom(false);
    setRoomCode("");
    setRoomName("");
    setRoomId("");
    setCreatingRoom(false);
    setPlayersInRoom({});
    setSearchingRandom(false);
    setClearingRooms(false);
  }, []);


  // Your state setup


// Helper
const resetRoomStates = () => {
  setQuizCode("");
  setRoomName("");
  setRoomCode("");
  setRoomId("");
  setPlayersInRoom({});
};




  // Enhanced cleanup function
  const performCleanup = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;

    try {
      // Remove room listener
      if (roomListenerRef.current) {
        roomListenerRef.current();
        roomListenerRef.current = null;
      }

      // Leave room if in one
      if (roomId) {
        await battleManager.leaveRoom(roomId);
      }

      // Cancel matchmaking
      await battleManager.cancelMatchmaking();
    } catch (error) {
      console.error("Cleanup error:", error);
    }

    // Reset cleanup flag for next use
    cleanupRef.current = false;
  }, [roomId]);

  // MAIN RESET EFFECT - This runs every time screen comes into focus
  // useFocusEffect(
  //   useCallback(() => {
  //     console.log("MultiplayerModeSelection screen focused - resetting states");

  //     // Reset all states immediately when screen comes into focus
  //     resetAllStates();

  //     // Perform cleanup of any ongoing operations
  //     const cleanup = async () => {
  //       try {
  //         // Cancel any ongoing matchmaking
  //         await battleManager.cancelMatchmaking();

  //         // If there's any room listener, remove it
  //         if (roomListenerRef.current) {
  //           roomListenerRef.current();
  //           roomListenerRef.current = null;
  //         }
  //       } catch (error) {
  //         console.error("Initial cleanup error:", error);
  //       }
  //     };

  //     cleanup();

  //     // Dismiss keyboard if open
  //     Keyboard.dismiss();

  //     // Return cleanup function for when screen loses focus
  //     return () => {
  //       console.log("MultiplayerModeSelection screen unfocused - cleaning up");
  //       performCleanup();
  //     };
  //   }, [resetAllStates, performCleanup])
  // );

  // Handle hardware back button
  useEffect(() => {
    const backAction = () => {
      router.push("/user/home");
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      performCleanup();
    };
  }, [performCleanup]);

  // Keyboard listeners
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardHideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShowListener?.remove();
      keyboardHideListener?.remove();
    };
  }, []);

  // Room listener cleanup
  useEffect(() => {
    return () => {
      if (roomId) {
        battleManager.removeRoomListener(roomId);
        if (!roomId) return;
      }
    };
  }, [roomId]);

  // For Quiz Code section
  const handleShowQuizCodeInput = () => {
    setShowQuizCodeInput(true);
    setShowCreateRoom(false); // Close create room section
    // Reset create room states
    setRoomCode("");
    setRoomName("");
    setRoomId("");
    setPlayersInRoom({});
    setCreatingRoom(false);
    // Reset random search
    setSearchingRandom(false);
  };

  // For Create Room section
  const handleShowCreateRoom = () => {
    setShowCreateRoom(true);
    setShowQuizCodeInput(false); // Close quiz code section
    // Reset quiz code states
    setQuizCode("");
    setJoiningRoom(false);
    // Reset random search
    setSearchingRandom(false);
  };

  const handleJoinQuizCode = async () => {
    if (quizCode.length < 4) {
      Alert.alert("Invalid Code", "Please enter a valid quiz code");
      return;
    }

    setJoiningRoom(true);

    try {
      const { roomId: foundRoomId } = await battleManager.joinRoom(quizCode);
      setJoiningRoom(false);
      router.push(`/user/battle-room?roomId=${foundRoomId}&isHost=false`);
    } catch (error) {
      Alert.alert("Error", error.message);
      setJoiningRoom(false);
    }
  };

  const shareRoomDetails = async (roomId: string, roomCode: string) => {
    try {
      const message = `🎮 Join my TezMaths Battle Room!\n\n🆔 Room ID: ${roomId}\n🔑 Room Code: ${roomCode}\n\nOpen the app and enter the code to join. Let's battle it out! 🚀`;

      await Share.share({ message });
    } catch (error) {
      console.error("Failed to share room details:", error);
      Alert.alert("Error", "Could not share room details.");
    }
  };

const handleCreateRoom = async () => {
  // Step 1: Cleanup old room if any
  if (roomListenerRef.current) {
    roomListenerRef.current(); // unsubscribe previous listener
    roomListenerRef.current = null;
  }

  if (roomId) {
    try {
      await battleManager.leaveRoom(roomId); // leave the previous room
    } catch (err) {
      console.warn("Failed to leave previous room:", err);
    }
    setRoomId(null);
    setRoomCode(null);
    setPlayersInRoom({});
  }

  setCreatingRoom(true);

  try {
    // Step 2: Create new room
    const { roomId: newRoomId, roomCode: newRoomCode } =
      await battleManager.createRoom(roomName.trim(), MAX_PLAYERS);

    setRoomCode(newRoomCode);
    setRoomId(newRoomId);

    // Mark host as ready
    await battleManager.toggleReady(newRoomId);

    const user = auth.currentUser;
    const userId = user?.uid;

    // Step 3: Set listener for room updates
    roomListenerRef.current = await battleManager.listenToRoom(
      newRoomId,
      (roomData) => {
        if (!roomData) return;

        setPlayersInRoom(roomData.players || {});

        if (
          roomData.status === "playing" &&
          roomData.players?.[userId]
        ) {
          const isHost = roomData.hostId === userId;

          router.replace({
            pathname: "/user/battle-screen",
            params: {
              roomId: newRoomId,
              isHost: isHost ? "true" : undefined,
            },
          });
        }
      }
    );

    // Optional: Share room code
    await shareRoomDetails(newRoomId, newRoomCode);
  } catch (error) {
    Alert.alert("Error", error.message || "Failed to create room");
  } finally {
    setCreatingRoom(false);
  }
};



  const startBattleRoom = async () => {
    
    if (Object.keys(playersInRoom).length < 2) {
      // Alert.alert("Need More Players", "Wait for at least 2 players to join");
      return;
    }

    try {
      await battleManager.startBattle(roomId);
      router.push(`/user/battle-screen?roomId=${roomId}&isHost=true`);
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to start battle");
    }
  };

const cancelRoomCreation = useCallback(async () => {
  try {
    if (roomId) {
      const user = auth.currentUser;
      const userId = user?.uid;

      // Check if the current user is the host, then delete the room
      const roomRef = ref(database, `rooms/${roomId}`);
      const snapshot = await get(roomRef);

      if (snapshot.exists()) {
        const roomData = snapshot.val();
        if (roomData.hostId === userId) {
          await remove(roomRef); // delete the entire room from Firebase
          console.log("Room deleted by host");
        } else {
          // Not host, just leave
          await battleManager.leaveRoom(roomId);
        }
      }
    }

    // Remove listener
    if (roomListenerRef.current) {
      roomListenerRef.current();
      roomListenerRef.current = null;
    }

    // Reset all create room states
    setShowCreateRoom(false);
    setRoomName("");
    setRoomCode("");
    setRoomId("");
    setPlayersInRoom({});
    setCreatingRoom(false);
  } catch (error) {
    console.error("Cancel room error:", error);

    // Reset states anyway
    setShowCreateRoom(false);
    setRoomName("");
    setRoomCode("");
    setRoomId("");
    setPlayersInRoom({});
    setCreatingRoom(false);
  }
}, [roomId]);


  const handleRandomMatch = async () => {
    setSearchingRandom(true);
    try {
      const { roomId, isHost } = await battleManager.findRandomMatch();

      // Optional: wait briefly to ensure Firebase sets everything up
      await new Promise((res) => setTimeout(res, 500));

      router.push(
        `/user/battle-room?roomId=${roomId}&isHost=${isHost ? "true" : "false"}`
      );
    } catch (error) {
      console.error("Random match error:", error);
      setSearchingRandom(false);
      Alert.alert("Matchmaking Failed", error.message || "Room not found");
    }
  };


  const cancelRandomSearch = useCallback(async () => {
    setSearchingRandom(false);
    try {
      await battleManager.cancelMatchmaking();
    } catch (error) {
      console.error("Cancel matchmaking error:", error);
    }

    // Reset any room states
    if (roomId) {
      try {
        await battleManager.leaveRoom(roomId);
      } catch (error) {
        console.error("Leave room error:", error);
      }
      setRoomId("");
    }
  }, [roomId]);

  useEffect(() => {
    const fetchResults = async () => {
      if (roomId) {
        const results = await fetchLast5BattleResults(roomId);
        setBattleResults(results);
      }
    };
    fetchResults();
  }, [roomId]);

  const formattedResults = battleResults.map((entry) => ({
    ...entry,
    name: playersInRoom[entry.userId]?.name || "Player",
    opponentScore: entry.opponentScore || 0, // You must save this during battle
  }));


  // Enhanced cancel functions for UI buttons
  const handleCancelQuizCode = () => {
    setShowQuizCodeInput(false);
    setQuizCode("");
    setJoiningRoom(false);
    Keyboard.dismiss();
  };

  const handleCancelCreateRoom = () => {
    setShowCreateRoom(false);
    setRoomName("");
    setCreatingRoom(false);
    Keyboard.dismiss();
  };

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
              style={{ width: 28, height: 28 }}
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
          paddingBottom: keyboardHeight > 0 ? keyboardHeight - 30 : 30,
        }}
        showsVerticalScrollIndicator={false}
      >
        

 

        <View className="px-4 py-4">
          <View className="flex-col justify-center items-center">
            <Text className="text-custom-purple text-2xl mt-4 font-black">
              Choose Your Battle Mode!
            </Text>
            <Text className="text-custom-purple text-center text-base mt-2 italic">
              (Try properly closing and reopening the app if you face any issue
              while any battle mode.)
            </Text>
          </View>
        </View>

        <View className="px-4 py-6 flex flex-col gap-4">
          <View className="border border-black rounded-2xl overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="w-full p-4 flex flex-col items-center gap-4">
              <View className="flex flex-col items-center gap-1">
                <Text className="text-2xl text-custom-purple font-black">
                  Random Player
                </Text>
                <Text className="text-sm text-center text-custom-purple">
                  Get matched with a random opponent for an exciting battle!
                </Text>
              </View>

              {!searchingRandom ? (
                <TouchableOpacity onPress={handleRandomMatch}>
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{ borderRadius: 8, overflow: "hidden" }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-3">
                      <Text className="text-white font-bold text-xl w-56 text-center">
                        Find Random Battle
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ) : (
                <View className="flex flex-col items-center gap-3">
                  <ActivityIndicator size="large" color="#76184F" />
                  <Text className="text-black font-bold">
                    Searching for opponent...
                  </Text>
                  <TouchableOpacity
                    className="px-4 py-2 bg-gray-200 rounded-lg"
                    onPress={cancelRandomSearch}
                  >
                    <Text className="text-custom-purple font-bold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View className="border border-black rounded-2xl overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="w-full p-4 flex flex-col items-center gap-4">
              <View className="flex flex-col items-center gap-1">
                <Text className="text-2xl text-custom-purple font-black">
                  Quiz Code
                </Text>
                <Text className="text-sm text-center text-custom-purple">
                  Join a specific battle using a quiz code from your friend!
                </Text>
              </View>

              {!showQuizCodeInput ? (
                <TouchableOpacity onPress={handleShowQuizCodeInput}>
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{ borderRadius: 8, overflow: "hidden" }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-3">
                      <Text className="text-white font-bold text-xl w-56 text-center">
                        Enter Quiz Code
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ) : (
                <View className="w-full flex flex-col gap-3">
                  <TextInput
                    className="border-2 border-custom-purple rounded-lg px-4 py-3 text-center text-lg font-bold text-black"
                    placeholder="Enter Quiz Code"
                    placeholderTextColor="black"
                    value={quizCode}
                    onChangeText={setQuizCode}
                    maxLength={8}
                    autoCapitalize="characters"
                    autoFocus={true}
                    returnKeyType="done"
                    onSubmitEditing={handleJoinQuizCode}
                    blurOnSubmit={true}
                  />
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      className="flex-1"
                      onPress={handleJoinQuizCode}
                      disabled={joiningRoom}
                    >
                      <ImageBackground
                        source={require("../../assets/gradient.jpg")}
                        style={{
                          borderRadius: 8,
                          overflow: "hidden",
                          opacity: joiningRoom ? 0.7 : 1,
                        }}
                        imageStyle={{ borderRadius: 12 }}
                      >
                        <View className="py-3 flex-row justify-center items-center gap-2">
                          {joiningRoom && (
                            <ActivityIndicator size="small" color="white" />
                          )}
                          <Text className="text-white font-bold text-lg">
                            {joiningRoom ? "Joining..." : "Join Battle"}
                          </Text>
                        </View>
                      </ImageBackground>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="px-4 py-3 bg-gray-200 rounded-lg"
                      onPress={handleCancelQuizCode}
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

          <View className="border border-black rounded-2xl overflow-hidden">
            <View className="w-full h-8 bg-primary"></View>
            <View className="w-full p-4 flex flex-col items-center gap-4">
              <View className="flex flex-col items-center gap-1">
                <Text className="text-2xl text-custom-purple font-black">
                  Create Room
                </Text>
                <Text className="text-sm text-center text-custom-purple">
                  Create your own battle room and invite friends to join!
                </Text>
              </View>
              


            



              {!showCreateRoom ? (
                <TouchableOpacity onPress={handleShowCreateRoom}>
                  <ImageBackground
                    source={require("../../assets/gradient.jpg")}
                    style={{ borderRadius: 8, overflow: "hidden" }}
                    imageStyle={{ borderRadius: 12 }}
                  >
                    <View className="py-3">
                      <Text className="text-white font-bold text-xl w-56 text-center">
                        Create New Room
                      </Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>

                

              ) : (
              <View className="w-full flex flex-col gap-3">
                <TextInput
                  className="border-2 border-custom-purple rounded-lg px-4 py-3 text-center text-lg text-black"
                  placeholder="Enter Room Name"
                  placeholderTextColor="black"
                  value={roomName}
                  onChangeText={setRoomName}
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={handleCreateRoom}
                  blurOnSubmit={true}
                />

                {!roomCode ? (
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      className="flex-1"
                      onPress={handleCreateRoom}
                      disabled={creatingRoom}
                    >
                      <ImageBackground
                        source={require("../../assets/gradient.jpg")}
                        style={{
                          borderRadius: 8,
                          overflow: "hidden",
                          opacity: creatingRoom ? 0.7 : 1,
                        }}
                        imageStyle={{ borderRadius: 12 }}
                      >
                        <View className="py-3 flex-row justify-center items-center gap-2">
                          {creatingRoom && (
                            <ActivityIndicator size="small" color="white" />
                          )}
                          <Text className="text-white font-bold text-lg">
                            {creatingRoom ? "Creating..." : "Generate Code"}
                          </Text>
                        </View>
                      </ImageBackground>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="px-4 py-3 bg-gray-200 rounded-lg"
                      onPress={handleCancelCreateRoom}
                    >
                      <Text className="text-custom-purple font-bold">Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="flex flex-col gap-3">
                    <View className="bg-light-orange rounded-lg p-4">
                      <Text className="text-center text-black font-bold text-sm">
                        Room Code
                      </Text>
                      <Text className="text-center text-black font-black text-2xl">
                        {roomCode}
                      </Text>
                      <Text className="text-center text-black text-xs mt-2">
                        Players: {Object.keys(playersInRoom).length}/{MAX_PLAYERS}
                      </Text>
                    </View>

                    {Object.keys(playersInRoom).length > 1 && (
                      <View className="bg-custom-gray rounded-lg p-3">
                        <Text className="text-center text-custom-purple font-bold text-sm mb-2">
                          Players Joined:
                        </Text>
                        {Object.entries(playersInRoom).map(([playerId, player]) => (
                          <Text
                            key={playerId}
                            className="text-center text-custom-purple text-sm"
                          >
                            • {player.name}
                          </Text>
                        ))}
                      </View>
                    )}

                    <View className="flex-row gap-2">
                      <TouchableOpacity className="flex-1" onPress={() => shareRoomDetails(roomId, roomCode)}>
                        <View className="py-3 bg-purple-200 rounded-lg">
                          <Text className="text-custom-purple font-bold text-center">Share</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity className="flex-1" onPress={startBattleRoom}>
                        <ImageBackground
                          source={require("../../assets/gradient.jpg")}
                          style={{ borderRadius: 8, overflow: "hidden" }}
                          imageStyle={{ borderRadius: 12 }}
                        >
                          <View className="py-3">
                            <Text className="text-white font-bold text-center">
                              Start Battle
                            </Text>
                          </View>
                        </ImageBackground>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      className="py-2 bg-light-orange rounded-lg"
                      onPress={cancelRoomCreation}
                    >
                      <Text className="text-red-600 font-bold text-center">Cancel Room</Text>
                    </TouchableOpacity>
                  </View>
                )}

              </View>
              )}

            </View>
          </View>
        </View>
                


      </ScrollView>

      <View className="border-t border-gray-300 my-6" />
       {battleResults.length > 0 && (
  <View className="mt-6 mb-12 px-4">
    <BattleScoreBoard players={formattedResults as BattleEntry[]} />
  </View>
)}
      

    </View>
    
    
    


  );}
  