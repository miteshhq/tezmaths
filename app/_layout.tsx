// app/_layout.tsx
import React, { useState, useEffect } from "react";
import { Slot } from "expo-router";
import * as Font from "expo-font";
import { ActivityIndicator, View, Text } from "react-native";
import { getRandomQuote } from "../utils/mathQuotes";
import "./globals.css";

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [currentQuote] = useState(getRandomQuote());

  useEffect(() => {
    const loadApp = async () => {
      // Minimum 2.5 seconds for quote readability
      const minLoadingDelay = new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );

      const fontLoadingPromise = Font.loadAsync({
        "Poppins-Bold": require("../assets/fonts/Poppins-Bold.ttf"),
        "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
      });

      // Wait for both font loading AND minimum delay
      await Promise.all([fontLoadingPromise, minLoadingDelay]);

      setFontsLoaded(true);
    };

    loadApp();
  }, []);

  if (!fontsLoaded) {
    return (
      <View className="flex-1 bg-white justify-center items-center px-4">
        {/* Enhanced Loading Card matching your home screen design */}
        <View className="bg-white rounded-2xl border border-black overflow-hidden w-full max-w-sm">
          <View className="w-full h-8 bg-orange-500"></View>
          <View className="p-6 flex flex-col items-center gap-5">
            {/* Animated Loading Icon */}
            <View className="relative">
              <ActivityIndicator size="large" color="#FF6B35" />
            </View>

            {/* Quote Section */}
            <View className="flex flex-col items-center gap-3">
              <Text className="text-xl italic font-bold text-center text-purple-900 leading-6">
                "{currentQuote}"
              </Text>
            </View>

            {/* Loading Message */}
            <View className="flex flex-col items-center gap-2">
              <Text className="text-orange-500 font-bold text-lg">
                Loading TezMaths...
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return <Slot />;
}
