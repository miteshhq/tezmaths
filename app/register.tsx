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
import { ref, set, get, update, onValue } from "firebase/database";
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

  const processReferral = async (referralUsername) => {
    console.log(`[REFERRAL] Processing referral code: ${referralUsername}`);

    try {
      // Skip processing if user is referring themselves
      if (username.toLowerCase() === referralUsername.toLowerCase()) {
        console.log(`[REFERRAL] Self-referral detected, skipping`);
        return false;
      }

      // Step 1: Find the user ID associated with the referral username
      const referralUsernameRef = ref(
        database,
        `usernames/${referralUsername.toLowerCase()}`
      );
      console.log(
        `[REFERRAL] Looking up username:`,
        referralUsernameRef.toString()
      );
      const referralSnapshot = await get(referralUsernameRef);

      // Debug the exact value and type
      const referralValue = referralSnapshot.val();
      console.log(
        `[REFERRAL] Username lookup result type:`,
        typeof referralValue
      );
      console.log(`[REFERRAL] Username lookup result:`, referralValue);

      if (!referralSnapshot.exists()) {
        console.log(
          `[REFERRAL] No user found with username: ${referralUsername}`
        );
        return false;
      }

      // If the value is "true" (as string or boolean), we need to handle this differently
      let referrerId;
      if (referralValue === true || referralValue === "true") {
        // The username itself might be the ID in your database structure
        referrerId = referralUsername.toLowerCase();
        console.log(
          `[REFERRAL] Using username as ID because lookup returned true: ${referrerId}`
        );
      } else {
        referrerId = referralValue;
        console.log(`[REFERRAL] Found referrer ID: ${referrerId}`);
      }

      // Step 2: Get the referrer's current data - Use the actual userId here, not the username
      const referrerRef = ref(database, `users/${referrerId}`);
      const referrerSnapshot = await get(referrerRef);

      if (!referrerSnapshot.exists()) {
        console.log(`[REFERRAL] No user data found for ID: ${referrerId}`);
        return false;
      }

      const referrerData = referrerSnapshot.val();
      console.log(`[REFERRAL] Current referrer data:`, referrerData);

      // Step 3: Calculate new values
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

      // Step 4: Update the referrer's data in the database using the correct ID
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

  const handleRegister = async () => {
    if (isProcessing) return; // Prevent multiple submissions

    try {
      setIsProcessing(true);
      setErrorMessage("");

      // In test mode, only process referral without registration validation
      if (testMode) {
        if (referralCode && referralCode.trim() !== "") {
          const referralSuccess = await processReferral(referralCode.trim());

          if (referralSuccess) {
            Alert.alert(
              "Referral Test Success",
              `Referral code ${referralCode} was processed successfully.`,
              [{ text: "OK" }]
            );
          } else {
            Alert.alert(
              "Referral Test Failed",
              `Failed to process referral code: ${referralCode}`,
              [{ text: "OK" }]
            );
          }
        } else {
          Alert.alert(
            "Referral Test Error",
            "Please enter a referral code to test.",
            [{ text: "OK" }]
          );
        }
        setIsProcessing(false);
        return;
      }

      // Validation checks for normal registration
      const usernameRegex = /^[a-zA-Z0-9]{1,15}$/;
      if (!fullName || !username || !gender || !age || !phoneNumber) {
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

      // Convert username to lowercase for consistency
      const usernameLowercase = username.toLowerCase();

      // Check if username is available - using lowercase to ensure case insensitivity
      const usernameRef = ref(database, `usernames/${usernameLowercase}`);
      const usernameSnapshot = await get(usernameRef);

      if (usernameSnapshot.exists()) {
        setErrorMessage("Username is already taken. Please choose another.");
        setIsProcessing(false);
        return;
      }

      // Get current user ID
      const userId = auth.currentUser?.uid;
      if (!userId) {
        throw new Error("User ID is missing.");
      }

      // Create user entry with initial default values
      const userRef = ref(database, `users/${userId}`);

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

      // Initialize with default values to prevent undefined errors
      await set(userRef, {
        fullName,
        username,
        phoneNumber,
        gender,
        email: email,
        age,
        isnewuser: false,
        streak: 0,
        lastCompletionDate: null,
        highestCompletedLevelCompleted: 0,
        levelsScores: [],
        referrals: 0, // Explicitly initialize referrals to 0
        totalPoints: referralSuccess ? 5 : 0, // Bonus points if referral was successful
      });

      // Register username for referral lookup - use lowercase for consistency
      await set(usernameRef, userId);

      // Show success and navigate
      Alert.alert(
        "Registration Successful",
        referralSuccess
          ? `Account created! Referral code ${referralCode} was applied successfully.`
          : "Account created successfully!",
        [{ text: "OK", onPress: () => router.push("/dashboard") }]
      );
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
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Complete Registration</Text>

      {/* Test Mode Toggle */}
      <View style={styles.testModeContainer}>
        <Text style={styles.testModeText}>Test Mode (Referrals Only)</Text>
        <Switch
          value={testMode}
          onValueChange={setTestMode}
          trackColor={{ false: "#767577", true: "#81b0ff" }}
          thumbColor={testMode ? "#f5dd4b" : "#f4f3f4"}
        />
      </View>

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
