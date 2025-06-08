import React from "react";
import { Tabs } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../../firebase/firebaseConfig";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const ACTIVE_COLOR = "#F87720";

export default function TabsLayout() {
  const router = useRouter();

  const user = auth.currentUser;
  //   if (!user) {
  //     router.replace("/login");
  //     return null;
  //   }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={styles.root}>
        {/* ——— expo-router Tabs ——— */}
        <Tabs
          screenOptions={{
            headerShown: false, // we already have our own header
            tabBarShowLabel: false,
            tabBarActiveTintColor: ACTIVE_COLOR,
            tabBarInactiveTintColor: "#aaaaaa",
            tabBarStyle: styles.tabBar,
            tabBarItemStyle: { width: "100%", height: "100%" },
            tabBarButton: (props) => (
              <TouchableOpacity
                {...props}
                android_ripple={{ color: "#F87720" }}
              />
            ),
          }}
        >
          <Tabs.Screen
            name="battle-results"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="battle-room"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="results-screen"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="battle-screen"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="matching-screen"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="multiplayer-mode-selection"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="level-select"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="results"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="edit-profile"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="achievements"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="quiz-screen"
            options={{
              href: null, // removes from tab bar
            }}
          />

          <Tabs.Screen
            name="home"
            options={{
              title: "Home",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="home" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="learn"
            options={{
              title: "Learn",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="book" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="leaderboard"
            options={{
              title: "Leaderboard",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="trophy" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              tabBarIcon: ({ color, size }) => (
                <FontAwesome name="user" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFF2CC" },
  header: {
    height: 60,
    backgroundColor: ACTIVE_COLOR,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  headerText: {
    fontFamily: "Poppins-Bold",
    fontSize: 20,
    color: "#000",
  },
  notificationIcon: { width: 24, height: 24, resizeMode: "contain" },
  tabBar: {
    backgroundColor: "#fff",
    borderColor: "#3b3b3b",
    flexDirection: "row",
    alignItems: "center",
    height: 60,
    paddingTop: 10,
  },
});
