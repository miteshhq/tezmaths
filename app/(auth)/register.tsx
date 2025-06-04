// app/register.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { get, ref, set, update } from "firebase/database";
import React, { useState } from "react";
import {
  Image,
  StatusBar,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";

// Avatar options
const avatarOptions = [
  { id: 1, source: require("../../assets/avatars/avatar1.png") },
  { id: 2, source: require("../../assets/avatars/avatar2.png") },
  { id: 3, source: require("../../assets/avatars/avatar3.png") },
  { id: 4, source: require("../../assets/avatars/avatar4.png") },
  { id: 5, source: require("../../assets/avatars/avatar5.png") },
  { id: 6, source: require("../../assets/avatars/avatar6.png") },
];

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { email } = params;

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(1); // Default to first avatar
  const [referralCode, setReferralCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(true);

  const validatePhoneNumber = () => {
    if (
      !phoneNumber ||
      phoneNumber.length > 11 ||
      phoneNumber.length < 10 ||
      !/^\d+$/.test(phoneNumber)
    ) {
      setPhoneError("Please enter a valid phone number (10-11 digits)");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const findUserByUsername = async (searchUsername) => {
    if (!searchUsername) return null;

    try {
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (!snapshot.exists()) return null;

      let userData = null;
      let userId = null;

      snapshot.forEach((childSnapshot) => {
        const user = childSnapshot.val();
        if (
          user.username &&
          user.username.toLowerCase() === searchUsername.toLowerCase()
        ) {
          userData = user;
          userId = childSnapshot.key;
        }
      });

      if (!userData) return null;
      return { userId, userData };
    } catch (error) {
      console.error(`Error finding user:`, error);
      return null;
    }
  };

  const processReferral = async (referralUsername) => {
    try {
      // Prevent self-referral
      if (username.toLowerCase() === referralUsername.toLowerCase()) {
        return false;
      }

      const referrerResult = await findUserByUsername(
        referralUsername.toLowerCase()
      );

      if (!referrerResult || !referrerResult.userData) {
        return false;
      }

      const { userId: referrerId, userData: referrerData } = referrerResult;

      // Update referrer's stats
      const currentReferrals =
        typeof referrerData.referrals === "number" ? referrerData.referrals : 0;
      const updatedReferrals = currentReferrals + 1;

      const referralPoints = 10;
      const currentTotalPoints =
        typeof referrerData.totalPoints === "number"
          ? referrerData.totalPoints
          : 0;
      const updatedTotalPoints = currentTotalPoints + referralPoints;

      const referrerRef = ref(database, `users/${referrerId}`);
      await update(referrerRef, {
        referrals: updatedReferrals,
        totalPoints: updatedTotalPoints,
      });

      return true;
    } catch (error) {
      console.error(`Error processing referral:`, error);
      return false;
    }
  };

  const checkUsernameAvailability = async () => {
    if (!username) return;

    try {
      const usernameToCheck = username.toLowerCase();
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (!snapshot.exists()) {
        setUsernameAvailable(true);
        return true;
      }

      let isAvailable = true;
      snapshot.forEach((childSnapshot) => {
        const userData = childSnapshot.val();
        if (
          userData.username &&
          userData.username.toLowerCase() === usernameToCheck
        ) {
          isAvailable = false;
        }
      });

      setUsernameAvailable(isAvailable);
      return isAvailable;
    } catch (error) {
      console.error("Error checking username:", error);
      setUsernameAvailable(true);
      return true;
    }
  };

  const handleRegister = async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      setErrorMessage("");

      // Validation checks
      if (!fullName || !username || !phoneNumber) {
        setErrorMessage("All fields are required");
        setIsProcessing(false);
        return;
      }

      if (!usernameAvailable) {
        setErrorMessage("Username is already taken");
        setIsProcessing(false);
        return;
      }

      if (!validatePhoneNumber()) {
        setErrorMessage("Please correct the errors");
        setIsProcessing(false);
        return;
      }

      // Get current user ID
      const userId = auth.currentUser?.uid;
      if (!userId) {
        throw new Error("User ID is missing.");
      }

      // Process referral if provided
      let referralSuccess = false;
      if (referralCode && referralCode.trim() !== "") {
        referralSuccess = await processReferral(referralCode.trim());
      }

      // Create user entry
      const userRef = ref(database, `users/${userId}`);
      await set(userRef, {
        fullName,
        username: username.toLowerCase(),
        phoneNumber,
        email: email,
        avatar: selectedAvatar,
        isnewuser: false,
        streak: 0,
        lastCompletionDate: null,
        highestCompletedLevelCompleted: 0,
        levelsScores: [],
        referrals: 0,
        totalPoints: referralSuccess ? 5 : 0, // Give 5 points for successful referral
      });

      router.push("/user/home");
    } catch (error) {
      console.error("Registration failed:", error);
      setErrorMessage(
        `Registration failed: ${error.message || "Please try again."}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 40,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "bold",
                  textAlign: "center",
                  marginBottom: 32,
                }}
              >
                Setup Your Profile
              </Text>

              {/* Avatar Selection */}
              <View style={{ marginBottom: 24 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  Choose your avatar
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                  }}
                >
                  {avatarOptions.map((avatar) => (
                    <TouchableOpacity
                      key={avatar.id}
                      onPress={() => setSelectedAvatar(avatar.id)}
                      style={{
                        margin: 8,
                        padding: 8,
                        borderRadius: 50,
                        borderWidth: 2,
                        borderColor:
                          selectedAvatar === avatar.id ? "#3B82F6" : "#E5E7EB",
                      }}
                    >
                      <Image
                        source={avatar.source}
                        style={{ width: 64, height: 64, borderRadius: 32 }}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Name Input */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "500",
                    marginBottom: 8,
                  }}
                >
                  Name
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "#F3F4F6",
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 16,
                  }}
                  placeholder="Enter your full name"
                  placeholderTextColor="#9CA3AF"
                  onChangeText={setFullName}
                  value={fullName}
                />
              </View>

              {/* Username Input */}
              <View style={{ marginBottom: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      marginBottom: 8,
                    }}
                  >
                    Username
                  </Text>
                  {username && (
                    <Text
                      style={{
                        fontSize: 14,
                        color: usernameAvailable ? "#10B981" : "#EF4444",
                      }}
                    >
                      {usernameAvailable ? "Available" : "Taken"}
                    </Text>
                  )}
                </View>
                <TextInput
                  style={{
                    backgroundColor: "#F3F4F6",
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 16,
                  }}
                  placeholder="Choose a username"
                  placeholderTextColor="#9CA3AF"
                  onChangeText={(value) => {
                    const sanitizedValue = value
                      .replace(/[^a-zA-Z0-9]/g, "")
                      .slice(0, 15);
                    setUsername(sanitizedValue);
                  }}
                  value={username}
                  onBlur={checkUsernameAvailability}
                />
              </View>

              {/* Phone Input */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "500",
                    marginBottom: 8,
                  }}
                >
                  Phone
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "#F3F4F6",
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 16,
                    borderColor: phoneError ? "#EF4444" : "transparent",
                    borderWidth: phoneError ? 1 : 0,
                  }}
                  placeholder="Enter your phone number"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  onChangeText={setPhoneNumber}
                  value={phoneNumber}
                  onBlur={validatePhoneNumber}
                />
                {phoneError && (
                  <Text
                    style={{
                      color: "#EF4444",
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    {phoneError}
                  </Text>
                )}
              </View>

              {/* Referral Code Input */}
              <View style={{ marginBottom: 24 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "500",
                    marginBottom: 8,
                  }}
                >
                  Referral Code (Optional)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "#F3F4F6",
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 16,
                  }}
                  placeholder="Enter friend's username"
                  placeholderTextColor="#9CA3AF"
                  onChangeText={setReferralCode}
                  value={referralCode}
                />
              </View>

              {/* Error Message */}
              {errorMessage ? (
                <Text
                  style={{
                    color: "#EF4444",
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  {errorMessage}
                </Text>
              ) : null}

              {/* Continue Button */}
              <TouchableOpacity
                style={{
                  backgroundColor: "#3B82F6",
                  borderRadius: 12,
                  padding: 16,
                  opacity: isProcessing ? 0.7 : 1,
                }}
                onPress={handleRegister}
                disabled={isProcessing}
              >
                <Text
                  style={{
                    color: "white",
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: 16,
                  }}
                >
                  {isProcessing ? "Processing..." : "Complete Registration"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
