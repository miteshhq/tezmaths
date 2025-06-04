import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
} from "react-native";
import { ref, get, remove, onValue } from "firebase/database";
import { auth } from "../../firebase/firebaseConfig";
import { database } from "../../firebase/firebaseConfig";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      const usersRef = ref(database, "users");
      onValue(usersRef, async (snapshot) => {
        const data = snapshot.val();
        const userList = data
          ? Object.keys(data).map((key) => ({ id: key, ...data[key] }))
          : [];
        setUsers(userList.reverse());
        setFilteredUsers(userList.reverse());
      });
    };

    fetchUsers();
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query === "") {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(
        (user: any) =>
          (user.username &&
            user.username.toLowerCase().includes(query.toLowerCase())) ||
          (user.fullName &&
            user.fullName.toLowerCase().includes(query.toLowerCase()))
      );
      setFilteredUsers(filtered);
    }
  };

  const handleDeleteUser = (userId: any) => {
    Alert.alert("Delete User", "Are you sure you want to delete this user?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const userRef = ref(database, `users/${userId}`);
          await remove(userRef);
          Alert.alert("User deleted successfully.");
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-gray-50 p-6">
      <Text className="text-3xl font-bold text-gray-800 text-center mb-8">
        All Users
      </Text>
      <TextInput
        className="bg-white border border-gray-300 rounded-lg p-3 mb-6"
        placeholder="Search by name or username"
        value={searchQuery}
        onChangeText={handleSearch}
      />
      <FlatList
        data={filteredUsers}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }: any) => (
          <View className="bg-white p-4 rounded-xl mb-4 border border-gray-200">
            <Text className="text-gray-600 mb-1">
              <Text className="font-bold text-gray-800">Full Name:</Text>{" "}
              {item.fullName || "N/A"}
            </Text>
            <Text className="text-gray-600 mb-1">
              <Text className="font-bold text-gray-800">Username:</Text>{" "}
              {item.username || "N/A"}
            </Text>
            <Text className="text-gray-600 mb-1">
              <Text className="font-bold text-gray-800">Email:</Text>{" "}
              {item.email}
            </Text>
            <Text className="text-gray-600 mb-1">
              <Text className="font-bold text-gray-800">Phone:</Text>{" "}
              {item.phoneNumber || "N/A"}
            </Text>
            <Text className="text-gray-600 mb-1">
              <Text className="font-bold text-gray-800">Points:</Text>{" "}
              {item.totalPoints || 0}
            </Text>
            <Text className="text-gray-600 mb-3">
              <Text className="font-bold text-gray-800">Referrals:</Text>{" "}
              {item.referrals || 0}
            </Text>
            <TouchableOpacity
              className="bg-red-500 py-2 px-4 rounded-lg items-center"
              onPress={() => handleDeleteUser(item.id)}
            >
              <Text className="text-white font-medium">Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}
