import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  get,
  push,
  ref,
  remove,
  serverTimestamp,
  update,
} from "firebase/database";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [existingQuizzes, setExistingQuizzes] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [maxDisplayQuestions, setMaxDisplayQuestions] = useState("20");
  const [autoGenMaxDisplay, setAutoGenMaxDisplay] = useState("20");
  const [viewQuestionsModal, setViewQuestionsModal] = useState(false);
  const [currentQuizQuestions, setCurrentQuizQuestions] = useState<Question[]>(
    []
  );
  const [editMaxDisplayModal, setEditMaxDisplayModal] = useState(false);
  const [currentQuizId, setCurrentQuizId] = useState("");
  const [newMaxDisplay, setNewMaxDisplay] = useState("");

  type TabType = "create" | "auto-generate" | "existing";
  const [activeTab, setActiveTab] = useState<TabType>("create");

  const [autoGenModal, setAutoGenModal] = useState(false);
  const [autoGenLevel, setAutoGenLevel] = useState("");
  const [autoGenCount, setAutoGenCount] = useState("");

  const instructionsText = `Upload an Excel file with these columns:
• Question Text
• Correct Answer
• Explanation (optional)
• Time Limit (optional)`;

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
      // console.error("Error checking admin status:", error);
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
          maxDisplayQuestions: quizData.maxDisplayQuestions || 20,
        });
      });
      setExistingQuizzes(quizzes.reverse());
    } catch (error: any) {
      // console.error("Error fetching quizzes:", error);
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
          if ((quiz as { level: number }).level === levelNum) {
            removePromises.push(remove(ref(database, `quizzes/${key}`)));
          }
        }
        // Wait for all removals to complete
        if (removePromises.length > 0) {
          await Promise.all(removePromises);
        }
      }

      const generatedQuestions: Question[] = [];
      for (let i = 0; i < countNum; i++) {
        generatedQuestions.push(generateMathQuestion(levelNum));
      }

      const pointsPerQuestion = levelNum;
      const totalPoints = countNum * pointsPerQuestion;

      const quizData = {
        level: levelNum,
        points: totalPoints,
        maxDisplayQuestions: parseInt(autoGenMaxDisplay) || 20,
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
        `Generated ${countNum} questions for level ${levelNum}!`
      );

      setAutoGenLevel("");
      setAutoGenCount("");
      fetchExistingQuizzes();
    } catch (error: any) {
      // console.error("Error generating questions:", error);
      Alert.alert("Error", `Failed to generate questions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Function to view questions in modal
  const handleViewQuestions = (questions: Question[]) => {
    setCurrentQuizQuestions(questions);
    setViewQuestionsModal(true);
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
        num1 =
          Math.floor(Math.random() * (upperRangeMax - upperRangeMin + 1)) +
          upperRangeMin;
        num2 =
          Math.floor(Math.random() * (lowerRangeMax - lowerRangeMin + 1)) +
          lowerRangeMin;
        if (num2 < 2) num2 = 2;
        answer = num1 * num2;
        questionText = `${num1} × ${num2}`;
        explanation = `${num1} times ${num2} equals ${answer}.`;
        break;

      case "/":
        const divisor =
          Math.floor(Math.random() * (lowerRangeMax - lowerRangeMin + 1)) +
          lowerRangeMin;
        num2 = divisor < 2 ? 2 : divisor;
        const maxQuotient = Math.floor(upperRangeMax / num2);
        const minQuotient = Math.floor(upperRangeMin / num2);
        answer =
          Math.floor(Math.random() * (maxQuotient - minQuotient + 1)) +
          minQuotient;
        num1 = num2 * answer;
        questionText = `${num1} ÷ ${num2}`;
        explanation = `${num1} divided by ${num2} equals ${answer}.`;
        break;

      default:
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
              // console.error("Error deleting quiz:", error);
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
      // console.error("Error picking file:", err);
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
          // console.error(`Error processing row ${index + 2}:`, rowError);
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
        `Imported ${newQuestions.length} question${
          newQuestions.length > 1 ? "s" : ""
        } from Excel file!`
      );
    } catch (error) {
      // console.error("Error parsing Excel file:", error);

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
      className="bg-white rounded-xl p-4 mb-4 border border-gray-200"
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-base font-medium text-gray-800">
          Question {index + 1}
        </Text>
        <TouchableOpacity
          className="bg-red-50 p-1 rounded"
          onPress={() => removeQuestion(index)}
        >
          <Text className="text-red-500 font-bold text-lg">×</Text>
        </TouchableOpacity>
      </View>

      <View className="space-y-3">
        <View>
          <Text className="text-sm text-gray-600 mb-1">Question Text</Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800"
            placeholder="Enter your question here..."
            value={question.questionText}
            onChangeText={(text) => updateQuestion(index, "questionText", text)}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 60 }}
          />
        </View>

        <View>
          <Text className="text-sm text-gray-600 mb-1">Correct Answer</Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800"
            placeholder="Enter the correct answer"
            value={question.correctAnswer}
            onChangeText={(text) =>
              updateQuestion(index, "correctAnswer", text)
            }
          />
        </View>

        <View>
          <Text className="text-sm text-gray-600 mb-1">
            Explanation (Optional)
          </Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800"
            placeholder="Explain the answer..."
            value={question.explanation}
            onChangeText={(text) => updateQuestion(index, "explanation", text)}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 50 }}
          />
        </View>

        <View>
          <Text className="text-sm text-gray-600 mb-1">
            Time Limit (seconds)
          </Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800"
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
      const levelNum = Number(level);
      const pointsPerQuestion = levelNum;
      const totalPoints = questions.length * pointsPerQuestion;

      const quizData = {
        level: levelNum,
        points: totalPoints,
        maxDisplayQuestions: parseInt(maxDisplayQuestions) || 20,
        questions: questions.map((q) => ({
          questionText: q.questionText,
          correctAnswer: q.correctAnswer,
          answerType: "manual",
          explanation: q.explanation || "",
          point: pointsPerQuestion,
          timeLimit: q.timeLimit || 30,
        })),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      await push(ref(database, "quizzes"), quizData);

      Alert.alert(
        "Success",
        `Quiz created successfully!\nLevel: ${levelNum}\nQuestions: ${questions.length}`
      );
      resetForm();
      fetchExistingQuizzes();
    } catch (error: any) {
      // console.error("Error saving quiz:", error);
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
    const levelNum = Number(level);
    if (isNaN(levelNum)) {
      Alert.alert("Validation Error", "Level must be a number");
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

  const resetForm = () => {
    setLevel("");
    setQuestions([]);
  };

  const handleUpdateMaxDisplay = async () => {
    if (!newMaxDisplay) {
      Alert.alert("Error", "Please enter max display value");
      return;
    }

    const displayNum = parseInt(newMaxDisplay);
    if (isNaN(displayNum) || displayNum < 1) {
      Alert.alert("Error", "Invalid max display value");
      return;
    }

    setLoading(true);
    try {
      const quizRef = ref(database, `quizzes/${currentQuizId}`);
      await update(quizRef, {
        maxDisplayQuestions: displayNum,
        updatedAt: serverTimestamp(),
      });

      Alert.alert("Success", `Max display questions updated to ${displayNum}`);
      fetchExistingQuizzes();
      setEditMaxDisplayModal(false);
    } catch (error) {
      // console.error("Error updating max display:", error);
      Alert.alert("Error", `Failed to update: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openEditMaxDisplay = (quizId: string, currentValue: number) => {
    setCurrentQuizId(quizId);
    setNewMaxDisplay(currentValue.toString());
    setEditMaxDisplayModal(true);
  };

  if (!currentUser) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-gray-600 mt-4 text-base">
          Checking authentication...
        </Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center p-6">
        <View className="bg-white rounded-xl p-6">
          <Text className="text-xl font-bold text-red-500 mb-3 text-center">
            Access Denied
          </Text>
          <Text className="text-gray-600 text-center">
            You need admin privileges to access the question management system.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1 px-4 py-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="bg-white py-4 mb-4 rounded-xl">
          <Text className="text-xl font-bold text-center text-gray-800">
            Quiz Management
          </Text>
        </View>

        {/* Tab Navigation */}
        <View className="flex-row mb-4 bg-white rounded-xl p-1">
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg mx-1 ${
              activeTab === "create" ? "bg-primary" : "bg-gray-100"
            }`}
            onPress={() => setActiveTab("create")}
          >
            <Text
              className={`text-center font-medium ${
                activeTab === "create" ? "text-white" : "text-gray-600"
              }`}
            >
              Create
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg mx-1 ${
              activeTab === "auto-generate" ? "bg-primary" : "bg-gray-100"
            }`}
            onPress={() => setActiveTab("auto-generate")}
          >
            <Text
              className={`text-center font-medium ${
                activeTab === "auto-generate" ? "text-white" : "text-gray-600"
              }`}
            >
              Auto Generate
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg mx-1 ${
              activeTab === "existing" ? "bg-primary" : "bg-gray-100"
            }`}
            onPress={() => setActiveTab("existing")}
          >
            <Text
              className={`text-center font-medium ${
                activeTab === "existing" ? "text-white" : "text-gray-600"
              }`}
            >
              Existing
            </Text>
          </TouchableOpacity>
        </View>

        {/* Create Quiz Tab */}
        {activeTab === "create" && (
          <View className="mb-8">
            <View className="bg-white rounded-xl p-4 mb-4">
              <Text className="text-lg font-bold text-gray-800 mb-3">
                Create New Quiz
              </Text>

              <View className="space-y-4">
                {/* Level Input */}
                <View>
                  <Text className="text-sm text-gray-600 mb-1">Level</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800"
                    placeholder="Enter level"
                    value={level}
                    onChangeText={setLevel}
                    keyboardType="numeric"
                  />
                  <Text className="text-gray-500 text-xs mt-1">
                    Points per question = level value
                  </Text>
                </View>

                {/* Max Display Questions */}
                <View>
                  <Text className="text-sm text-gray-600 mb-1">
                    Max Questions to Display
                  </Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800"
                    placeholder="Enter number (default: 20)"
                    value={maxDisplayQuestions}
                    onChangeText={setMaxDisplayQuestions}
                    keyboardType="numeric"
                  />
                </View>

                {/* Points Summary */}
                <View className="bg-primary/5 p-3 rounded-lg">
                  <Text className="font-medium text-primary mb-1">
                    Quiz Summary
                  </Text>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-primary">Questions:</Text>
                    <Text className="text-primary font-medium">
                      {questions.length}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-primary">Level:</Text>
                    <Text className="text-primary font-medium">
                      {level || "0"}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-primary">Total Points:</Text>
                    <Text className="text-primary font-medium">
                      {questions.length * (level ? parseInt(level) : 0)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Questions Section */}
            <View className="mb-4">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-base font-medium text-gray-800">
                  Questions ({questions.length})
                </Text>
                <TouchableOpacity
                  className="bg-primary py-2 px-3 rounded-lg"
                  onPress={addNewQuestion}
                >
                  <Text className="text-white font-medium">+ Add Question</Text>
                </TouchableOpacity>
              </View>

              {questions.map((question, index) =>
                renderQuestionCard(question, index)
              )}

              {questions.length === 0 && (
                <View className="bg-white rounded-xl p-5 border border-dashed border-gray-300 items-center">
                  <Text className="text-gray-500 text-center">
                    No questions added yet
                  </Text>
                  <Text className="text-gray-400 text-xs mt-1">
                    Tap "Add Question" or import from Excel
                  </Text>
                </View>
              )}
            </View>

            {/* Import Section */}
            <View className="bg-primary/5 rounded-xl p-4 mb-4">
              <Text className="text-xs text-gray-600 mb-2">
                {instructionsText}
              </Text>
              <TouchableOpacity
                className="bg-primary py-3 rounded-lg items-center"
                onPress={pickFile}
              >
                <Text className="text-white font-medium">
                  Import Questions from Excel
                </Text>
              </TouchableOpacity>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              className={`py-3 rounded-lg items-center ${
                loading ? "bg-gray-400" : "bg-green-500"
              }`}
              onPress={handleAddQuiz}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-medium text-base">
                  Submit Quiz
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Auto Generate Tab */}
        {activeTab === "auto-generate" && (
          <View className="bg-white rounded-xl p-4">
            <Text className="text-lg font-bold text-gray-800 mb-3">
              Auto Generate Questions
            </Text>

            <View className="space-y-4">
              <View>
                <Text className="text-sm text-gray-600 mb-1">Level</Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                  placeholder="Enter level"
                  value={autoGenLevel}
                  onChangeText={setAutoGenLevel}
                  keyboardType="numeric"
                />
              </View>

              <View>
                <Text className="text-sm text-gray-600 mb-1">
                  Number of Questions
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                  placeholder="Enter number of questions"
                  value={autoGenCount}
                  onChangeText={setAutoGenCount}
                  keyboardType="numeric"
                />
              </View>

              <View>
                <Text className="text-sm text-gray-600 mb-1">
                  Max Questions to Display
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                  placeholder="Enter number (default: 20)"
                  value={autoGenMaxDisplay}
                  onChangeText={setAutoGenMaxDisplay}
                  keyboardType="numeric"
                />
              </View>

              <View className="bg-primary/5 p-3 rounded-lg">
                <Text className="font-medium text-primary mb-1">Summary</Text>
                <View className="space-y-1">
                  <View className="flex-row justify-between">
                    <Text className="text-primary">Points per question:</Text>
                    <Text className="text-primary font-medium">
                      {autoGenLevel || "0"}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-primary">Total points:</Text>
                    <Text className="text-primary font-medium">
                      {(parseInt(autoGenLevel) || 0) *
                        (parseInt(autoGenCount) || 0)}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                className={`py-3 rounded-lg items-center ${
                  loading ? "bg-gray-400" : "bg-primary"
                }`}
                onPress={handleAutoGenerate}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-medium text-base">
                    Generate Questions
                  </Text>
                )}
              </TouchableOpacity>

              <Text className="text-gray-500 text-xs mt-1">
                Generates math questions (+, -, ×, ÷) with whole number results
              </Text>
            </View>
          </View>
        )}

        {/* Existing Quizzes Tab */}
        {activeTab === "existing" && (
          <View className="mb-8">
            <Text className="text-base font-medium text-gray-800 mb-3">
              Existing Quizzes ({existingQuizzes.length})
            </Text>

            <View className="bg-primary/5 rounded-lg p-3 mb-4">
              <Text className="text-sm text-primary">
                Note: You cannot edit individual questions in existing quizzes.
                Delete the quiz and create a new one or use auto-generate to
                regenerate.
              </Text>
            </View>

            {existingQuizzes.length === 0 ? (
              <View className="bg-white rounded-xl p-5 border border-dashed border-gray-300 items-center">
                <Text className="text-gray-500">No quizzes found</Text>
              </View>
            ) : (
              existingQuizzes.map((quiz) => (
                <View
                  key={quiz.id}
                  className="bg-white rounded-xl p-4 mb-4 border border-gray-200"
                >
                  <View className="flex-row justify-between items-start mb-3">
                    <View>
                      <Text className="text-base font-medium text-gray-800">
                        Level {quiz.level} {quiz.autoGenerated ? "(Auto)" : ""}
                      </Text>
                      <Text className="text-gray-500 text-xs">
                        Created: {new Date(quiz.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  <View className="grid grid-cols-2 gap-2 mb-3">
                    <View className="bg-gray-50 p-2 rounded">
                      <Text className="text-gray-500 text-xs">
                        Total Points
                      </Text>
                      <Text className="font-medium text-sm">{quiz.points}</Text>
                    </View>
                    <View className="bg-gray-50 p-2 rounded">
                      <Text className="text-gray-500 text-xs">Questions</Text>
                      <Text className="font-medium text-sm">
                        {quiz.questions?.length || 0}
                      </Text>
                    </View>
                    <View className="bg-gray-50 p-2 rounded">
                      <Text className="text-gray-500 text-xs">
                        Points per Q
                      </Text>
                      <Text className="font-medium text-sm">{quiz.level}</Text>
                    </View>
                    <View className="bg-gray-50 p-2 rounded">
                      <Text className="text-gray-500 text-xs">Max Display</Text>
                      <Text className="font-medium text-sm">
                        {quiz.maxDisplayQuestions || 20}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between">
                    <TouchableOpacity
                      className="bg-primary py-2 px-3 rounded-lg flex-1 mr-2"
                      onPress={() => handleViewQuestions(quiz.questions)}
                    >
                      <Text className="text-white text-center text-sm">
                        View Questions
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className="bg-gray-500 py-2 px-3 rounded-lg flex-1 mr-2"
                      onPress={() =>
                        openEditMaxDisplay(
                          quiz.id,
                          quiz.maxDisplayQuestions || 20
                        )
                      }
                    >
                      <Text className="text-white text-center text-sm">
                        Edit Max Questions
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className="bg-red-500 py-2 px-3 rounded-lg flex-1"
                      onPress={() => handleDeleteQuiz(quiz.id)}
                    >
                      <Text className="text-white text-center text-sm">
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Questions View Modal */}
      <Modal
        visible={viewQuestionsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setViewQuestionsModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-center p-5">
          <View className="bg-white rounded-xl p-5 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold">Quiz Questions</Text>
              <TouchableOpacity onPress={() => setViewQuestionsModal(false)}>
                <Text className="text-lg text-gray-500">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {currentQuizQuestions.map((q, i) => (
                <View key={i} className="mb-3 pb-3 border-b border-gray-100">
                  <Text className="font-medium mb-1">
                    {i + 1}. {q.questionText}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Max Display Modal */}
      <Modal
        visible={editMaxDisplayModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setEditMaxDisplayModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
          <View className="bg-white rounded-xl p-5 w-full">
            <Text className="text-lg font-bold mb-4 text-center">
              Edit Max Display Questions
            </Text>

            <Text className="text-sm text-gray-600 mb-2">
              Maximum questions to display for this quiz:
            </Text>

            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4"
              placeholder="Enter max display"
              value={newMaxDisplay}
              onChangeText={setNewMaxDisplay}
              keyboardType="numeric"
            />

            <View className="flex-row justify-between">
              <TouchableOpacity
                className="bg-gray-300 py-3 px-4 rounded-lg flex-1 mr-2"
                onPress={() => setEditMaxDisplayModal(false)}
              >
                <Text className="text-gray-800 text-center font-medium">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`py-3 px-4 rounded-lg flex-1 ml-2 ${
                  loading ? "bg-primary/5" : "bg-primary"
                }`}
                onPress={handleUpdateMaxDisplay}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white text-center font-medium">
                    Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
