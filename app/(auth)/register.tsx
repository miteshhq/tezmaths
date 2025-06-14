// app/register.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { get, ref, set, update } from "firebase/database";
import React, { useState, useCallback, useEffect } from "react";
import {
  Image,
  StatusBar,
  Keyboard,
  ScrollView,
  TouchableWithoutFeedback,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";

// Avatar options
const avatarOptions = [
  { id: 1, source: require("../../assets/avatars/avatar1.jpg") },
  { id: 2, source: require("../../assets/avatars/avatar2.jpg") },
  { id: 3, source: require("../../assets/avatars/avatar3.jpg") },
  { id: 4, source: require("../../assets/avatars/avatar4.jpg") },
  { id: 5, source: require("../../assets/avatars/avatar5.jpg") },
  { id: 6, source: require("../../assets/avatars/avatar6.jpg") },
];

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { email, isGoogleUser, displayName } = params;

  const [fullName, setFullName] = useState((displayName as string) || "");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(1); // Default to first avatar
  const [referralCode, setReferralCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(true);

  const [focusField, setFocusField] = useState(null);

  // Pre-fill name if coming from Google Sign-In
  useEffect(() => {
    if (isGoogleUser === "true" && displayName) {
      setFullName(displayName as string);
    }
  }, [isGoogleUser, displayName]);

  const validatePhoneNumber = useCallback(() => {
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
  }, [phoneNumber]);

  const findUserByUsername = useCallback(async (searchUsername) => {
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
  }, []);

  const processReferral = useCallback(
    async (referralUsername) => {
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
          typeof referrerData.referrals === "number"
            ? referrerData.referrals
            : 0;
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
    },
    [username, findUserByUsername]
  );

  const checkUsernameAvailability = useCallback(async () => {
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
  }, [username]);

  const handleUsernameChange = useCallback((value) => {
    const sanitizedValue = value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15);
    setUsername(sanitizedValue);
  }, []);

  const handleRegister = useCallback(async () => {
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

      // Create user data object
      const userData = {
        fullName,
        username: username.toLowerCase(),
        phoneNumber,
        email: email,
        avatar: selectedAvatar,
        isnewuser: false, // Mark as not new user anymore
        streak: 0,
        lastCompletionDate: null,
        highestCompletedLevelCompleted: 0,
        levelsScores: [],
        referrals: 0,
        totalPoints: referralSuccess ? 5 : 0, // Give 5 points for successful referral
      };

      // If this is a Google user, preserve some Google-specific fields
      if (isGoogleUser === "true") {
        const userRef = ref(database, `users/${userId}`);
        const existingSnapshot = await get(userRef);

        if (existingSnapshot.exists()) {
          const existingData = existingSnapshot.val();
          // Preserve Google-specific fields
          userData.photoURL = existingData.photoURL || "";
          userData.providerId = existingData.providerId || "google.com";
          userData.createdAt =
            existingData.createdAt || new Date().toISOString();
        }
      }

      // Create/update user entry
      const userRef = ref(database, `users/${userId}`);
      await set(userRef, userData);

      console.log(
        "Registration completed successfully for:",
        isGoogleUser === "true" ? "Google user" : "regular user"
      );
      router.push("/user/home");
    } catch (error) {
      console.error("Registration failed:", error);
      setErrorMessage(
        `Registration failed: ${error.message || "Please try again."}`
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    isProcessing,
    fullName,
    username,
    phoneNumber,
    usernameAvailable,
    validatePhoneNumber,
    email,
    selectedAvatar,
    referralCode,
    processReferral,
    isGoogleUser,
    router,
  ]);

  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <TouchableWithoutFeedback onPress={dismissKeyboard}>
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
            <Text className="text-4xl text-black font-black text-center mb-4 font-['Poppins-Bold']">
              {isGoogleUser === "true"
                ? "Complete Your Profile"
                : "Setup Your Profile"}
            </Text>

            {/* Avatar Selection */}
            <View className="mb-6 w-full">
              <Text className="text-lg text-black font-semibold text-center mb-4 font-['Poppins-SemiBold']">
                Choose your avatar
              </Text>
              <View className="flex-row flex-wrap justify-center">
                {avatarOptions.map((avatar) => (
                  <TouchableOpacity
                    key={avatar.id}
                    onPress={() => setSelectedAvatar(avatar.id)}
                    className={`m-2 p-2 rounded-full border-2 ${
                      selectedAvatar === avatar.id
                        ? "border-primary"
                        : "border-gray-300"
                    }`}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={avatar.source}
                      className="w-16 h-20 rounded-full"
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Name Input */}
            <View className="mb-4 w-full">
              <Text className="text-base text-black font-medium mb-2 font-['Poppins-Medium']">
                Name
              </Text>
              <TextInput
                className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular'] ${
                  focusField === "fullname" ? "border-2 border-primary" : ""
                }`}
                onFocus={() => setFocusField("fullname")}
                onBlur={() => setFocusField(null)}
                placeholder="Enter your full name"
                placeholderTextColor="#9CA3AF"
                onChangeText={setFullName}
                value={fullName}
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </View>

            {/* Username Input */}
            <View className="mb-4 w-full">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-base text-black font-medium font-['Poppins-Medium']">
                  Username
                </Text>
                {username ? (
                  <Text
                    className={`text-sm font-medium font-['Poppins-Medium'] ${
                      usernameAvailable ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {usernameAvailable ? "Available" : "Taken"}
                  </Text>
                ) : null}
              </View>
              <TextInput
                className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular'] ${
                  focusField === "username" ? "border-2 border-primary" : ""
                }`}
                onFocus={() => setFocusField("username")}
                onBlur={() => {
                  setFocusField(null);
                  checkUsernameAvailability;
                }}
                placeholder="Choose a username"
                placeholderTextColor="#9CA3AF"
                onChangeText={handleUsernameChange}
                value={username}
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </View>

            {/* Phone Input */}
            <View className="mb-4 w-full">
              <Text className="text-base text-black font-medium mb-2 font-['Poppins-Medium']">
                Phone
              </Text>
              <TextInput
                className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular'] ${
                  focusField === "phonenumber" ? "border-2 border-primary" : ""
                }`}
                onFocus={() => setFocusField("phonenumber")}
                onBlur={() => {
                  setFocusField(null);
                  validatePhoneNumber;
                }}
                placeholder="Enter your phone number"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                onChangeText={setPhoneNumber}
                value={phoneNumber}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              {phoneError ? (
                <Text className="text-red-500 text-sm mt-1 font-['Poppins-Regular']">
                  {phoneError}
                </Text>
              ) : null}
            </View>

            {/* Referral Code Input */}
            <View className="mb-6 w-full">
              <Text className="text-base text-black font-medium mb-2 font-['Poppins-Medium']">
                Referral Code (Optional)
              </Text>
              <TextInput
                className={`bg-gray-100 text-black py-4 px-5 rounded-xl mb-4 w-full text-base font-['Poppins-Regular'] ${
                  focusField === "refercode" ? "border-2 border-primary" : ""
                }`}
                onFocus={() => setFocusField("refercode")}
                onBlur={() => setFocusField(null)}
                placeholder="Enter friend's username"
                placeholderTextColor="#9CA3AF"
                onChangeText={setReferralCode}
                value={referralCode}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
            </View>

            {/* Error Message */}
            {errorMessage ? (
              <Text className="text-red-500 text-sm text-center font-['Poppins-Regular'] mb-4">
                {errorMessage}
              </Text>
            ) : null}

            {/* Continue Button */}
            <TouchableOpacity
              className={`bg-primary py-3 px-8 rounded-2xl items-center justify-center w-full ${
                isProcessing ? "opacity-70" : ""
              }`}
              onPress={handleRegister}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              <Text className="text-white text-xl font-bold font-['Poppins-SemiBold'] text-center">
                {isProcessing ? "Processing..." : "Complete Registration"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
