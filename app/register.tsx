// app/register.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { database } from "../firebase/firebaseConfig";
import {
  ref,
  set,
  get,
  update,
  onValue,
  query,
  orderByChild,
  equalTo,
} from "firebase/database";
import { useLocalSearchParams, useRouter } from "expo-router";
import { auth } from "../firebase/firebaseConfig";
import { Picker } from "@react-native-picker/picker";

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { email } = params;

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [referralCode, setReferralCode] = useState(""); // State for referral code
  const [errorMessage, setErrorMessage] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [focusField, setFocusField] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testMode, setTestMode] = useState(false); // Test mode toggle

  const validatePhoneNumber = () => {
    if (
      !phoneNumber ||
      phoneNumber.length > 11 ||
      phoneNumber.length < 10 ||
      !/^\d+$/.test(phoneNumber)
    ) {
      setPhoneError("Please enter a valid phone number.");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const findUserByUsername = async (searchUsername) => {
    console.log(
      `[REFERRAL] Searching for user with username: ${searchUsername}`
    );

    if (!searchUsername) return null;

    try {
      // Fetch all users and filter client-side
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (!snapshot.exists()) {
        console.log(`[REFERRAL] No users in database`);
        return null;
      }

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

      if (!userData) {
        console.log(
          `[REFERRAL] No user found with username: ${searchUsername}`
        );
        return null;
      }

      console.log(`[REFERRAL] Found user with ID: ${userId}`);
      return { userId, userData };
    } catch (error) {
      console.error(`[REFERRAL] Error finding user:`, error);
      return null;
    }
  };

  const processReferral = async (referralUsername) => {
    console.log(`[REFERRAL] Processing referral code: ${referralUsername}`);

    try {
      // Skip processing if user is referring themselves
      if (username.toLowerCase() === referralUsername.toLowerCase()) {
        console.log(`[REFERRAL] Self-referral detected, skipping`);
        return false;
      }

      // Find the referrer by username
      const referrerResult = await findUserByUsername(
        referralUsername.toLowerCase()
      );

      if (!referrerResult || !referrerResult.userData) {
        console.log(
          `[REFERRAL] No valid referrer found for username: ${referralUsername}`
        );
        return false;
      }

      const { userId: referrerId, userData: referrerData } = referrerResult;

      // Calculate new values
      const currentReferrals =
        typeof referrerData.referrals === "number" ? referrerData.referrals : 0;
      const updatedReferrals = currentReferrals + 1;

      const referralPoints = 10; // Points earned per referral
      const currentTotalPoints =
        typeof referrerData.totalPoints === "number"
          ? referrerData.totalPoints
          : 0;
      const updatedTotalPoints = currentTotalPoints + referralPoints;

      console.log(
        `[REFERRAL] Updating: referrals ${currentReferrals} → ${updatedReferrals}, totalPoints ${currentTotalPoints} → ${updatedTotalPoints}`
      );

      // Update the referrer's data
      const referrerRef = ref(database, `users/${referrerId}`);
      await update(referrerRef, {
        referrals: updatedReferrals,
        totalPoints: updatedTotalPoints,
      });

      console.log(`[REFERRAL] Successfully updated referrer data`);

      // Verify the update
      const verifySnapshot = await get(referrerRef);
      const verifyData = verifySnapshot.val();
      console.log(
        `[REFERRAL] Verification - Updated referrer data:`,
        verifyData
      );

      return true;
    } catch (error) {
      console.error(`[REFERRAL] Error processing referral:`, error);
      return false;
    }
  };

  const checkUsernameAvailability = async (usernameToCheck) => {
    try {
      const usernameToCheckLower = usernameToCheck.toLowerCase();

      // Instead of using a query with orderByChild, fetch all users and check client-side
      // This is less efficient but works without adding an index
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (!snapshot.exists()) {
        console.log("[USERNAME] No users in database, username is available");
        return true;
      }

      let isAvailable = true;
      snapshot.forEach((childSnapshot) => {
        const userData = childSnapshot.val();
        if (
          userData.username &&
          userData.username.toLowerCase() === usernameToCheckLower
        ) {
          isAvailable = false;
        }
      });

      console.log(
        `[USERNAME] Availability check for ${usernameToCheckLower}: ${
          isAvailable ? "Available" : "Taken"
        }`
      );
      return isAvailable;
    } catch (error) {
      console.error("Error checking username availability:", error);
      // In case of error, allow the registration to proceed
      return true;
    }
  };

  const handleRegister = async () => {
    if (isProcessing) return; // Prevent multiple submissions

    try {
      setIsProcessing(true);
      setErrorMessage("");

      console.log("[REGISTER] Starting registration process");

      // Validation checks
      console.log("[REGISTER] Validating input fields");
      const usernameRegex = /^[a-zA-Z0-9]{1,15}$/;
      if (!fullName || !username || !gender || !age || !phoneNumber) {
        console.log("[REGISTER] Missing required fields");
        setErrorMessage("All fields are required.");
        setIsProcessing(false);
        return;
      }

      if (!usernameRegex.test(username)) {
        setErrorMessage(
          "Username must be alphanumeric and within 15 characters."
        );
        setIsProcessing(false);
        return;
      }

      if (isNaN(parseInt(age)) || parseInt(age) <= 0 || parseInt(age) > 120) {
        setErrorMessage("Age must be a valid number between 1 and 120.");
        setIsProcessing(false);
        return;
      }

      if (!agreeToTerms) {
        setErrorMessage("You must agree to the terms and conditions.");
        setIsProcessing(false);
        return;
      }

      if (!validatePhoneNumber()) {
        setErrorMessage("Please correct the errors before submitting.");
        setIsProcessing(false);
        return;
      }

      // Check username availability
      console.log("[REGISTER] Checking username availability");
      const usernameLowercase = username.toLowerCase();
      const isUsernameAvailable = await checkUsernameAvailability(
        usernameLowercase
      );

      if (!isUsernameAvailable) {
        console.log("[REGISTER] Username already taken");
        setErrorMessage("Username is already taken. Please choose another.");
        setIsProcessing(false);
        return;
      }

      // Get current user ID
      console.log("[REGISTER] Getting current user ID");
      const userId = auth.currentUser?.uid;
      if (!userId) {
        console.log("[REGISTER] No current user ID found");
        throw new Error("User ID is missing.");
      }

      console.log(`[REGISTER] Current user ID: ${userId}`);

      // Process referral first if provided
      let referralSuccess = false;
      if (referralCode && referralCode.trim() !== "") {
        referralSuccess = await processReferral(referralCode.trim());

        if (referralSuccess) {
          console.log(
            `[REFERRAL] Successfully processed referral for code: ${referralCode}`
          );
        } else {
          console.log(
            `[REFERRAL] Referral processing failed or invalid code: ${referralCode}`
          );
        }
      }

      // Create user entry
      console.log("[REGISTER] Creating user entry in database");
      const userRef = ref(database, `users/${userId}`);
      await set(userRef, {
        fullName,
        username: usernameLowercase,
        phoneNumber,
        gender,
        email: email,
        age,
        isnewuser: false,
        streak: 0,
        lastCompletionDate: null,
        highestCompletedLevelCompleted: 0,
        levelsScores: [],
        referrals: 0,
        totalPoints: referralSuccess ? 5 : 0,
      });

      console.log("[REGISTER] User successfully created in database");
      router.push("/dashboard");
    } catch (error) {
      console.error("[REGISTER] Registration failed:", error);
      setErrorMessage(
        `Registration failed: ${error.message || "Please try again."}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Complete Registration</Text>

      {/* Test Mode Toggle */}
      {/* <View style={styles.testModeContainer}>
        <Text style={styles.testModeText}>Test Mode (Referrals Only)</Text>
        <Switch
          value={testMode}
          onValueChange={setTestMode}
          trackColor={{ false: "#767577", true: "#81b0ff" }}
          thumbColor={testMode ? "#f5dd4b" : "#f4f3f4"}
        />
      </View> */}

      <TextInput
        style={[styles.input, focusField === "fullName" && styles.inputFocused]}
        placeholder="Full Name"
        placeholderTextColor="#7a7a7a"
        onChangeText={setFullName}
        value={fullName}
        onFocus={() => setFocusField("fullName" as any)}
        onBlur={() => setFocusField(null)}
      />
      <TextInput
        style={[styles.input, focusField === "username" && styles.inputFocused]}
        placeholder="Username"
        placeholderTextColor="#7a7a7a"
        onChangeText={(value) => {
          const sanitizedValue = value
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 15);
          setUsername(sanitizedValue);
        }}
        value={username}
        onFocus={() => setFocusField("username" as any)}
        onBlur={() => setFocusField(null)}
      />
      <TextInput
        style={[
          styles.input,
          focusField === "phoneNumber" && styles.inputFocused,
        ]}
        placeholder="Phone Number"
        placeholderTextColor="#7a7a7a"
        keyboardType="numeric"
        onChangeText={setPhoneNumber}
        value={phoneNumber}
        onFocus={() => setFocusField("phoneNumber" as any)}
        onBlur={() => {
          setFocusField(null);
          validatePhoneNumber();
        }}
      />
      {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
      <TextInput
        style={[
          styles.input,
          focusField === "referralCode" && styles.inputFocused,
        ]}
        placeholder="Referral Code (optional)"
        placeholderTextColor="#7a7a7a"
        onChangeText={setReferralCode}
        value={referralCode}
        onFocus={() => setFocusField("referralCode" as any)}
        onBlur={() => setFocusField(null)}
      />
      <View
        style={[
          styles.pickerWrapper,
          focusField === "gender" && styles.inputFocused,
        ]}
      >
        <Picker
          selectedValue={gender}
          style={styles.picker}
          onValueChange={(itemValue) => {
            setGender(itemValue);
            setFocusField("gender" as any);
          }}
          onFocus={() => setFocusField("gender" as any)}
          onBlur={() => setFocusField(null)}
        >
          <Picker.Item label="Select Gender" value="" />
          <Picker.Item label="Male" value="Male" />
          <Picker.Item label="Female" value="Female" />
        </Picker>
      </View>
      <TextInput
        style={[styles.input, focusField === "age" && styles.inputFocused]}
        placeholder="Age"
        placeholderTextColor="#7a7a7a"
        keyboardType="numeric"
        maxLength={3}
        onChangeText={(value) => {
          const cleanValue = value.replace(/[^0-9]/g, "");
          setAge(cleanValue);
        }}
        value={age}
        onFocus={() => setFocusField("age" as any)}
        onBlur={() => setFocusField(null)}
      />
      <View style={styles.checkboxContainer}>
        <TouchableOpacity
          onPress={() => setAgreeToTerms(!agreeToTerms)}
          style={styles.customCheckbox}
        >
          {agreeToTerms ? <View style={styles.checkedSquare} /> : null}
        </TouchableOpacity>
        <Text style={styles.checkboxText}>
          I agree to the terms and conditions
        </Text>
      </View>
      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}
      <TouchableOpacity
        style={[styles.button, isProcessing && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={isProcessing}
      >
        <Text style={styles.buttonText}>
          {isProcessing
            ? "Processing..."
            : testMode
            ? "Test Referral"
            : "Continue"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F4F8",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 26,
    color: "#333",
    fontFamily: "Poppins-Bold",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
  },
  testModeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "90%",
    marginBottom: 20,
    backgroundColor: "#e0e0e0",
    padding: 10,
    borderRadius: 10,
  },
  testModeText: {
    fontSize: 14,
    fontFamily: "Poppins-Regular",
    color: "#333",
  },
  input: {
    backgroundColor: "#fff",
    color: "#333",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 30,
    marginBottom: 15,
    width: "90%",
    fontFamily: "Poppins-Regular",
    fontSize: 15,
  },
  inputFocused: {
    borderWidth: 2,
    borderColor: "#333",
  },
  pickerWrapper: {
    backgroundColor: "#fff",
    borderRadius: 30,
    width: "90%",
    marginBottom: 15,
    overflow: "hidden",
  },
  picker: {
    width: "100%",
    height: 40,
    fontFamily: "Poppins-Regular",
    color: "#333",
  },
  errorText: {
    color: "#FF5A5F",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Poppins-Regular",
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#F7C948",
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: "center",
    width: "75%",
    justifyContent: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: "#cccccc",
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Poppins-Regular",
    textAlign: "center",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  customCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  checkedSquare: {
    width: 12,
    height: 12,
    backgroundColor: "#333",
  },
  checkboxText: {
    fontSize: 14,
    fontFamily: "Poppins-Regular",
    color: "#333",
  },
});
