import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { ref, get } from "firebase/database";
import { database, auth } from "../../firebase/firebaseConfig";
import { useRouter } from "expo-router";

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

export default function TasksScreen() {
  const router = useRouter();
  const [maxLevel, setMaxLevel] = useState(1);
  const [completedLevels, setCompletedLevels] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      if (userId) {
        const maxLvl = await getMaxLevel();
        setMaxLevel(maxLvl);

        const userRef = ref(database, `users/${userId}/completedLevels`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setCompletedLevels(snapshot.val());
        }
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const renderLevel = ({ item }) => (
    <View style={styles.levelContainer}>
      <Text style={styles.levelText}>Level {item.level}</Text>
      {completedLevels[item.level] ? (
        <Text style={styles.completedText}>Completed</Text>
      ) : (
        <TouchableOpacity
          style={styles.startButton}
          onPress={() =>
            router.push({
              pathname: "/user/QuizScreen",
              params: { level: item.level },
            })
          }
        >
          <Text style={styles.startButtonText}>Start</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return <Text style={styles.loadingText}>Loading...</Text>;
  }

  const levels = Array.from({ length: maxLevel }, (_, i) => ({ level: i + 1 }));

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Task List: Complete Levels</Text>
      {levels.length === 0 ? (
        <Text style={styles.noTasksText}>
          No levels available. Check back soon!
        </Text>
      ) : (
        <FlatList
          data={levels}
          keyExtractor={(item) => item.level.toString()}
          renderItem={renderLevel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#FFF2CC",
  },
  header: {
    fontSize: 24,
    fontFamily: "Poppins-Bold",
    color: "#333",
    marginBottom: 20,
    textAlign: "center",
  },
  levelContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#FFDB74",
    marginBottom: 10,
    borderRadius: 10,
  },
  levelText: {
    fontSize: 18,
    fontFamily: "Poppins-Regular",
    color: "#333",
  },
  completedText: {
    fontSize: 18,
    fontFamily: "Poppins-Regular",
    color: "green",
  },
  startButton: {
    backgroundColor: "#F7C948",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  startButtonText: {
    color: "#333",
    fontSize: 16,
    fontFamily: "Poppins-Bold",
  },
  loadingText: {
    fontSize: 18,
    color: "#333",
    textAlign: "center",
    marginTop: 20,
    fontFamily: "Poppins-Regular",
  },
  noTasksText: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    marginTop: 20,
    fontFamily: "Poppins-Regular",
  },
});
