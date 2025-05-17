import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ScrollView,
  RefreshControl,
} from "react-native";
import {
  ref,
  push,
  set,
  remove,
  onValue,
  serverTimestamp,
  get,
} from "firebase/database";
import { database } from "../../firebase/firebaseConfig";
import * as ImagePicker from "expo-image-picker";
import { uploadImage } from "../../firebase/firebaseStorage";
import { RadioButton } from "react-native-paper";
import { storage } from "../../firebase/firebaseConfig";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

interface Question {
  questionText: string;
  points: number;
  correctAnswer: string;
  answerFormat: "text" | "image";
  answerImage?: string; // URL to the image if format is 'image'
  explanation?: string; // Optional explanation to show after wrong answer
  timeLimit: number; // Time limit in seconds
}

export default function QuestionManagement() {
  const [quizName, setQuizName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [points, setPoints] = useState("");
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [existingQuizzes, setExistingQuizzes] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState(null);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    fetchExistingQuizzes();
  }, []);

  const fetchExistingQuizzes = async () => {
    try {
      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);
      if (snapshot.exists()) {
        const quizzes = [];
        snapshot.forEach((childSnapshot) => {
          const quizData = childSnapshot.val();
          const questions = Array.isArray(quizData.questions) ? quizData.questions : [];

          quizzes.push({
            id: childSnapshot.key,
            ...quizData,
            questions, // Ensure questions is always an array
          });
        });
        setExistingQuizzes(quizzes.reverse()); // Show newest first
      } else {
        console.warn("No quizzes found in the database.");
      }
    } catch (error) {
      console.error("Error fetching quizzes:", error);
      Alert.alert("Error", "Failed to load existing quizzes");
    }
  };

  const handleDeleteQuiz = async (quizId: any) => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete this quiz?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const quizRef = ref(database, `quizzes/${quizId}`);
              await remove(quizRef);
              await fetchExistingQuizzes(); // Refresh the list
              Alert.alert("Success", "Quiz deleted successfully");
            } catch (error) {
              console.error("Error deleting quiz:", error);
              Alert.alert("Error", "Failed to delete quiz");
            }
          },
        },
      ],
    );
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchExistingQuizzes().finally(() => setRefreshing(false));
  }, []);

  const addNewQuestion = () => {
    const newQuestion = {
      questionText: "",
      point: 0,
      correctAnswer: "",
      answerType: "manual",
      answerFormat: "text",
      explanation: "",
      options: "",
      timeLimit: "", // Default time limit for each question(15)
    };

    setQuestions((prevQuestions) => [...prevQuestions, newQuestion]);
  };

  const updateQuestion = (index, field, value) => {
    setQuestions((prevQuestions) => {
      const updatedQuestions = [...prevQuestions];
      updatedQuestions[index] = {
        ...updatedQuestions[index],
        [field]: value,
      };
      return updatedQuestions;
    });
  };

  const renderQuestionForm = (question: any, index: number) => (

    <View style={styles.questionContainer} key={index}>
      <Text style={styles.questionCounter}>Question {index + 1}</Text>

      <View style={styles.answerTypeSelector}>
        <Text>Answer Type:</Text>
        <RadioButton.Group
          onValueChange={(value) => updateQuestion(index, "answerType", value)}
          value={question.answerType}
        >
          <RadioButton.Item label="Manual Input" value="manual" />
          <RadioButton.Item label="Multiple Choice" value="mcq" />
        </RadioButton.Group>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Question Text"
        value={question.questionText}
        onChangeText={(text) => updateQuestion(index, "questionText", text)}
        multiline
      />

      {question.answerType === "mcq" && (
        <TextInput
          style={styles.input}
          placeholder="Options (comma-separated)"
          value={question.options}
          onChangeText={(text) => updateQuestion(index, "options", text)}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Correct Answer"
        value={question.correctAnswer}
        onChangeText={(text) => updateQuestion(index, "correctAnswer", text)}
      />

      <View style={styles.answerFormatSelector}>
        <Text>Answer Format:</Text>
        <RadioButton.Group
          onValueChange={(value) =>
            updateQuestion(index, "answerFormat", value)
          }
          value={question.answerFormat}
        >
          <RadioButton.Item label="Text" value="text" />
          <RadioButton.Item label="Image" value="image" />
        </RadioButton.Group>
      </View>

      {question.answerFormat === "image" && (
        <TouchableOpacity
          style={styles.imageUploadButton}
          onPress={() => handleImageUpload(index)}
        >
          <Text>Upload Answer Image</Text>
        </TouchableOpacity>
      )}

      <TextInput
        style={styles.input}
        placeholder="Explanation"
        value={question.explanation}
        onChangeText={(text) => updateQuestion(index, "explanation", text)}
        multiline
      />

      <TextInput
        style={styles.input}
        placeholder="Time Limit (seconds)"
        value={question.timeLimit.toString()}
        keyboardType="numeric"
        onChangeText={(text) =>
          updateQuestion(index, "timeLimit", parseInt(text))
        }
      />

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => removeQuestion(index)}
      >
        <Text style={styles.deleteButtonText}>Delete Question</Text>
      </TouchableOpacity>
    </View>
  );

  const removeQuestion = (index) => {
    setQuestions((prevQuestions) =>
      prevQuestions.filter((_, i) => i !== index),
    );
  };

  const handleAddQuiz = async () => {
    if (!areQuizFieldsValid() || !areQuestionsValid()) return;

    setLoading(true);
    try {
      const quizRef = ref(database, `quizzes/${editingQuizId || ""}`);
      const numQuestions = questions.length;
      const totalPoints = parseInt(points);
      const pointsPerQuestion = numQuestions > 0 ? totalPoints / numQuestions : 0;
      const quizData = {
        name: quizName,
        description,
        category,
        level: Number(level),
        points: totalPoints,
        questions: questions.map((q: any) => ({
          questionText: q.questionText,
          correctAnswer: q.correctAnswer,
          answerType: q.answerType || "manual",
          answerFormat: q.answerFormat || "text",
          explanation: q.explanation || "",
          answerImage: q.answerImage || null,
          point: pointsPerQuestion,
          options:
            q.answerType === "mcq"
              ? q.options.split(",").map((opt: string) => opt.trim())
              : [],
          timeLimit: q.timeLimit || 15, // Save the time limit
        })),
        updatedAt: serverTimestamp(),
      };

      if (!editingQuizId) {
        quizData.createdAt = serverTimestamp();
        await push(ref(database, "quizzes"), quizData);
      } else {
        await set(quizRef, quizData);
      }

      Alert.alert(
        "Success",
        `Quiz ${editingQuizId ? "updated" : "added"} successfully!`,
      );
      resetForm();
      fetchExistingQuizzes();
    } catch (error) {
      console.error("Error saving quiz:", error);
      Alert.alert("Error", "Failed to save quiz. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const areQuizFieldsValid = () => {
    if (!quizName.trim()) {
      Alert.alert("Validation Error", "Quiz title is required");
      return false;
    }

    if (!description.trim()) {
      Alert.alert("Validation Error", "Description is required");
      return false;
    }

    if (!category.trim()) {
      Alert.alert("Validation Error", "Category is required");
      return false;
    }

    if (!level) {
      Alert.alert("Validation Error", "Level is required");
      return false;
    }


    if (!points) {
      Alert.alert("Validation Error", "Points are required");
      return false;
    }

    const pointsNum = Number(points);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      Alert.alert("Validation Error", "Points must be a positive number");
      return false;
    }

    return true;
  };

  const validateQuestionFields = (question: any) => {
    if (!question.questionText.trim()) {
      return false;
    }

    if (!question.correctAnswer.trim()) {
      return false;
    }

    if (question.answerType === "mcq") {
      if (!question.options || !question.options.trim()) {
        return false;
      }

      const optionsArray = question.options.split(",").map((opt) => opt.trim());
      if (optionsArray.length < 2) {
        return false;
      }

      if (!optionsArray.includes(question.correctAnswer.trim())) {
        return false;
      }
    }

    return true;
  };

  const areQuestionsValid = () => {
    if (questions.length === 0) {
      Alert.alert("Validation Error", "You must add at least one question");
      return false;
    }

    for (let i = 0; i < questions.length; i++) {
      if (!validateQuestionFields(questions[i])) {
        Alert.alert(
          "Validation Error",
          `Please check Question ${i + 1}:\n` +
          "- Question text is required\n" +
          "- Correct answer is required\n" +
          (questions[i].answerType === "mcq"
            ? "- At least 2 options are required\n- Correct answer must be one of the options"
            : ""),
        );
        return false;
      }
    }

    return true;
  };

  const handleImageUpload = async (index: any) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow access to your photos");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled) {
        const formData = new FormData();
        formData.append("file", {
          uri: result.assets[0].uri,
          type: "image/jpeg", // or the appropriate type
          name: "upload.jpg",
        });
        formData.append("upload_preset", "your_upload_preset"); // Replace with your Cloudinary upload preset

        const response = await fetch("https://api.cloudinary.com/v1_1/your_cloud_name/image/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        const downloadURL = data.secure_url;

        updateQuestion(index, "answerImage", downloadURL);
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Error", "Failed to upload image");
    }
  };

  const handleEditQuiz = async (quizId: any) => {
    try {
      const quizRef = ref(database, `quizzes/${quizId}`);
      const snapshot = await get(quizRef);

      if (!snapshot.exists()) {
        throw new Error("Quiz not found");
      }

      const quizData = snapshot.val();

      // Format questions properly
      const formattedQuestions = Array.isArray(quizData.questions)
        ? quizData.questions.map((q: any) => ({
          questionText: q.questionText || "",
          point: q.point,
          correctAnswer: q.correctAnswer || "",
          answerType: q.answerType || "manual",
          answerFormat: q.answerFormat || "text",
          explanation: q.explanation || "",
          options: Array.isArray(q.options) ? q.options.join(", ") : "",
          answerImage: q.answerImage || null,
          timeLimit: q.timeLimit || 15, // Save the time limit
        }))
        : [];

      setQuizName(quizData.name || "");
      setDescription(quizData.description || "");
      setCategory(quizData.category || "");
      setLevel(quizData.level?.toString() || "");
      setPoints(quizData.points?.toString() || "");
      setQuestions(formattedQuestions);
      setEditingQuizId(quizId);

      // Ensure scroll to top works
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }, 100);
    } catch (error) {
      console.error("Error loading quiz for edit:", error);
      Alert.alert(
        "Error",
        "Failed to load quiz for editing. Please try again.",
      );
    }
  };

  const resetForm = () => {
    setQuizName("");
    setDescription("");
    setCategory("");
    setLevel("");
    setPoints("");
    setQuestions([]);
    setEditingQuizId(null);
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>Create New Quiz</Text>

      <TextInput
        style={styles.input}
        placeholder="Quiz Title"
        value={quizName}
        onChangeText={setQuizName}
      />

      <TextInput
        style={styles.input}
        placeholder="Description"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <TextInput
        style={styles.input}
        placeholder="Category"
        value={category}
        onChangeText={setCategory}
      />

      <TextInput
        style={styles.input}
        placeholder="Level (1-4)"
        value={level}
        onChangeText={setLevel}
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        placeholder="totalScore"
        value={points}
        onChangeText={setPoints}
        keyboardType="numeric"
      />

      {questions.map((question, index) => renderQuestionForm(question, index))}

      <TouchableOpacity style={styles.addButton} onPress={addNewQuestion}>
        <Text style={styles.buttonText}>Add Question</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleAddQuiz}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Adding Quiz..." : "Submit Quiz"}
        </Text>
      </TouchableOpacity>

      <View style={styles.existingQuizzesSection}>
        <Text style={styles.sectionTitle}>Existing Quizzes</Text>
        {existingQuizzes.map((quiz: any) => (
          <View key={quiz.id} style={styles.quizCard}>
            <View style={styles.quizHeader}>
              <Text style={styles.quizTitle}>{quiz.name}</Text>
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleEditQuiz(quiz.id)}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteQuizButton}
                  onPress={() => handleDeleteQuiz(quiz.id)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.quizInfo}>Level: {quiz.level}</Text>
            <Text style={styles.quizInfo}>Category: {quiz.category}</Text>
            <Text style={styles.quizInfo}>
              Questions: {quiz.questions?.length || 0}
            </Text>

            <View style={styles.questionsContainer}>
              {quiz.questions?.map((question, index) => (
                <View key={index} style={styles.questionItem}>
                  <Text style={styles.questionNumber}>Q{index + 1}:</Text>
                  <Text style={styles.questionText}>
                    {question.questionText}
                  </Text>
                  <Text style={styles.answerText}>
                    Answer: {question.correctAnswer}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#F4F6F8",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  questionContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  questionCounter: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  addButton: {
    backgroundColor: "#4CAF50",
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    alignItems: "center",
  },
  submitButton: {
    backgroundColor: "#F7C948",
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    alignItems: "center",
  },
  deleteButton: {
    backgroundColor: "#FF5A5F",
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  answerTypeSelector: {
    marginBottom: 15,
  },
  answerFormatSelector: {
    marginBottom: 15,
  },
  imageUploadButton: {
    backgroundColor: "#666",
    padding: 10,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: "center",
  },
  existingQuizzesSection: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
  },
  quizCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  quizHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  quizTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
  },
  deleteQuizButton: {
    backgroundColor: "#FF5A5F",
    padding: 8,
    borderRadius: 5,
  },
  quizInfo: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  questionsContainer: {
    marginTop: 10,
  },
  questionItem: {
    backgroundColor: "#f8f8f8",
    padding: 10,
    borderRadius: 5,
    marginBottom: 8,
  },
  questionNumber: {
    fontWeight: "bold",
    marginBottom: 3,
  },
  questionText: {
    fontSize: 14,
    marginBottom: 3,
  },
  answerText: {
    fontSize: 14,
    color: "#4CAF50",
    fontStyle: "italic",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 10,
  },
  editButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  editButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontFamily: "Poppins-Regular",
  },
});
