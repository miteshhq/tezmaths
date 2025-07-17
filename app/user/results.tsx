import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system"; // Add this import
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  Share
} from "react-native";
import * as Sharing from 'expo-sharing';
import ViewShot from "react-native-view-shot";
import SoundManager from "../../components/soundManager";
// Import logo as a module declaration instead of direct import
const logo = require("../../assets/branding/tezmaths-full-logo.png");



const shareConfig = {
  additionalText:
    "🧮 Discover TezMaths - the ultimate free math-boosting app! Features multiple quizzes, proven tricks, comprehensive guides, and so much more to supercharge your mathematical skills! 🚀",
  playStoreLink:
    "https://play.google.com/store/apps/details?id=com.tezmathsteam.tezmaths",
  downloadText:
    "📲 Download TezMaths now and unlock your mathematical potential!",
  hashtags:
    "#TezMaths #MathQuiz #BrainTraining #Education #MathSkills #LearningApp #FreeApp",
};

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  // Fix useRef with proper type annotations
  const cardRef = useRef<View>(null);
  const viewShotRef = useRef<ViewShot>(null);
  const [userData, setUserData] = useState({ username: "player" });

  const [isPopupVisible, setPopupVisible] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Fix parameter parsing by ensuring they're strings
  const totalGameTimeMs =
    Number.parseInt(
      Array.isArray(params.totalGameTime)
        ? params.totalGameTime[0]
        : params.totalGameTime || "0"
    ) || 0;
  const quizScore =
    Number.parseInt(
      Array.isArray(params.quizScore)
        ? params.quizScore[0]
        : params.quizScore || "0"
    ) || 0;
  const correctAnswers =
    Number.parseInt(
      Array.isArray(params.correctAnswers)
        ? params.correctAnswers[0]
        : params.correctAnswers || "0"
    ) || 0;
  const totalQuestions =
    Number.parseInt(
      Array.isArray(params.totalQuestions)
        ? params.totalQuestions[0]
        : params.totalQuestions || "1"
    ) || 1;
  const currentLevel =
    Number.parseInt(
      Array.isArray(params.currentLevel)
        ? params.currentLevel[0]
        : params.currentLevel || "1"
    ) || 1;
  const username = Array.isArray(params.username)
    ? params.username[0]
    : params.username || "player";
  const fullname = Array.isArray(params.fullname)
    ? params.fullname[0]
    : params.fullname || "Player";
  const avatar = Array.isArray(params.avatar)
    ? params.avatar[0]
    : params.avatar || "0";
  const isPassed = Array.isArray(params.isPassed)
    ? params.isPassed[0]
    : params.isPassed;

  const percentage = Math.round((correctAnswers / totalQuestions) * 100);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const cachedData = await AsyncStorage.getItem("userData");
        if (cachedData) {
          const data = JSON.parse(cachedData);
          setUserData(data);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };
    loadUserData();
  }, []);

  // Play victory or failure sound when screen is focused
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const playResultSound = async () => {
        try {
          if (quizScore > 0) {
            await SoundManager.playSound("victorySoundEffect");
          } else {
            await SoundManager.playSound("failSoundEffect");
          }
        } catch (error) {
          //   console.error("Error playing result sound:", error);
        }
      };
      playResultSound();

      return () => {
        if (active) {
          if (isPassed) {
            SoundManager.stopSound("victorySoundEffect").catch(console.error);
          } else {
            SoundManager.stopSound("failSoundEffect").catch(console.error);
          }
          active = false;
        }
      };
    }, [isPassed, quizScore])
  );

  // Motivational quotes based on performance
  const motivationalQuotes = [
    "Your brain is faster than you think!",
    "Math mastery is within your reach!",
    "Every problem solved makes you stronger!",
    "Persistence turns failure into achievement!",
    "Math is not about numbers, but understanding!",
  ];

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours >= 1) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes >= 1) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getMotivationalQuote = () => {
    if (percentage >= 90) return motivationalQuotes[0];
    if (percentage >= 75) return motivationalQuotes[1];
    if (percentage >= 60) return motivationalQuotes[2];
    if (percentage >= 50) return motivationalQuotes[3];
    return motivationalQuotes[4];
  };

  const getShareMessage = () => {
    const shareMessage = `${shareConfig.additionalText}
      
      🏆 I scored total ${quizScore} points on TezMaths Quiz!
      "${getMotivationalQuote()}"
      
      🎯 Use my referral code: ${userData.username.toUpperCase()}
      👆 Get bonus points when you sign up!
      
      ${shareConfig.playStoreLink}
      
      ${shareConfig.downloadText}
      
      ${shareConfig.hashtags}`;

    return shareMessage;
  };
  const avatarImages = (avatar: string) => {
    switch (avatar) {
      case "0":
        return require("../../assets/avatars/avatar1.jpg");
      case "1":
        return require("../../assets/avatars/avatar2.jpg");
      case "2":
        return require("../../assets/avatars/avatar3.jpg");
      case "3":
        return require("../../assets/avatars/avatar4.jpg");
      case "4":
        return require("../../assets/avatars/avatar5.jpg");
      case "5":
        return require("../../assets/avatars/avatar6.jpg");
      default:
        return require("../../assets/avatars/avatar1.jpg");
    }
  };
  const generateShareUrl = () => {
  return 'https://tezmaths.app/result?username=aryan';
};


  
  // const ShareComponent: React.FC = () => {
