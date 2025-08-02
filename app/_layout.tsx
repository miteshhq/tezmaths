// app/_layout.tsx
import React, { useState, useEffect } from "react";
import { Slot } from "expo-router";
import * as Font from "expo-font";
import { View, Text } from "react-native";
import "./globals.css";
import { Image } from "react-native";

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    const loadApp = async () => {
      // Minimum 2.5 seconds for quote readability
      const minLoadingDelay = new Promise((resolve) =>
        setTimeout(resolve, 0)
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
        <View className="bg-white w-full max-w-sm">
          <View className="p-6 flex flex-col items-center gap-5">
            {/* Quote Section */}
            <View className="relative">
              <Image
                source={require("../assets/icons/lamp.png")}
                style={{ width: 80, height: 80 }}
              />
            </View>
            <View className="flex flex-col items-center">
              <Text className="text-2xl font-black text-center text-primary leading-8">
                Best for Bank, SSC, Railway &
              </Text>
              <Text className="text-2xl font-black text-center text-stone-900 leading-8">
                All Competitive Exams
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return <Slot />;
}
