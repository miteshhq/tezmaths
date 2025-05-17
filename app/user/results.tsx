import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, BackHandler, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ref, get, update } from "firebase/database";
import { database, auth } from "../../firebase/firebaseConfig";

import { Player } from "@lottiefiles/react-lottie-player";
import SoundManager from "./components/souund/soundManager";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function ResultsScreen() {
  const [showScore, setShowScore] = useState(false);
  const params = useLocalSearchParams();
  const {
    highestLevelReached,
    quizScore,
    correctAnswers,
    totalQuestions,
    isLevelComplete,
    currentLevel,
    maxLevel,
    isSelectedLevel,
    level: level

  } = params;



  useEffect(() => {
    const playLevelSound = async () => {
      if ((isLevelComplete && maxLevel !== currentLevel) || (isLevelComplete && maxLevel === currentLevel)) {
        await SoundManager.playSound('clappingSoundEffect', { isLooping: false });
        await SoundManager.playSound('victorySoundEffect', { isLooping: false });

      }
      else if (!isLevelComplete) {
        await SoundManager.playSound('failSoundEffect', { isLooping: false });
      }
      console.log("state of me now 200", isLevelComplete);
      console.log("maxlevel 2343", maxLevel, currentLevel);
    };


    playLevelSound();
  }, [isLevelComplete, maxLevel, currentLevel]); // Add dependencies to re-run effect only when values change



  const getAllLevelScores = async (maxLevel: number) => {
    let scores: { [key: string]: number } = {}; // Ensure object keys are strings
    try {
      for (let level = 1; level <= maxLevel; level++) {
        const key = `levelScore_${level}`;
        const score = await AsyncStorage.getItem(key);

        if (score !== null) { // Only store if a value exists
          scores[`Level${level}`] = Number(score);
        }
      }
      console.log("Stored level scores:", scores);
      return scores;
    } catch (error) {
      console.error("Error retrieving stored level scores:", error);
      return {};
    }
  };


  const [scores, setScores] = useState<{ [key: string]: number } | null>(null);

  useEffect(() => {
    const fetchScores = async () => {
      const retrievedScores = await getAllLevelScores(Number(currentLevel));
      setScores(retrievedScores);

    };

    fetchScores();
  }, []);


  const clearAllLevelScores = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys(); // Get all stored keys
      const levelKeys = keys.filter((key) => key.startsWith("levelScore_")); // Filter only level score keys

      if (levelKeys.length > 0) {
        await AsyncStorage.multiRemove(levelKeys); // Remove all level score keys
        console.log("All level scores removed successfully!");
      } else {
        console.log("No level scores found to remove.");
      }
    } catch (error) {
      console.error("Error clearing level scores:", error);
    }
  };


  useEffect(() => {
    const backAction = () => {

      Alert.alert(
        "Are you sure you want to quit the quiz?",
        ``,
        [
          {
            text: "Resume Quiz",
            style: "cancel",
            onPress: () => { }, // Just cancels the alert
          },
          {
            text: "Quit anyway!",
            onPress: async () => {
              await clearAllLevelScores()
              await SoundManager.stopSound('clappingSoundEffect');
              await SoundManager.stopSound('victorySoundEffect');
              await SoundManager.stopSound('failSoundEffect');

              router.push({ pathname: "/dashboard", params: { openLevelPopup: true as any } })
            },
          },
        ],
        { cancelable: true }
      );

      return true; // Prevent default back action
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction as any);

    return () => backHandler.remove(); // Cleanup on unmount
  }, []); // ✅ Add resumeTimer as a dependency

  const [isAllLevelsComplete, setIsAllLevelsComplete] = useState(false);



  useEffect(() => {
    if (showScore) {
      checkAllLevelsCompletion();
    }
    // updateUserProgress();
  }, [showScore]);

  const checkAllLevelsCompletion = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val() || {};

      // Get max level from quizzes
      const quizzesRef = ref(database, 'quizzes');
      const quizzesSnapshot = await get(quizzesRef);
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


  const handleContinue = async () => {
    await SoundManager.stopSound('clappingSoundEffect');
    await SoundManager.stopSound('victorySoundEffect');
    await SoundManager.stopSound('failSoundEffect');
    if (isSelectedLevel && level !== maxLevel) {
      router.push({
        pathname: "/user/QuizScreen",
        params: {
          level: Number(level) + 1

        },
      });


    }

    else {
      if ((maxLevel != currentLevel) && isLevelComplete) {
        router.push("/user/QuizScreen")

      } else if ((maxLevel != currentLevel) && !isLevelComplete) {
        router.push({ pathname: "/dashboard", params: { openLevelPopup: true as any } })
        await clearAllLevelScores()
      }

      else if (maxLevel === currentLevel) {
        router.push({ pathname: "/dashboard", params: { openLevelPopup: true as any } })
        await clearAllLevelScores()
      }
    }

  };

  return (
    <View style={styles.container}>
      {!showScore ? (
        <TouchableOpacity
          style={styles.scoreButton}
          onPress={() => setShowScore(true)}
        >
          <Text style={styles.buttonText}>Know Your Score</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.scoreCard}>
          <Text style={styles.scoreText}>
            Total score for this attempt: {Object.values(scores ?? {}).reduce((sum, score) => sum + score, 0)}
          </Text>

          <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderColor: 'gray', borderWidth: 3, padding: 5, borderRadius: 22,
            }}>
              <Text style={{
                fontSize: 14,
                color: "#333",
                fontFamily: "Poppins-Bold",
                marginBottom: 10,
                textDecorationStyle: 'dotted',
                textDecorationLine: 'underline'
              }}>
                Your Score For this attempt
              </Text>
              <View>
                {scores &&
                  Object.entries(scores).map(([level, score]) => (
                    <Text key={level} style={{ fontSize: 16, marginVertical: 4 }}>
                      {level}: {score}
                    </Text>
                  ))}
              </View>
              <Text style={{
                fontSize: 14,
                color: "#333",
                fontFamily: "Poppins-Bold",
                marginBottom: 10,
                textDecorationStyle: 'dotted',
                textDecorationLine: 'underline'
              }}>
                level:{currentLevel} Quiz Statistics
              </Text>
              <Text style={{
                fontSize: 14,
                color: "#333",
                fontFamily: "Poppins-Bold",
                marginBottom: 10,
                maxWidth: 160
              }}>
                Number of Correctly Answered question in level {currentLevel}:{correctAnswers}
              </Text>
              <Text style={{
                fontSize: 14,
                color: "#333",
                fontFamily: "Poppins-Bold",
                marginBottom: 10,
              }}>
                Total Question in level {currentLevel} :{totalQuestions}
              </Text>
              <Text style={{
                fontSize: 14,
                color: "#333",
                fontFamily: "Poppins-Bold",
                marginBottom: 10,
              }}>
                Total Miss/UnAnswered question in level {currentLevel}: {Number(totalQuestions) - Number(correctAnswers)}
              </Text>
            </ScrollView>

          </View>
          {isLevelComplete && maxLevel != currentLevel && (
            <View style={styles.completionMessage}>
              <Text style={styles.congratsText}>
                🎉 Congratulations on completing  level:{currentLevel} of the math quiz!
              </Text>
            </View>
          )}

          {!isLevelComplete && (
            <View style={styles.completionMessage}>
              <Text style={styles.congratsText}>
                😞 😔 unfortunately you didn't  complete this level press continue to select a level and try again!
              </Text>
            </View>
          )}

          {isLevelComplete && maxLevel === currentLevel && (
            <View style={styles.completionMessage}>
              <Text style={styles.congratsText}>
                🎉 Congratulations you have successfully completed all level of the quiz!.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}
      {isLevelComplete &&
        <Player
          autoPlay
          style={{
            width: '100%',
            height: '30%',
            marginTop: 30,
            top: 45,
            position: 'absolute'
          }}
          source={require('./../../assets/icons/congrate.json')}
        />}
      {!isLevelComplete &&
        <Player
          autoPlay
          style={{
            width: '100%',
            height: '15%',
            marginTop: 30,
            top: 10,
            position: 'absolute'
          }}
          source={require('./../../assets/icons/faliure.json')}
        />}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF2CC",
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreButton: {
    backgroundColor: "#F7C948",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginBottom: 20,
  },
  buttonText: {
    color: "#333",
    fontSize: 18,
    fontFamily: "Poppins-Bold",
  },
  scoreCard: {
    backgroundColor: "#FFF",
    padding: 30,
    borderRadius: 15,
    alignItems: "center",
    width: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scoreText: {
    fontSize: 24,
    color: "#333",
    fontFamily: "Poppins-Bold",
    marginBottom: 10,
  },
  percentageText: {
    fontSize: 36,
    color: "#F7C948",
    fontFamily: "Poppins-Bold",
    marginBottom: 30,
  },
  continueButton: {
    backgroundColor: "#F7C948",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  completionMessage: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  congratsText: {
    fontSize: 18,
    color: "#333",
    fontFamily: "Poppins-Bold",
    textAlign: "center",
  },
});