// const shareImageAndText = async () => {
//   setIsSharing(true);

//   try {
//     // Capture the image from ViewShot
//     if (!viewShotRef.current) throw new Error("ViewShot ref not available");
//     const uri = await viewShotRef.current.capture();

//     // Save image to file system
//     const timestamp = Date.now();
//     const newUri = `${FileSystem.documentDirectory}tezmaths_result_${timestamp}.jpg`;
//     await FileSystem.copyAsync({ from: uri, to: newUri });

//     const message = getShareMessage();

//     if (Platform.OS === 'android') {
//       // Share image + text together on Android
//       await Share.share({
//         title: "Check this out!",
//         message: message,
//         url: newUri,
//       });
//     } else if (await Sharing.isAvailableAsync()) {
//       // On iOS, share image first
//       await Sharing.shareAsync(newUri, {
//         dialogTitle: "Share your result!",
//         mimeType: "image/jpeg",
//       });

//       // Then optionally share text separately
//       await Share.share({ message });
//     } else {
//       Alert.alert("Sharing not available on this device");
//     }

//   } catch (error: any) {
//     Alert.alert("Sharing failed", error.message || "Something went wrong.");
//     console.error("Share error:", error);
//   } finally {
//     setIsSharing(false);
//     setPopupVisible(false);
//   }
// };

  const shareImage = async () => {
    setIsSharing(true);
    try {
      const newUri = await captureImage();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri);
      } else {
        await Share.share({ url: newUri });
      }
    } catch (error) {
      console.error("Error sharing image:", error);
      Alert.alert("Error", "Couldn't share image. Please try again.");
    } finally {
      setIsSharing(false);
      setPopupVisible(false);
    }
  };

  // Share only the text
  const shareText = async () => {
    setIsSharing(true);
    try {
      const shareMessage = getShareMessage();
      await Share.share({ message: shareMessage });
    } catch (error) {
      console.error("Error sharing text:", error);
    } finally {
      setIsSharing(false);
      setPopupVisible(false);
    }
  };

  const captureImage = async () => {
    // Add null check for viewShotRef
    if (!viewShotRef.current) {
      throw new Error("ViewShot ref is not available");
    }

    const uri = await viewShotRef.current.capture();

    const timestamp = Date.now();
    const newUri = `${FileSystem.documentDirectory}tezmaths_result_${timestamp}.png`;

    await FileSystem.copyAsync({ from: uri, to: newUri });
    return newUri;
  };

  const handleShare = () => {
    setPopupVisible(true);
  };

  

  return (
    <ScrollView
      className="bg-white"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-1 bg-white justify-center items-center p-4">
        {/* Shareable Card wrapped in ViewShot */}
        <ViewShot
          ref={viewShotRef}
          options={{
            format: "png",
            quality: 0.9,
            result: "tmpfile",
            snapshotContentContainer: false,
          }}
          style={{ backgroundColor: "white" }} // Ensure white background
        >
          <View
            ref={cardRef}
            collapsable={false}
            className="bg-custom-gray border-4 border-white p-4 rounded-3xl shadow-xl w-full"
            style={{
              // Add explicit styling to ensure proper rendering in screenshot
              backgroundColor: "#f5f5f5", // or whatever your custom-gray color is
            }}
          >
            <View className="items-center mb-6">
              <Text className="text-2xl font-bold text-gray-500">
                @{username}
              </Text>
            </View>

            <View className="rounded-full h-40 w-40 border-4 border-primary bg-white overflow-hidden mx-auto">
              <Image
                source={avatarImages(avatar)}
                style={{ width: "100%", height: "100%" }}
              />
            </View>

            <View className="items-center mb-6">
              <Text className="text-4xl text-center mt-4 font-black uppercase text-primary">
                {fullname}
              </Text>
            </View>

            <Text className="text-2xl font-bold text-center text-black mb-4">
              {getMotivationalQuote()}
            </Text>
            <Text className="text-3xl font-black text-center text-black mb-1">
              Score: {quizScore}
            </Text>

            <Text className="text-primary text-base font-medium text-center mb-2">
              Time Spent: {formatTime(totalGameTimeMs)}
            </Text>

            <Text className="text-2xl mt-2 mb-2 font-black text-center text-white py-2 px-4 mx-auto bg-primary rounded-xl">
              Download Now
            </Text>

            <View className="items-center mb-8 mt-3">
              <Image source={logo} style={{ height: 30, width: 140 }} />

              <Text className="text-black text-center">
                Sharpen your speed, master your math!
              </Text>
            </View>
          </View>
        </ViewShot>

        {/* Action Buttons */}
        <View className="flex-row justify-between mt-6 w-full max-w-md">
          <TouchableOpacity
            className="py-3 px-6 flex-1 mr-1 border border-black rounded-full"
            onPress={() =>
              router.push({
                pathname: "/user/home",
              })
            }
          >
            <View className="flex flex-row items-center justify-center gap-2">
              <Text className="font-black text-2xl text-center">Home</Text>
              <Image
                source={require("../../assets/icons/home.png")}
                style={{ width: 20, height: 20 }}
                tintColor={"#FF6B35"}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            className="py-3 px-6 flex-1 ml-1 border border-black rounded-full"
            onPress={handleShare}
            disabled={isSharing}
          >
            {isSharing ? (
              <ActivityIndicator color="#FF6B35" />
            ) : (
              <View className="flex flex-row items-center justify-center gap-2">
                <Text className="font-black text-2xl text-center">Share</Text>
                <Image
                  source={require("../../assets/icons/share.png")}
                  style={{ width: 20, height: 20 }}
                  tintColor={"#FF6B35"}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text className="text-primary text-sm mt-3">
          TezMaths - Sharpen Your Speed
        </Text>
      </View>

      {/* Share Options Popup */}
      <Modal
        visible={isPopupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPopupVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Share Your Results</Text>
            <TouchableOpacity
            style= {styles.optionButton}
            onPress={shareImage}
            disabled= {isSharing}>
              <Text style= {styles.optionText}>Share Image</Text>
            </TouchableOpacity>
             <TouchableOpacity
            style= {styles.optionButton}
            onPress={shareText}
            disabled= {isSharing}>
              <Text style= {styles.optionText}>Share Link</Text>
            </TouchableOpacity>
            

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setPopupVisible(false)}
              disabled={isSharing}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  optionButton: {
    width: "100%",
    padding: 15,
    marginVertical: 5,
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    alignItems: "center",
  },
  optionText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  cancelButton: {
    width: "100%",
    padding: 15,
    marginTop: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 10,
    alignItems: "center",
  },
  cancelText: {
    color: "#333",
    fontSize: 18,
    fontWeight: "bold",
  },
});
