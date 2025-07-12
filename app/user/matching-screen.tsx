import { View, Text, ActivityIndicator, ImageBackground } from "react-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import React from "react";

export default function MatchingScreen() {
  const router = useRouter();

  useEffect(() => {
    // Simulate finding a match after 3 seconds
    const timer = setTimeout(() => {
      router.push("/user/battle-screen?mode=random");
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 bg-white justify-center items-center">
      <ImageBackground
        source={require("../../assets/gradient.jpg")}
        className="w-full h-full justify-center items-center"
      >
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white text-2xl font-bold mt-4">
          Finding opponent...
        </Text>
      </ImageBackground>
    </View>
  );
}
