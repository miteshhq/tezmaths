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
} from "react-native";
import { database } from "../firebase/firebaseConfig";
import { ref, set, get } from "firebase/database";
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
  const [errorMessage, setErrorMessage] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [focusField, setFocusField] = useState(null);

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

  const handleRegister = async () => {
    setErrorMessage("");
    const usernameRegex = /^[a-zA-Z0-9]{1,15}$/;
    if (!fullName || !username || !gender || !age || !phoneNumber) {
      setErrorMessage("All fields are required.");
      return;
    }
    if (!usernameRegex.test(username)) {
      setErrorMessage(
        "Username must be alphanumeric and within 15 characters."
      );
      return;
    }
    if (isNaN(parseInt(age)) || parseInt(age) <= 0 || parseInt(age) > 120) {
      setErrorMessage("Age must be a valid number between 1 and 120.");
      return;
    }
    if (!agreeToTerms) {
      setErrorMessage("You must agree to the terms and conditions.");
      return;
    }
    if (!validatePhoneNumber()) {
      setErrorMessage("Please correct the errors before submitting.");
      return;
    }
    try {
      const usernameRef = ref(database, `usernames/${username}`);
      const usernameSnapshot = await get(usernameRef);
      if (usernameSnapshot.exists()) {
        setErrorMessage("Username is already taken. Please choose another.");
        return;
      }
      const userId = auth.currentUser?.uid;
      if (!userId) {
        throw new Error("User ID is missing.");
      }
      const userRef = ref(database, `users/${userId}`);
      await set(userRef, {
        fullName,
        username,
        phoneNumber,
        gender,
        email: email,
        age,
        isnewuser: false,
        streak: 0, // Initialize streak to 0
        lastCompletionDate: null, // Initialize lastCompletionDate to null
        highestCompletedLevelCompleted: 0,
        levelsScores: [],
      });
      await set(usernameRef, true);
      router.push("/dashboard");
    } catch (error) {
      console.error("Registration failed:", error);
      setErrorMessage("Registration failed. Please try again.");
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Complete Registration</Text>
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
      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Continue</Text>
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
