// app/_layout.tsx
import React, { useState, useEffect } from "react";
import { Slot } from "expo-router";
import * as Font from "expo-font";
import { ActivityIndicator } from "react-native";
import "./globals.css";

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    Font.loadAsync({
      "Poppins-Bold": require("../assets/fonts/Poppins-Bold.ttf"),
      "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
    }).then(() => setFontsLoaded(true));
  }, []);

  if (!fontsLoaded) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  return <Slot />;
}
