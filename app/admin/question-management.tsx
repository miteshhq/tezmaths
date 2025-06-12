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
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { RadioButton } from "react-native-paper";
import * as XLSX from "xlsx";
import { auth, database } from "../../firebase/firebaseConfig";

interface Question {
  questionText: string;
  points: number;
  correctAnswer: string;
  explanation?: string;
  timeLimit: number;
  answerType: "manual" | "mcq";
  options?: string;
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
  const scrollViewRef = useRef<ScrollView>(null);

  const instructionsText = `To add multiple questions, upload an Excel file with these exact column headers:
• Question Text (required)
• Answer Type (manual or mcq)
• Options (for MCQ only, comma-separated)
• Correct Answer (required)  
• Explanation (optional)
• Time Limit (optional, in seconds)

Example:
Question Text | Answer Type | Options | Correct Answer | Explanation | Time Limit
What is 2+2? | mcq | 3,4,5,6 | 4 | Basic addition | 30`;

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
        setIsAdmin(false); // Reset isAdmin if permission denied
      } else {
        Alert.alert("Error", "Failed to load quizzes. Please try again.");
      }
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchExistingQuizzes().finally(() => setRefreshing(false));
  }, []);

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
        "answer type",
        "options",
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
            // console.log(`Skipping empty row ${index + 2}`);
            return;
          }

          const questionText =
            row[headerMap["question text"]]?.toString().trim() || "";
          const correctAnswer =
            row[headerMap["correct answer"]]?.toString().trim() || "";

          if (!questionText || !correctAnswer) {
            // console.log(
            //   `Skipping row ${
            //     index + 2
            //   }: missing question text or correct answer`
            // );
            return;
          }

          const answerType = row[headerMap["answer type"]]
            ?.toString()
            .toLowerCase()
            .trim();
          const options = row[headerMap["options"]]?.toString().trim() || "";
          const explanation =
            row[headerMap["explanation"]]?.toString().trim() || "";
          const timeLimit = parseInt(
            row[headerMap["time limit"]]?.toString() || "15"
          );

          const validAnswerType =
            answerType === "mcq" || answerType === "manual"
              ? answerType
              : "manual";

          if (validAnswerType === "mcq" && !options) {
            // console.log(
            //   `Row ${
            //     index + 2
            //   }: MCQ question missing options, defaulting to manual`
            // );
            validAnswerType = "manual";
          }

          const question: Question = {
            questionText,
            points: 0,
            correctAnswer,
            answerType: validAnswerType as "manual" | "mcq",
            explanation,
            timeLimit: isNaN(timeLimit) ? 15 : Math.max(1, timeLimit),
            options: validAnswerType === "mcq" ? options : undefined,
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
      timeLimit: 15,
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

  const renderQuestionForm = (question: Question, index: number) => (
    <View
      key={index}
      className="bg-white p-4 rounded-xl mb-4 border border-gray-200"
    >
      <Text className="text-lg font-bold mb-3 text-black">
        Question {index + 1}
      </Text>
      <View className="mb-4">
        <Text className="text-gray-700 mb-2">Answer Type:</Text>
        <RadioButton.Group
          onValueChange={(value) => updateQuestion(index, "answerType", value)}
          value={question.answerType}
        >
          <View className="flex-row items-center mb-2">
            <RadioButton value="manual" color="#F97316" />
            <Text className="ml-2">Manual Input</Text>
          </View>
          <View className="flex-row items-center">
            <RadioButton value="mcq" color="#F97316" />
            <Text className="ml-2">Multiple Choice</Text>
          </View>
        </RadioButton.Group>
      </View>
      <TextInput
        className="bg-white border border-gray-300 rounded-lg p-3 mb-3"
        placeholder="Question Text"
        value={question.questionText}
        onChangeText={(text) => updateQuestion(index, "questionText", text)}
        multiline
      />
      {question.answerType === "mcq" && (
        <TextInput
          className="bg-white border border-gray-300 rounded-lg p-3 mb-3"
          placeholder="Options (comma-separated)"
          value={question.options}
          onChangeText={(text) => updateQuestion(index, "options", text)}
        />
      )}
      <TextInput
        className="bg-white border border-gray-300 rounded-lg p-3 mb-3"
        placeholder="Correct Answer"
        value={question.correctAnswer}
        onChangeText={(text) => updateQuestion(index, "correctAnswer", text)}
      />
      <TextInput
        className="bg-white border border-gray-300 rounded-lg p-3 mb-3"
        placeholder="Explanation"
        value={question.explanation}
        onChangeText={(text) => updateQuestion(index, "explanation", text)}
        multiline
      />
      <TextInput
        className="bg-white border border-gray-300 rounded-lg p-3 mb-3"
        placeholder="Time Limit (seconds)"
        value={question.timeLimit.toString()}
        keyboardType="numeric"
        onChangeText={(text) =>
          updateQuestion(index, "timeLimit", parseInt(text || "15"))
        }
      />
      <TouchableOpacity
        className="bg-red-500 py-2 px-4 rounded-lg items-center"
        onPress={() => removeQuestion(index)}
      >
        <Text className="text-white font-medium">Delete Question</Text>
      </TouchableOpacity>
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
          answerType: q.answerType || "manual",
          explanation: q.explanation || "",
          point: pointsPerQuestion,
          options:
            q.answerType === "mcq" && q.options
              ? q.options.split(",").map((opt: string) => opt.trim())
              : [],
          timeLimit: q.timeLimit || 15,
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
    if (question.answerType === "mcq") {
      if (!question.options || !question.options.trim()) {
        return false;
      }
      const optionsArray = question.options.split(",").map((opt) => opt.trim());
      if (optionsArray.length < 2) {
        return false;
      }
      const correctAnswerTrimmed = question.correctAnswer.trim().toLowerCase();
      const hasMatchingOption = optionsArray.some(
        (opt) => opt.toLowerCase() === correctAnswerTrimmed
      );
      if (!hasMatchingOption) {
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
              : "")
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
            answerType: q.answerType || "manual",
            explanation: q.explanation || "",
            options: Array.isArray(q.options) ? q.options.join(", ") : "",
            timeLimit: q.timeLimit || 15,
          }))
        : [];

      setLevel(quizData.level?.toString() || "");
      setPoints(quizData.points?.toString() || "");
      setQuestions(formattedQuestions);
      setEditingQuizId(quizId);

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

  if (!currentUser) {
    return (
      <View className="flex-1 bg-custom-gray justify-center items-center">
        <ActivityIndicator size="large" color="#F97316" />
        <Text className="text-gray-600 mt-4">Checking authentication...</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-custom-gray justify-center items-center p-4">
        <Text className="text-xl font-bold text-red-600 mb-4">
          Access Denied
        </Text>
        <Text className="text-gray-600 text-center">
          You need admin privileges to access the question management system.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1 bg-custom-gray p-4"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text className="text-3xl font-bold mb-6 text-center text-black">
        {editingQuizId ? "Edit Quiz" : "Create New Quiz"}
      </Text>
      <TextInput
        className="bg-white border border-gray-300 rounded-lg p-3 mb-4"
        placeholder="Level (1-6)"
        value={level}
        onChangeText={setLevel}
        keyboardType="numeric"
      />
      <TextInput
        className="bg-white border border-gray-300 rounded-lg p-3 mb-6"
        placeholder="Total Points"
        value={points}
        onChangeText={setPoints}
        keyboardType="numeric"
      />
      {questions.map((question, index) => renderQuestionForm(question, index))}
      <View className="mb-4">
        <Text className="text-gray-600 mb-2 text-sm">{instructionsText}</Text>
        <TouchableOpacity
          className="bg-blue-500 py-3 px-6 rounded-xl text-white font-medium items-center"
          onPress={pickFile}
        >
          <Text className="text-white font-medium text-lg">
            Import Questions from Excel
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        className="bg-primary py-3 px-6 rounded-xl text-white font-medium mb-4 items-center"
        onPress={addNewQuestion}
      >
        <Text className="text-white font-medium text-lg">Add Question</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className={`py-3 px-6 rounded-xl text-white font-medium items-center mb-6 ${
          loading ? "bg-gray-400" : "bg-primary"
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
      {editingQuizId && (
        <TouchableOpacity
          className="bg-red-500 py-3 px-6 rounded-xl text-white font-medium mb-6 items-center"
          onPress={resetForm}
        >
          <Text className="text-white font-medium text-lg">Cancel Edit</Text>
        </TouchableOpacity>
      )}
      <View className="mt-10 pt-6 border-t border-gray-200">
        <Text className="text-xl font-semibold text-gray-700 mb-4">
          Existing Quizzes ({existingQuizzes.length})
        </Text>
        {existingQuizzes.length === 0 ? (
          <View className="bg-white p-6 rounded-xl border border-gray-200">
            <Text className="text-gray-600 text-center">No quizzes found</Text>
          </View>
        ) : (
          existingQuizzes.map((quiz) => (
            <View
              key={quiz.id}
              className="bg-white p-4 rounded-xl mb-4 border border-gray-200"
            >
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-lg font-bold flex-1 text-black">
                  {quiz.name}
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="bg-primary py-2 px-4 rounded-lg"
                    onPress={() => handleEditQuiz(quiz.id)}
                  >
                    <Text className="text-white font-medium">Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="bg-red-500 py-2 px-4 rounded-lg"
                    onPress={() => handleDeleteQuiz(quiz.id)}
                  >
                    <Text className="text-white font-medium">Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text className="text-gray-600 mb-1">Level: {quiz.level}</Text>
              <Text className="text-gray-600 mb-1">
                Category: {quiz.category}
              </Text>
              <Text className="text-gray-600 mb-1">
                Total Points: {quiz.points}
              </Text>
              <Text className="text-gray-600 mb-3">
                Questions: {quiz.questions?.length || 0}
              </Text>
              <View>
                {quiz.questions
                  ?.slice(0, 3)
                  .map((question: any, index: number) => (
                    <View
                      key={index}
                      className="bg-gray-100 p-3 rounded-lg mb-2"
                    >
                      <Text className="font-bold mb-1 text-black">
                        Q{index + 1}: {question.questionText}
                      </Text>
                      <Text className="text-green-600">
                        Answer: {question.correctAnswer}
                      </Text>
                      <Text className="text-gray-600 text-sm">
                        Type: {question.answerType} | Time: {question.timeLimit}
                        s
                      </Text>
                    </View>
                  ))}
                {quiz.questions?.length > 3 && (
                  <Text className="text-gray-600 text-center mt-2">
                    ... and {quiz.questions.length - 3} more questions
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
