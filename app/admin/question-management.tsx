import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  get,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
} from "firebase/database";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import * as XLSX from "xlsx";
import { auth, database } from "../../firebase/firebaseConfig";

interface Question {
  questionText: string;
  points: number;
  correctAnswer: string;
  explanation?: string;
  timeLimit: number;
  answerType: "manual";
}

interface QuizConfig {
  level: number;
  displayQuestions?: number;
}

export default function QuestionManagement() {
  const [level, setLevel] = useState("");
  const [points, setPoints] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [existingQuizzes, setExistingQuizzes] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  type TabType = "create" | "auto-generate" | "config" | "existing";
  const [activeTab, setActiveTab] = useState<TabType>("create");

  const [autoGenModal, setAutoGenModal] = useState(false);
  const [configModal, setConfigModal] = useState(false);
  const [autoGenLevel, setAutoGenLevel] = useState("");
  const [autoGenCount, setAutoGenCount] = useState("");
  const [configLevel, setConfigLevel] = useState("");
  const [configDisplayQuestions, setConfigDisplayQuestions] = useState("");
  const scrollViewRef = useRef<ScrollView>(null);

  const instructionsText = `Upload an Excel file with these columns:
• Question Text, Correct Answer, Explanation (optional), Time Limit (optional)`;

  // Authentication state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await checkAdminStatus(user);
      } else {
        setIsAdmin(false);
        setExistingQuizzes([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch quizzes when admin status is confirmed
  useEffect(() => {
    if (isAdmin) {
      fetchExistingQuizzes();
    }
  }, [isAdmin]);

  const checkAdminStatus = async (user: User) => {
    try {
      const tokenResult = await user.getIdTokenResult();
      const adminStatus = tokenResult.claims.admin === true;
      setIsAdmin(adminStatus);
      if (!adminStatus) {
        Alert.alert(
          "Access Denied",
          "Admin privileges required to access this feature"
        );
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
      setIsAdmin(false);
    }
  };

  const fetchExistingQuizzes = async () => {
    try {
      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);
      if (!snapshot.exists()) {
        setExistingQuizzes([]);
        return;
      }
      const quizzes = [];
      snapshot.forEach((childSnapshot) => {
        const quizData = childSnapshot.val();
        quizzes.push({
          id: childSnapshot.key,
          ...quizData,
          questions: Array.isArray(quizData.questions)
            ? quizData.questions
            : [],
        });
      });
      setExistingQuizzes(quizzes.reverse());
    } catch (error: any) {
      console.error("Error fetching quizzes:", error);
      if (error.code === "PERMISSION_DENIED") {
        Alert.alert(
          "Permission Denied",
          "You don't have admin privileges to access quizzes"
        );
        setIsAdmin(false);
      } else {
        Alert.alert("Error", "Failed to load quizzes. Please try again.");
      }
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchExistingQuizzes().finally(() => setRefreshing(false));
  }, []);

  const handleAutoGenerate = async () => {
    if (!autoGenLevel || !autoGenCount) {
      Alert.alert("Error", "Please enter both level and question count");
      return;
    }

    const levelNum = parseInt(autoGenLevel);
    const countNum = parseInt(autoGenCount);

    setLoading(true);
    try {
      // Check if quiz for this level already exists and remove ALL instances
      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);

      if (snapshot.exists()) {
        const quizzes = snapshot.val();
        // Find and remove ALL existing quizzes with same level
        const removePromises = [];
        for (const [key, quiz] of Object.entries(quizzes)) {
          if (quiz.level === levelNum) {
            removePromises.push(remove(ref(database, `quizzes/${key}`)));
          }
        }
        // Wait for all removals to complete
        if (removePromises.length > 0) {
          await Promise.all(removePromises);
          console.log(
            `Removed ${removePromises.length} existing quiz(s) for level ${levelNum}`
          );
        }
      }

      const generatedQuestions: Question[] = [];
      for (let i = 0; i < countNum; i++) {
        generatedQuestions.push(generateMathQuestion(levelNum));
      }

      const pointsPerQuestion = levelNum; // Points equal to level
      const totalPoints = countNum * pointsPerQuestion;

      const quizData = {
        level: levelNum,
        points: totalPoints,
        questions: generatedQuestions.map((q) => ({
          questionText: q.questionText,
          correctAnswer: q.correctAnswer,
          answerType: "manual",
          explanation: q.explanation || "",
          point: pointsPerQuestion,
          timeLimit: q.timeLimit || 30,
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        autoGenerated: true,
      };

      await push(ref(database, "quizzes"), quizData);

      Alert.alert(
        "Success",
        `Successfully generated ${countNum} questions for level ${levelNum}! Each question worth ${pointsPerQuestion} points.`
      );

      setAutoGenModal(false);
      setAutoGenLevel("");
      setAutoGenCount("");
      fetchExistingQuizzes();
    } catch (error: any) {
      console.error("Error generating questions:", error);
      Alert.alert("Error", `Failed to generate questions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateMathQuestion = (level: number): Question => {
    const operations = ["+", "-", "*", "/"];
    const operation = operations[Math.floor(Math.random() * operations.length)];

    // Define number ranges: 0 to (level × 50)
    const minNum = 0;
    const maxNum = level * 50;

    // Define upper range (70-100% of max) and lower range (10-40% of max) for strategic operand selection
    const upperRangeMin = Math.floor(maxNum * 0.7);
    const upperRangeMax = maxNum;
    const lowerRangeMin = Math.floor(maxNum * 0.01);
    const lowerRangeMax = Math.floor(maxNum * 0.05);

    let num1, num2, answer, questionText, explanation;

    switch (operation) {
      case "+":
        // Both operands near upper range for challenging addition
        num1 =
          Math.floor(Math.random() * (upperRangeMax - upperRangeMin + 1)) +
          upperRangeMin;
        num2 =
          Math.floor(Math.random() * (upperRangeMax - upperRangeMin + 1)) +
          upperRangeMin;
        answer = num1 + num2;
        questionText = `${num1} + ${num2}`;
        explanation = `${num1} plus ${num2} equals ${answer}.`;
        break;

      case "-":
        // Both operands near upper range, ensure positive result
        num1 =
          Math.floor(Math.random() * (upperRangeMax - upperRangeMin + 1)) +
          upperRangeMin;
        num2 =
          Math.floor(Math.random() * (num1 - lowerRangeMin + 1)) +
          lowerRangeMin;
        answer = num1 - num2;
        questionText = `${num1} - ${num2}`;
        explanation = `${num1} minus ${num2} equals ${answer}.`;
        break;

      case "*":
        // First operand near upper range, second operand near lower range
        num1 =
          Math.floor(Math.random() * (upperRangeMax - upperRangeMin + 1)) +
          upperRangeMin;
        num2 =
          Math.floor(Math.random() * (lowerRangeMax - lowerRangeMin + 1)) +
          lowerRangeMin;
        // Ensure second operand is at least 2 for meaningful multiplication
        if (num2 < 2) num2 = 2;
        answer = num1 * num2;
        questionText = `${num1} × ${num2}`;
        explanation = `${num1} times ${num2} equals ${answer}.`;
        break;

      case "/":
        // First operand (dividend) near upper range, second operand (divisor) near lower range
        const divisor =
          Math.floor(Math.random() * (lowerRangeMax - lowerRangeMin + 1)) +
          lowerRangeMin;
        // Ensure divisor is at least 2
        num2 = divisor < 2 ? 2 : divisor;

        // Calculate quotient in a reasonable range, then multiply to get exact dividend
        const maxQuotient = Math.floor(upperRangeMax / num2);
        const minQuotient = Math.floor(upperRangeMin / num2);
        answer =
          Math.floor(Math.random() * (maxQuotient - minQuotient + 1)) +
          minQuotient;
        num1 = num2 * answer; // This ensures whole number result

        questionText = `${num1} ÷ ${num2}`;
        explanation = `${num1} divided by ${num2} equals ${answer}.`;
        break;

      default:
        // Fallback to addition
        num1 =
          Math.floor(Math.random() * (upperRangeMax - upperRangeMin + 1)) +
          upperRangeMin;
        num2 =
          Math.floor(Math.random() * (upperRangeMax - upperRangeMin + 1)) +
          upperRangeMin;
        answer = num1 + num2;
        questionText = `${num1} + ${num2}`;
        explanation = `${num1} plus ${num2} equals ${answer}.`;
    }

    return {
      questionText,
      correctAnswer: answer.toString(),
      answerType: "manual",
      explanation,
      timeLimit: 30,
      points: 0,
    };
  };

  const handleUpdateDisplayConfig = async () => {
    if (!configLevel || !configDisplayQuestions) {
      Alert.alert(
        "Error",
        "Please enter both level and display questions count"
      );
      return;
    }

    const levelNum = parseInt(configLevel);
    const displayNum = parseInt(configDisplayQuestions);

    if (levelNum < 1 || levelNum > 10 || displayNum < 1) {
      Alert.alert("Error", "Invalid level or display questions count");
      return;
    }

    setLoading(true);
    try {
      // Get all quizzes for the specified level
      const quizzesRef = ref(database, "quizzes");
      const snapshot = await get(quizzesRef);

      if (snapshot.exists()) {
        const quizzes = snapshot.val();
        let updatedCount = 0;

        // Find quizzes with matching level and add maxDisplayQuestions
        for (const quizId of Object.keys(quizzes)) {
          const quiz = quizzes[quizId];
          if (quiz.level === levelNum) {
            // Update the specific quiz with new property
            const quizRef = ref(database, `quizzes/${quizId}`);
            await set(quizRef, {
              ...quiz, // Keep all existing properties
              maxDisplayQuestions: displayNum,
              updatedAt: serverTimestamp(),
            });
            updatedCount++;
          }
        }

        if (updatedCount === 0) {
          Alert.alert("Info", `No quizzes found for level ${levelNum}`);
          return;
        }

        Alert.alert(
          "Success",
          `Added maxDisplayQuestions (${displayNum}) to ${updatedCount} quizzes at level ${levelNum}`
        );
      } else {
        Alert.alert("Error", "No quizzes found in database");
      }

      setConfigModal(false);
      setConfigLevel("");
      setConfigDisplayQuestions("");
    } catch (error) {
      console.error("Error updating config:", error);
      Alert.alert("Error", `Failed to update config: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!currentUser || !isAdmin) {
      Alert.alert("Error", "Admin authentication required");
      return;
    }

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
              await fetchExistingQuizzes();
              Alert.alert("Success", "Quiz deleted successfully");
            } catch (error: any) {
              console.error("Error deleting quiz:", error);
              Alert.alert("Error", `Failed to delete quiz: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        await parseExcelFile(file.uri);
      }
    } catch (err) {
      console.error("Error picking file:", err);
      Alert.alert("Error", "Failed to pick Excel file. Please try again.");
    }
  };

  const parseExcelFile = async (uri: string) => {
    try {
      const fileContent = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!fileContent) {
        throw new Error("File content is empty");
      }

      const workbook = XLSX.read(fileContent, {
        type: "base64",
        cellDates: true,
        cellNF: false,
        cellText: false,
      });

      if (workbook.SheetNames.length === 0) {
        throw new Error("No sheets found in the Excel file");
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      if (jsonData.length < 2) {
        throw new Error(
          "Excel file must contain at least a header row and one data row"
        );
      }

      const headers = jsonData[0] as string[];
      const expectedHeaders = [
        "question text",
        "correct answer",
        "explanation",
        "time limit",
      ];

      const headerMap: { [key: string]: number } = {};
      expectedHeaders.forEach((expectedHeader) => {
        const matchingIndex = headers.findIndex(
          (header) =>
            header.toLowerCase().trim() === expectedHeader.toLowerCase()
        );
        if (matchingIndex !== -1) {
          headerMap[expectedHeader] = matchingIndex;
        }
      });

      const requiredHeaders = ["question text", "correct answer"];
      const missingHeaders = requiredHeaders.filter(
        (header) => !(header in headerMap)
      );

      if (missingHeaders.length > 0) {
        throw new Error(
          `Missing required columns: ${missingHeaders.join(", ")}\n\n` +
            `Expected columns: ${expectedHeaders.join(", ")}\n` +
            `Found columns: ${headers.join(", ")}`
        );
      }

      const dataRows = jsonData.slice(1) as any[][];
      const newQuestions: Question[] = [];

      dataRows.forEach((row, index) => {
        try {
          if (
            !row ||
            row.every((cell) => !cell || cell.toString().trim() === "")
          ) {
            return;
          }

          const questionText =
            row[headerMap["question text"]]?.toString().trim() || "";
          const correctAnswer =
            row[headerMap["correct answer"]]?.toString().trim() || "";

          if (!questionText || !correctAnswer) {
            return;
          }

          const explanation =
            row[headerMap["explanation"]]?.toString().trim() || "";
          const timeLimit = parseInt(
            row[headerMap["time limit"]]?.toString() || "30"
          );

          const question: Question = {
            questionText,
            points: 0,
            correctAnswer,
            answerType: "manual",
            explanation,
            timeLimit: isNaN(timeLimit) ? 30 : Math.max(1, timeLimit),
          };

          newQuestions.push(question);
        } catch (rowError) {
          console.error(`Error processing row ${index + 2}:`, rowError);
        }
      });

      if (newQuestions.length === 0) {
        throw new Error(
          "No valid questions found in the Excel file. Please check your data format."
        );
      }

      setQuestions((prev) => [...prev, ...newQuestions]);

      Alert.alert(
        "Success",
        `Successfully imported ${newQuestions.length} question${
          newQuestions.length > 1 ? "s" : ""
        } from Excel file!`
      );
    } catch (error) {
      console.error("Error parsing Excel file:", error);

      let errorMessage = "Failed to parse Excel file. ";
      if (error instanceof Error) {
        errorMessage += error.message;
      } else {
        errorMessage += "Please check the file format and try again.";
      }
      Alert.alert("Import Error", errorMessage);
    }
  };

  const addNewQuestion = () => {
    const newQuestion: Question = {
      questionText: "",
      points: 0,
      correctAnswer: "",
      answerType: "manual",
      explanation: "",
      timeLimit: 30,
    };
    setQuestions((prevQuestions) => [...prevQuestions, newQuestion]);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    setQuestions((prevQuestions) => {
      const updatedQuestions = [...prevQuestions];
      updatedQuestions[index] = {
        ...updatedQuestions[index],
        [field]: value,
      };
      return updatedQuestions;
    });
  };

  const renderQuestionCard = (question: Question, index: number) => (
    <View
      key={index}
      className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100"
    >
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-bold text-gray-800">
          Question {index + 1}
        </Text>
        <TouchableOpacity
          className="bg-red-50 p-2 rounded-full"
          onPress={() => removeQuestion(index)}
        >
          <Text className="text-red-500 font-bold text-lg">×</Text>
        </TouchableOpacity>
      </View>

      <View className="space-y-4">
        <View>
          <Text className="text-sm font-medium text-gray-700 mb-2">
            Question Text
          </Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800"
            placeholder="Enter your question here..."
            value={question.questionText}
            onChangeText={(text) => updateQuestion(index, "questionText", text)}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 60 }}
          />
        </View>

        <View>
          <Text className="text-sm font-medium text-gray-700 mb-2">
            Correct Answer
          </Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800"
            placeholder="Enter the correct answer"
            value={question.correctAnswer}
            onChangeText={(text) =>
              updateQuestion(index, "correctAnswer", text)
            }
          />
        </View>

        <View>
          <Text className="text-sm font-medium text-gray-700 mb-2">
            Explanation (Optional)
          </Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800"
            placeholder="Explain the answer..."
            value={question.explanation}
            onChangeText={(text) => updateQuestion(index, "explanation", text)}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 50 }}
          />
        </View>

        <View>
          <Text className="text-sm font-medium text-gray-700 mb-2">
            Time Limit (seconds)
          </Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800"
            placeholder="30"
            value={question.timeLimit.toString()}
            keyboardType="numeric"
            onChangeText={(text) =>
              updateQuestion(index, "timeLimit", parseInt(text || "30"))
            }
          />
        </View>
      </View>
    </View>
  );

  const removeQuestion = (index: number) => {
    setQuestions((prevQuestions) =>
      prevQuestions.filter((_, i) => i !== index)
    );
  };

  const handleAddQuiz = async () => {
    if (!currentUser || !isAdmin) {
      Alert.alert("Error", "Admin authentication required");
      return;
    }

    if (!areQuizFieldsValid() || !areQuestionsValid()) return;

    setLoading(true);
    try {
      const numQuestions = questions.length;
      const totalPoints = parseInt(points);
      const pointsPerQuestion =
        numQuestions > 0 ? totalPoints / numQuestions : 0;

      const quizData = {
        level: Number(level),
        points: totalPoints,
        questions: questions.map((q) => ({
          questionText: q.questionText,
          correctAnswer: q.correctAnswer,
          answerType: "manual",
          explanation: q.explanation || "",
          point: pointsPerQuestion,
          timeLimit: q.timeLimit || 30,
        })),
        updatedAt: serverTimestamp(),
      };

      if (!editingQuizId) {
        quizData.createdAt = serverTimestamp();
        await push(ref(database, "quizzes"), quizData);
      } else {
        const quizRef = ref(database, `quizzes/${editingQuizId}`);
        await set(quizRef, quizData);
      }

      Alert.alert(
        "Success",
        `Quiz ${editingQuizId ? "updated" : "added"} successfully!`
      );
      resetForm();
      fetchExistingQuizzes();
    } catch (error: any) {
      console.error("Error saving quiz:", error);
      Alert.alert("Error", `Failed to save quiz: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const areQuizFieldsValid = () => {
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

  const validateQuestionFields = (question: Question) => {
    if (!question.questionText.trim()) {
      return false;
    }
    if (!question.correctAnswer.trim()) {
      return false;
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
            "- Correct answer is required"
        );
        return false;
      }
    }
    return true;
  };

  const handleEditQuiz = async (quizId: string) => {
    if (!currentUser || !isAdmin) {
      Alert.alert("Error", "Admin authentication required");
      return;
    }

    try {
      const quizRef = ref(database, `quizzes/${quizId}`);
      const snapshot = await get(quizRef);

      if (!snapshot.exists()) {
        throw new Error("Quiz not found");
      }

      const quizData = snapshot.val();

      const formattedQuestions = Array.isArray(quizData.questions)
        ? quizData.questions.map((q: any) => ({
            questionText: q.questionText || "",
            points: q.point || 0,
            correctAnswer: q.correctAnswer || "",
            answerType: "manual" as const,
            explanation: q.explanation || "",
            timeLimit: q.timeLimit || 30,
          }))
        : [];

      setLevel(quizData.level?.toString() || "");
      setPoints(quizData.points?.toString() || "");
      setQuestions(formattedQuestions);
      setEditingQuizId(quizId);
      setActiveTab("create");

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }, 100);
    } catch (error: any) {
      console.error("Error loading quiz for edit:", error);
      Alert.alert("Error", `Failed to load quiz for editing: ${error.message}`);
    }
  };

  const resetForm = () => {
    setLevel("");
    setPoints("");
    setQuestions([]);
    setEditingQuizId(null);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // Remove the renderTabButton function entirely and replace with:
  const TabButton = ({
    tab,
    title,
    icon,
    isActive,
    onPress,
  }: {
    tab: TabType;
    title: string;
    icon: string;
    isActive: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      className={`flex-1 py-3 px-4 rounded-xl mx-1 ${
        isActive ? "bg-orange-500 shadow-lg" : "bg-white border border-gray-200"
      }`}
      onPress={onPress}
    >
      <Text
        className={`text-center font-medium ${
          isActive ? "text-white" : "text-gray-600"
        }`}
      >
        {icon} {title}
      </Text>
    </TouchableOpacity>
  );

  if (!currentUser) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <ActivityIndicator size="large" color="#F97316" />
        <Text className="text-gray-600 mt-4 text-lg">
          Checking authentication...
        </Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center p-6">
        <View className="bg-white rounded-3xl p-8 shadow-lg">
          <Text className="text-2xl font-bold text-red-500 mb-4 text-center">
            🚫 Access Denied
          </Text>
          <Text className="text-gray-600 text-center text-lg">
            You need admin privileges to access the question management system.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}

      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-3 py-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="bg-white pt-12 pb-6 px-2 shadow-sm rounded-2xl mb-4">
          <Text className="text-3xl font-bold text-center text-gray-800 mb-6">
            📚 Quiz Management
          </Text>

          {/* Tab Navigation */}
          <View className="flex-row">
            <TabButton
              tab="create"
              title="Create"
              icon="✏️"
              isActive={activeTab === "create"}
              onPress={() => setActiveTab("create")}
            />
            <TabButton
              tab="auto-generate"
              title="Auto Gen"
              icon="🤖"
              isActive={activeTab === "auto-generate"}
              onPress={() => setActiveTab("auto-generate")}
            />
            <TabButton
              tab="config"
              title="Config"
              icon="⚙️"
              isActive={activeTab === "config"}
              onPress={() => setActiveTab("config")}
            />
            <TabButton
              tab="existing"
              title="Existing"
              icon="📋"
              isActive={activeTab === "existing"}
              onPress={() => setActiveTab("existing")}
            />
          </View>
        </View>

        {/* Create Quiz Tab */}
        {activeTab === "create" && (
          <View>
            <View className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
              <Text className="text-xl font-bold text-gray-800 mb-4">
                {editingQuizId ? "✏️ Edit Quiz" : "➕ Create New Quiz"}
              </Text>

              <View className="space-y-4">
                <View>
                  <Text className="text-sm font-medium text-gray-700 mb-2">
                    Level
                  </Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 text-lg"
                    placeholder="Enter level"
                    value={level}
                    onChangeText={setLevel}
                    keyboardType="numeric"
                  />
                </View>

                <View>
                  <Text className="text-sm font-medium text-gray-700 mb-2">
                    Total Points
                  </Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 text-lg"
                    placeholder="Enter total points"
                    value={points}
                    onChangeText={setPoints}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {editingQuizId && (
                <TouchableOpacity
                  className="bg-gray-100 py-3 px-4 rounded-xl mt-4"
                  onPress={resetForm}
                >
                  <Text className="text-gray-600 font-medium text-center">
                    Cancel Edit
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Questions Section */}
            <View className="mb-6">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xl font-bold text-gray-800">
                  Questions ({questions.length})
                </Text>
                <TouchableOpacity
                  className="bg-orange-500 py-2 px-4 rounded-xl"
                  onPress={addNewQuestion}
                >
                  <Text className="text-white font-medium">+ Add Question</Text>
                </TouchableOpacity>
              </View>

              {questions.map((question, index) =>
                renderQuestionCard(question, index)
              )}

              {questions.length === 0 && (
                <View className="bg-white rounded-2xl p-8 border-2 border-dashed border-gray-200">
                  <Text className="text-gray-500 text-center text-lg">
                    No questions added yet
                  </Text>
                  <Text className="text-gray-400 text-center mt-2">
                    Tap "Add Question" or import from Excel
                  </Text>
                </View>
              )}
            </View>

            {/* Import Section */}
            <View className="bg-blue-50 rounded-2xl p-6 mb-6">
              <Text className="text-sm text-gray-700 mb-4">
                {instructionsText}
              </Text>
              <TouchableOpacity
                className="bg-blue-500 py-3 px-6 rounded-xl items-center"
                onPress={pickFile}
              >
                <Text className="text-white font-medium text-lg">
                  Import Questions from Excel
                </Text>
              </TouchableOpacity>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              className={`py-4 px-6 rounded-xl items-center mb-8 ${
                loading ? "bg-gray-400" : "bg-green-500"
              }`}
              onPress={handleAddQuiz}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-medium text-lg">
                  {editingQuizId ? "Update Quiz" : "Submit Quiz"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Auto Generate Tab */}
        {activeTab === "auto-generate" && (
          <View className="bg-white rounded-2xl p-6">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              🤖 Auto Generate Questions
            </Text>

            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-2">
                  Level
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 text-lg"
                  placeholder="Enter level"
                  value={autoGenLevel}
                  onChangeText={setAutoGenLevel}
                  keyboardType="numeric"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mt-4 mb-2">
                  Number of Questions
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 text-lg"
                  placeholder="Enter number of questions to generate"
                  value={autoGenCount}
                  onChangeText={setAutoGenCount}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity
                className={`py-2 px-6 mt-2 rounded-xl items-center ${
                  loading ? "bg-gray-400" : "bg-orange-500"
                }`}
                onPress={handleAutoGenerate}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-medium text-lg">
                    Generate Questions
                  </Text>
                )}
              </TouchableOpacity>

              <Text className="text-gray-500 text-sm mt-4">
                This will generate math questions (+, -, ×, ÷) with whole number
                results. Questions will be automatically saved to the database.
              </Text>
            </View>
          </View>
        )}

        {/* Config Tab */}
        {activeTab === "config" && (
          <View className="bg-white rounded-2xl p-6">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              ⚙️ Quiz Configuration
            </Text>

            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-2">
                  Level
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 text-lg"
                  placeholder="Enter level"
                  value={configLevel}
                  onChangeText={setConfigLevel}
                  keyboardType="numeric"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-2">
                  Questions to Display
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 text-lg"
                  placeholder="Enter number of questions"
                  value={configDisplayQuestions}
                  onChangeText={setConfigDisplayQuestions}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity
                className={`py-4 px-6 rounded-xl items-center ${
                  loading ? "bg-gray-400" : "bg-blue-500"
                }`}
                onPress={handleUpdateDisplayConfig}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-medium text-lg">
                    Save Configuration
                  </Text>
                )}
              </TouchableOpacity>

              <Text className="text-gray-500 text-sm mt-4">
                This sets how many questions will be shown to users for each
                quiz level.
              </Text>
            </View>
          </View>
        )}

        {/* Existing Quizzes Tab */}
        {activeTab === "existing" && (
          <View className="mb-8">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              📋 Existing Quizzes ({existingQuizzes.length})
            </Text>

            {existingQuizzes.length === 0 ? (
              <View className="bg-white rounded-2xl p-8 border-2 border-dashed border-gray-200">
                <Text className="text-gray-500 text-center text-lg">
                  No quizzes found
                </Text>
              </View>
            ) : (
              existingQuizzes.map((quiz) => (
                <View
                  key={quiz.id}
                  className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100"
                >
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-lg font-bold text-gray-800">
                      Level {quiz.level} {quiz.autoGenerated ? "(Auto)" : ""}
                    </Text>
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        className="bg-blue-100 p-2 rounded-lg"
                        onPress={() => handleEditQuiz(quiz.id)}
                      >
                        <Text className="text-blue-600 font-medium">Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="bg-red-100 p-2 rounded-lg"
                        onPress={() => handleDeleteQuiz(quiz.id)}
                      >
                        <Text className="text-red-600 font-medium">Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text className="text-gray-600 mb-2">
                    Points: {quiz.points} | Questions:{" "}
                    {quiz.questions?.length || 0}
                  </Text>

                  <View className="mt-3">
                    <Text className="font-medium text-gray-700 mb-1">
                      Sample Questions:
                    </Text>
                    {quiz.questions?.slice(0, 2).map((q: any, idx: number) => (
                      <Text
                        key={idx}
                        className="text-gray-600 mb-1"
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {idx + 1}. {q.questionText}
                      </Text>
                    ))}
                    {quiz.questions?.length > 2 && (
                      <Text className="text-gray-500">
                        + {quiz.questions.length - 2} more...
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
