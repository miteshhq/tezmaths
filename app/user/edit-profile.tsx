// app/user/edit-profile.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { get, ref, update } from "firebase/database";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, database } from "../../firebase/firebaseConfig";

// Predefined avatar options
const avatarOptions = [
  { id: 0, source: require("../../assets/avatars/avatar1.jpg") },
  { id: 1, source: require("../../assets/avatars/avatar2.jpg") },
  { id: 2, source: require("../../assets/avatars/avatar3.jpg") },
  { id: 3, source: require("../../assets/avatars/avatar4.jpg") },
  { id: 4, source: require("../../assets/avatars/avatar5.jpg") },
  { id: 5, source: require("../../assets/avatars/avatar6.jpg") },
];

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    avatar: 0, // Default to first avatar (0)
  });
  const [originalData, setOriginalData] = useState({
    fullName: "",
    avatar: 0,
  });

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const userId = auth.currentUser?.uid;
      if (!userId) {
        Alert.alert("Error", "No authenticated user found");
        router.push("/user/profile");
        return;
      }

      const userRef = ref(database, `users/${userId}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        // Convert avatar to number (handle both number and string formats)
        const avatarValue =
          typeof data.avatar === "number"
            ? data.avatar
            : parseInt(data.avatar) || 0;

        // Ensure avatar is within valid range (0-5)
        const avatar = avatarValue >= 0 && avatarValue <= 5 ? avatarValue : 0;

        const userData = {
          fullName: data.fullName || "",
          avatar: avatar,
        };

        setFormData(userData);
        setOriginalData(userData);
      }
    } catch (error) {
      console.error("[EDIT PROFILE] Failed to load user data:", error);
      Alert.alert("Error", "Failed to load profile data");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    if (!formData.fullName.trim()) {
      Alert.alert("Validation Error", "Full name is required");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        Alert.alert("Error", "No authenticated user found");
        return;
      }

      const userRef = ref(database, `users/${userId}`);
      await update(userRef, {
        fullName: formData.fullName.trim(),
        avatar: formData.avatar,
      });

      // Update AsyncStorage
      const storedUserData = await AsyncStorage.getItem("userData");
      if (storedUserData) {
        const userData = JSON.parse(storedUserData);
        const updatedData = {
          ...userData,
          fullName: formData.fullName.trim(),
          avatar: formData.avatar,
        };
        await AsyncStorage.setItem("userData", JSON.stringify(updatedData));
      }

      Alert.alert("Success", "Profile updated successfully!", [
        { text: "OK", onPress: () => router.push("/user/profile") },
      ]);
    } catch (error) {
      console.error("[EDIT PROFILE] Failed to update profile:", error);
      Alert.alert("Error", "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSelect = (avatarId: number) => {
    setFormData({
      ...formData,
      avatar: avatarId,
    });
  };

  const hasChanges = () => {
    return (
      formData.fullName !== originalData.fullName ||
      formData.avatar !== originalData.avatar
    );
  };

  const getCurrentAvatar = () => {
    return (
      avatarOptions.find((avatar) => avatar.id === formData.avatar)?.source ||
      avatarOptions[0].source
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="bg-white px-4 pt-12 pb-6 border-b border-gray-200">
          <View className="flex-row justify-between items-center">
            <TouchableOpacity onPress={() => router.push("/user/profile")}>
              <Text className="text-primary font-semibold text-lg">Cancel</Text>
            </TouchableOpacity>
            <Text className="text-xl font-bold text-black">Edit Profile</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!hasChanges() || saving}
              className={`px-4 py-2 rounded-lg ${
                hasChanges() && !saving ? "bg-primary" : "bg-gray-300"
              }`}
            >
              <Text
                className={`font-semibold ${
                  hasChanges() && !saving ? "text-white" : "text-gray-500"
                }`}
              >
                {saving ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form */}
        <View className="px-4 py-6">
          {/* Profile Picture Section */}
          <View className="items-center mb-8">
            <View className="w-24 h-24 bg-gray-200 rounded-full justify-center items-center mb-4 border-2 border-primary">
              <Image
                source={getCurrentAvatar()}
                className="w-20 h-20 rounded-full"
                resizeMode="contain"
              />
            </View>
            <Text className="text-gray-600 text-sm mb-4">
              Select an avatar below
            </Text>

            {/* Avatar Selection Grid */}
            <View className="flex-row flex-wrap justify-center">
              {avatarOptions.map((avatar) => (
                <TouchableOpacity
                  key={avatar.id}
                  className={`m-2 p-1 rounded-full ${
                    formData.avatar === avatar.id
                      ? "border-2 border-primary"
                      : ""
                  }`}
                  onPress={() => handleAvatarSelect(avatar.id)}
                >
                  <Image
                    source={avatar.source}
                    className="w-16 h-16 rounded-full"
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Form Fields */}
          <View className="space-y-6">
            {/* Full Name */}
            <View>
              <Text className="text-gray-700 font-semibold mb-2">
                Full Name
              </Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 text-black bg-white"
                value={formData.fullName}
                onChangeText={(text) =>
                  setFormData({ ...formData, fullName: text })
                }
                placeholder="Enter your full name"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
