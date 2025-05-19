// app/admin/ReferralPoints.tsx
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ref, get } from "firebase/database";
import { database } from "../../firebase/firebaseConfig";

export default function ReferralPoints() {
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [totalReferralPoints, setTotalReferralPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGlobalReferrals = async () => {
      try {
        const usersRef = ref(database, "users");
        const snapshot = await get(usersRef);
        if (snapshot.exists()) {
          let totalRefs = 0;
          snapshot.forEach((childSnapshot) => {
            const userData = childSnapshot.val();
            totalRefs += userData.referrals ?? 0;
          });
          setTotalReferrals(totalRefs);
          setTotalReferralPoints(totalRefs * 10); // Each referral gives 10 points
        }
      } catch (error) {
        console.error("Failed to fetch global referrals:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGlobalReferrals();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Referral Points Dashboard</Text>
      {loading ? (
        <Text>Loading...</Text>
      ) : (
        <>
          <Text style={styles.stat}>Total Referrals: {totalReferrals}</Text>
          <Text style={styles.stat}>
            Total Referral Points Distributed: {totalReferralPoints}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF2CC",
    padding: 20,
  },
  title: {
    fontSize: 24,
    color: "#333",
    fontFamily: "Poppins-Bold",
    marginBottom: 20,
  },
  stat: {
    fontSize: 18,
    color: "#333",
    fontFamily: "Poppins-Regular",
    marginBottom: 10,
  },
});
