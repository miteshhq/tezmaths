import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  ActivityIndicator,
  BackHandler,
  Alert,
  TextInput,
  Modal,
  ImageBackground,
  Animated,
  AppState,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { auth, database } from "../../firebase/firebaseConfig";
import { ref, get } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import SoundManager from "./components/souund/soundManager";
import { RefreshControl } from "react-native";

export default function HomeScreen() {
  const LEVEL_STORAGE_KEY = "highestLevelReached";
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [userPoints, setUserPoints] = useState(0);
  const [fullName, setFullName] = useState("Unavailable");
  const [referrals, setReferrals] = useState(0);
  const [availableLevels, setAvailableLevels] = useState([]);
  const [highestCompletedLevelCompleted, setHighestCompletedLevelComplete] =
    useState(0);
  const [finishedQuizzes, setFinishedQuizzes] = useState([]);
  const [quizCode, setQuizCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [userStreak, setUserStreak] = useState(0);

  useEffect(() => {
    console.log("availableLevels------>42", availableLevels);
  });

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert("Exit App", "Are you sure you want to exit?", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes", onPress: () => BackHandler.exitApp() },
        ]);
        return true;
      };
      BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () =>
        BackHandler.removeEventListener("hardwareBackPress", onBackPress);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  const loadUserData = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      if (userId) {
        const cachedData = await AsyncStorage.getItem("userData");
        let data;

        if (cachedData) {
          data = JSON.parse(cachedData);
          console.log("CACHED DATA DATA:::::::::::::");
          console.log(data);
          setUserName(data.fullname || "User");
          setFullName(data.fullName || "Unavailable");
          setReferrals(data.referrals || 0);
          setUserPoints(data.totalPoints || 0);
          setUserStreak(data.streak || 0);
        }

        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          data = snapshot.val();
          const formattedData = {
            username: data.username || "User",
            fullName: data.fullName || "Unavailable",
            referrals: data.referrals || 0,
            totalPoints: data.totalPoints || 0,
            highestCompletedLevelCompleted:
              data.highestCompletedLevelCompleted || "",
            streak: data.streak || 0,
          };
          console.log("FORMATTED DATA:::::::::");
          console.log(formattedData);
          setUserName(formattedData.fullName);
          setFullName(formattedData.fullName);
          setReferrals(formattedData.referrals);
          setUserPoints(formattedData.totalPoints);
          setUserStreak(formattedData.streak);

          await AsyncStorage.setItem("userData", JSON.stringify(formattedData));
        }
      }
      await fetchAvailableLevels();
      await fetchFinishedQuizzes();
    } catch (error) {
      console.error("Failed to load user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableLevels = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;

      if (userId) {
        const userRef = ref(database, `users/${userId}`);
        const userSnapshot = await get(userRef);
        const userData = userSnapshot.val() || {};
        const currentUserLevel = userData.currentLevel || 1;

        const storedLevel = await AsyncStorage.getItem(LEVEL_STORAGE_KEY);
        console.log("storedLevel=---->>> 123", storedLevel);

        setHighestCompletedLevelComplete(Number(storedLevel));

        const availableLevelsArray = Array.from(
          { length: currentUserLevel },
          (_, i) => i + 1
        );

        setAvailableLevels(availableLevelsArray as any);
      }
    } catch (error) {
      console.log("Error fetching available levels:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFinishedQuizzes = async () => {
    try {
      const quizzesRef = ref(database, "quizzes");
      const quizzesSnapshot = await get(quizzesRef);
      const allQuizzes = quizzesSnapshot.exists() ? quizzesSnapshot.val() : {};
      const userId = auth.currentUser?.uid;

      if (userId) {
        const userRef = ref(database, `users/${userId}/completedQuizzes`);
        const userSnapshot = await get(userRef);
        const completedQuizzes = userSnapshot.exists()
          ? userSnapshot.val()
          : {};

        const finished = [];
        for (const [key, quiz] of Object.entries(allQuizzes)) {
          if (completedQuizzes[key]?.completed) {
            finished.push({ id: key, ...quiz });
          }
        }

        setFinishedQuizzes(finished.reverse().slice(0, 5));
      }
    } catch (error) {
      console.log("Error fetching finished quizzes:", error);
    }
  };

  const handleEnterQuizCode = async () => {
    try {
      if (!quizCode.trim()) {
        Alert.alert("Invalid Code", "Please enter a valid quiz code.");
        return;
      }
      const quizRef = ref(database, `quizzes/${quizCode.trim()}`);
      const snapshot = await get(quizRef);

      if (snapshot.exists()) {
        router.push({
          pathname: "/user/QuizScreen",
          params: { id: quizCode.trim() },
        });
      } else {
        Alert.alert(
          "Invalid Quiz Code",
          "The quiz code you entered does not exist."
        );
      }
    } catch (error) {
      console.error("Error validating quiz code:", error);
      Alert.alert(
        "Error",
        "Something went wrong while validating the quiz code. Please try again."
      );
    }
  };

  const [maxLevel, setMaxLevel] = useState<number>(0);
  const [handleStart, setHandleStart] = useState(false);

  const getMaxLevel = async () => {
    try {
      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);
      if (!snapshot.exists()) return 1;

      let maxLvl = 1;
      snapshot.forEach((childSnapshot) => {
        const quiz = childSnapshot.val();
        if (quiz.level > maxLvl) {
          maxLvl = quiz.level;
        }
      });
      return maxLvl;
    } catch (error) {
      console.error("Error getting max level:", error);
      return 1;
    }
  };

  const [isLoadingLevels, setIsLoadingLevels] = useState(false);
  const [isAllLevelsComplete, setIsAllLevelsComplete] = useState(false);
  const [quizzesSnapshot, setQuizzesSnapshot] = useState<null | {}>(null);
  const [currentLevel, setCurrentLevel] = useState(1);
  const checkAllLevelsCompletion = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val() || {};
      const currentLevel = userData.currentLevel;
      setCurrentLevel(currentLevel);
      console.log("my current level is in home---.>", currentLevel);

      const quizzesRef = ref(database, "quizzes");
      const quizzesSnapshot = await get(quizzesRef);
      setQuizzesSnapshot(quizzesSnapshot.val());
      console.log("quizzesSnapshot---->>. 236", quizzesSnapshot);

      let maxLevel = 1;

      if (quizzesSnapshot.exists()) {
        quizzesSnapshot.forEach((childSnapshot) => {
          const quiz = childSnapshot.val();
          if (quiz.level > maxLevel) {
            maxLevel = quiz.level;
          }
        });
      }

      if (userData.currentLevel >= maxLevel) {
        setIsAllLevelsComplete(true);
      }
    } catch (error) {
      console.error("Error checking levels completion:", error);
    }
  };

  const [hasFetched, setHasFreshed] = useState("false");

  const fetchData = async (forceRefresh = false) => {
    try {
      setIsLoadingLevels(true);

      if (!forceRefresh) {
        const [alreadyFetched, storedMaxLevel, storedCurrentLevel] =
          await Promise.all([
            AsyncStorage.getItem("hasFetched"),
            AsyncStorage.getItem("maxLevel"),
            AsyncStorage.getItem("currentLevel"),
          ]);

        setHasFreshed(alreadyFetched as any);

        if (storedMaxLevel && storedCurrentLevel && alreadyFetched === "true") {
          setMaxLevel(JSON.parse(storedMaxLevel));
          setCurrentLevel(JSON.parse(storedCurrentLevel));
          console.log("Loaded from AsyncStorage ✅");
          setIsLoadingLevels(false);
          return;
        }
      }

      console.log(
        forceRefresh
          ? "Refreshing from backend... 🔄"
          : "Fetching from backend... 🌐"
      );

      await Promise.all([
        loadUserData(),
        checkAllLevelsCompletion(),
        fetchAvailableLevels(),
        fetchFinishedQuizzes(),
      ]);

      console.log("Quizzes Snapshot ->", quizzesSnapshot);

      const maxLvl = await getMaxLevel();
      console.log("my server level 262---->>", maxLvl);

      setMaxLevel(maxLvl);
      await Promise.all([
        AsyncStorage.setItem("maxLevel", JSON.stringify(maxLvl)),
        AsyncStorage.setItem("currentLevel", JSON.stringify(currentLevel)),
        AsyncStorage.setItem("hasFetched", "true"),
      ]);
    } catch (error) {
      console.error("Error during fetch:", error);
    } finally {
      setIsLoadingLevels(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        fetchData();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const onRefresh = () => {
    fetchData(true);
  };

  const params = useLocalSearchParams();
  const { openLevelPopup } = params;

  const handlePoUp = async () => {
    setHandleStart(true);

    await SoundManager.playSound("levelSoundEffect", { isLooping: true });
  };

  useEffect(() => {
    if (openLevelPopup) {
      handlePoUp();
    }
  }, [openLevelPopup]);

  const handleHidePoUp = async () => {
    await SoundManager.stopSound("levelSoundEffect");
    await SoundManager.stopSound("clappingSoundEffect");
    await SoundManager.stopSound("victorySoundEffect");
    await SoundManager.stopSound("failSoundEffect");
    setHandleStart(false);
    const newParams = { ...params };
    delete newParams.openLevelPopup;

    router.replace({
      pathname: "",
      params: newParams,
    });
  };

  const handleContinue = async () => {
    router.push("/user/QuizScreen");
    await SoundManager.stopSound("levelSoundEffect");
  };

  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const startZoomAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.05,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startZoomAnimation();
  }, [scaleAnim]);

  const handleQuizChoice = async (level: any, isMannualSelection: boolean) => {
    console.log("level choice is ---->>>> 532", level);

    await SoundManager.stopSound("levelSoundEffect");
    await SoundManager.stopSound("clappingSoundEffect");
    await SoundManager.stopSound("victorySoundEffect");
    await SoundManager.stopSound("failSoundEffect");
    if (currentLevel === undefined) {
      router.push({
        pathname: "/user/QuizScreen",
        params: {
          level: level,
          isSelectedLevel: isMannualSelection as any,
        },
      });
    }
    if (currentLevel === 1) {
      router.push({
        pathname: "/user/QuizScreen",
        params: {
          level: level,
          isSelectedLevel: isMannualSelection as any,
        },
      });
    } else if (currentLevel > 1) {
      router.push({
        pathname: "/user/QuizScreen",
        params: {
          level: level,
          isSelectedLevel: isMannualSelection as any,
        },
      });
    }
  };

  const scrollY = useRef(new Animated.Value(0)).current;

  const textWidth = 270;
  const animatedValue = useRef(new Animated.Value(textWidth)).current;
  useEffect(() => {
    const startAnimation = () => {
      animatedValue.setValue(textWidth);
      Animated.timing(animatedValue, {
        toValue: -textWidth,
        duration: 8000,
        useNativeDriver: true,
      }).start(() => startAnimation());
    };

    startAnimation();
  }, [animatedValue]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={onRefresh} />
      }
    >
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Poppins-Bold",
          color: "#333333",
          marginBottom: 10,
        }}
      >
        For autoRefresh Please Drag Down from Top to bottom
      </Text>
      <View style={styles.welcomeContainer}>
        <View style={styles.welcomeHeader}>
          <View
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <Text style={styles.welcomeText}>Welcome, {userName}</Text>
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Poppins-Bold",
                color: "#333333",
              }}
            >
              Total levels Completed:{" "}
              {highestCompletedLevelCompleted != 0
                ? `level(1 - ${highestCompletedLevelCompleted})`
                : 0}
            </Text>
          </View>
          <View style={{ flexDirection: "column", alignItems: "center" }}>
            <View style={styles.pointsContainer}>
              <Image
                source={require("../../assets/diamond.png")}
                style={styles.diamondIcon}
              />
              {loading ? (
                <ActivityIndicator color="#ffffff" size={30} />
              ) : (
                <Text style={styles.pointsText}>{userPoints.toFixed()}</Text>
              )}
            </View>

            <View style={styles.pointsContainer}>
              <Image
                source={require("../../assets/streakIcon.png")}
                style={{ width: 16, height: 16, marginRight: 4 }}
              />
              {loading ? (
                <ActivityIndicator color="#ffffff" size={30} />
              ) : (
                <Text style={styles.pointsText}>{userStreak} days</Text>
              )}
            </View>
          </View>
        </View>
        <Text style={styles.subtitle}>Test your knowledge and have fun!</Text>
      </View>
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <TouchableOpacity
            style={{
              backgroundColor: "#F7C948",
              paddingVertical: 12,
              opacity: currentLevel === 0 || undefined ? 0.7 : 1,
              paddingHorizontal: 20,
              borderRadius: 10,
              alignItems: "center",
              overflow: "hidden",
            }}
            disabled={currentLevel === 0 || undefined}
            onPress={() => handlePoUp()}
          >
            {currentLevel === 0 || undefined ? (
              <View
                style={{
                  overflow: "hidden",
                  width: textWidth,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Animated.Text
                  style={{
                    transform: [{ translateX: animatedValue }],
                    color: "#333333",
                    fontFamily: "Poppins-Bold",
                    fontSize: 12,
                    textAlign: "center",
                  }}
                >
                  ⚠️⚠️⚠️Currently There is no Quiz available...
                </Animated.Text>
              </View>
            ) : null}
            <Text
              style={{
                color: "#333333",
                fontFamily: "Poppins-Bold",
                fontSize: 16,
              }}
            >
              Start Your Quiz
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tasksButton}
            onPress={() => router.push("/user/TasksScreen")}
          >
            <Text style={styles.tasksButtonText}>View Tasks</Text>
          </TouchableOpacity>

          <Modal
            visible={handleStart}
            transparent
            animationType="fade"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
            }}
          >
            <View
              style={{
                width: "100%",
                height: "100%",
                justifyContent: "flex-start",
                alignItems: "flex-start",
                backgroundColor: "#FFF2CC",
                flex: 1,
                flexDirection: "column",
              }}
            >
              <View
                style={{
                  backgroundColor: "transparent",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  flexDirection: "column",
                }}
              >
                {currentLevel > 1 && (
                  <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        height: 40,
                        marginBottom: 25,
                        width: 240,
                        borderRadius: 30,
                        display: "flex",
                        justifyContent: "center",
                      }}
                      onPress={() => handleContinue()}
                    >
                      <ImageBackground
                        source={require("../../assets/images/continue.png")}
                        style={{
                          width: "100%",
                          height: "100%",
                          justifyContent: "center",
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                        resizeMode="cover"
                      >
                        {currentLevel === maxLevel && (
                          <Image
                            source={require("../../assets/images/mathKing.png")}
                            style={{ width: 30, height: 30 }}
                            resizeMode="contain"
                          />
                        )}
                        <Text
                          style={{
                            fontSize: 11,
                            color: "#ffffff",
                            fontFamily: "Poppins-Bold",
                          }}
                        >
                          Continue Where I Stopped
                        </Text>
                      </ImageBackground>
                    </TouchableOpacity>
                  </Animated.View>
                )}
                <ImageBackground
                  source={require("../../assets/images/selectLevel.png")}
                  style={{
                    width: 150,
                    height: 150,
                    justifyContent: "center",
                    alignItems: "center",
                    display: "flex",
                  }}
                  resizeMode="cover"
                >
                  <Text
                    style={{
                      backgroundColor: "#5873a4",
                      borderRadius: 20,
                      fontSize: 15,
                      paddingLeft: 10,
                      fontWeight: "condensed",
                      paddingRight: 10,
                      color: "#ffffff",
                      fontFamily: "Poppins-Bold",
                      zIndex: 9999999,
                    }}
                  >
                    {" "}
                    {currentLevel <= 1 ? "Start Quiz" : "Select Level"}
                  </Text>
                </ImageBackground>

                <View
                  style={{ position: "relative", width: "100%", marginTop: 20 }}
                >
                  <ScrollView
                    style={{
                      width: "100%",
                      minHeight: 100,
                      maxHeight: 270,
                    }}
                    contentContainerStyle={{
                      flexDirection: "column",
                      display: "flex",
                      gap: 10,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                    onScroll={Animated.event(
                      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                      { useNativeDriver: false }
                    )}
                    showsVerticalScrollIndicator={false}
                  >
                    {Array.from({ length: maxLevel }, (_, index) => {
                      const level = index + 1;
                      console.log("level 741----.>>>>>", level);

                      const completedLevels = highestCompletedLevelCompleted
                        ? Number(highestCompletedLevelCompleted)
                        : 0;

                      const highestEnabledIndex =
                        currentLevel === undefined ? 0 : completedLevels;

                      const isDisabled = index > highestEnabledIndex;
                      console.log(
                        "Current Level:",
                        currentLevel,
                        "Index:",
                        index,
                        "Disabled:",
                        isDisabled
                      );

                      console.log(
                        "Current Level:",
                        currentLevel,
                        "Index:",
                        index,
                        "Disabled:",
                        isDisabled
                      );

                      return (
                        <Animated.View
                          style={{
                            transform: [{ scale: isDisabled ? 1 : scaleAnim }],
                          }}
                          key={level}
                        >
                          <TouchableOpacity
                            disabled={isDisabled}
                            style={{
                              width: 60,

                              height: 60,
                              backgroundColor: isDisabled ? "#ccc" : "#b91c1c",
                              borderRadius: 50,
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              opacity: isDisabled ? 0.6 : 1,
                            }}
                            onPress={() => handleQuizChoice(level, true)}
                          >
                            <ImageBackground
                              source={require("../../assets/images/levelImage.png")}
                              style={{
                                width: "100%",
                                height: "100%",
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                              resizeMode="cover"
                            >
                              <Text
                                style={{ color: "white", fontWeight: "bold" }}
                              >
                                level {""}
                                {level}
                              </Text>
                            </ImageBackground>
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
                  </ScrollView>

                  <Animated.Image
                    source={require("../../assets/images/scrollIndicator.png")}
                    style={[
                      {
                        position: "absolute",
                        left: "70.3%",
                        bottom: 0,
                        width: 80,
                        height: 200,

                        borderRadius: 10,
                        transform: [
                          {
                            translateY: scrollY.interpolate({
                              inputRange: [0, 1000],
                              outputRange: [0, 200],
                              extrapolate: "clamp",
                            }),
                          },
                        ],
                      },
                    ]}
                    resizeMode="cover"
                  />
                </View>

                <TouchableOpacity
                  style={{
                    position: "absolute",
                    top: "1%",
                    left: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "transparent",
                    height: 40,
                    width: 150,
                    borderRadius: 20,
                    display: "flex",
                    justifyContent: "center",
                  }}
                  onPress={() => handleHidePoUp()}
                >
                  <Image
                    source={require("../../assets/images/quiteQuize.png")}
                    style={{ width: 20, height: 20 }}
                    tintColor="#000000"
                  />
                  <Text
                    style={{
                      fontSize: 17,
                      color: "#000000",
                      fontFamily: "Poppins-Bold",
                    }}
                  >
                    Go Back
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>

        <View style={styles.quizCodeSection}>
          <Text style={styles.sectionTitle}>Enter Quiz Code</Text>
          <View style={styles.quizCodeInputContainer}>
            <TextInput
              style={styles.quizCodeInput}
              placeholder="Enter Quiz Code"
              placeholderTextColor="#333333"
              value={quizCode}
              onChangeText={setQuizCode}
            />
            <TouchableOpacity
              style={styles.quizCodeButton}
              onPress={handleEnterQuizCode}
            >
              <Text
                style={{
                  color: "#333333",
                  fontFamily: "Poppins-Bold",
                  fontSize: 16,
                }}
              >
                Enter
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.7;
const CARD_HEIGHT = 180 * 0.8;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF2CC" },
  scrollContainer: { flex: 1 },
  welcomeContainer: {
    backgroundColor: "#FFDB74",
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    marginBottom: 10,
  },
  welcomeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
  },
  welcomeText: { fontSize: 18, fontFamily: "Poppins-Bold", color: "#333333" },
  subtitle: {
    fontSize: 14,
    color: "#333333",
    fontFamily: "Poppins-Regular",
    paddingHorizontal: 15,
    marginTop: 5,
  },
  pointsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7C948",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    marginBottom: 4,
  },
  diamondIcon: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  pointsText: {
    fontSize: 14,
    color: "#333333",
    fontFamily: "Poppins-Bold",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
    color: "#333333",
  },
  seeMore: {
    fontSize: 14,
    color: "#007AFF",
    fontFamily: "Poppins-Regular",
  },
  noQuizzesText: {
    fontSize: 14,
    color: "#333333",
    fontFamily: "Poppins-Regular",
    marginLeft: 15,
    marginTop: 10,
  },
  horizontalList: {
    paddingHorizontal: 0,
    marginTop: 10,
  },
  quizCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 15,
    marginHorizontal: 8,
    padding: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  quizTitle: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
    color: "#FFFFFF",
  },
  quizDescription: {
    fontSize: 14,
    fontFamily: "Poppins-Regular",
    color: "#FFFFFF",
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 20,
  },
  quizCodeSection: {
    marginTop: 20,
    paddingHorizontal: 15,
  },
  quizCodeInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  quizCodeInput: {
    flex: 1,
    backgroundColor: "#F7C948",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    fontSize: 16,
    fontFamily: "Poppins-Regular",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  quizCodeButton: {
    backgroundColor: "#F7C948",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontFamily: "Poppins-Bold",
    fontSize: 16,
  },
  tasksButton: {
    backgroundColor: "#F7C948",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  tasksButtonText: {
    color: "#333333",
    fontFamily: "Poppins-Bold",
    fontSize: 16,
  },
});
