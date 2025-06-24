import { get, update } from 'firebase/database';
import { ref } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, database } from '../firebase/firebaseConfig';

export const updateUserStreak = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return { success: false, streak: 0 };

    try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return { success: false, streak: 0 };
        }

        const userData = snapshot.val();
        const lastCompletionDate = userData.lastCompletionDate;
        const currentStreak = userData.streak || 0;
        const today = new Date().toISOString().split("T")[0];

        // If already played today, return current streak
        if (lastCompletionDate === today) {
            return {
                success: true,
                streak: currentStreak,
                alreadyPlayedToday: true
            };
        }

        let newStreak;

        if (!lastCompletionDate) {
            // First time playing
            newStreak = 1;
        } else {
            // Calculate days difference
            const lastDateObj = new Date(lastCompletionDate + 'T12:00:00Z');
            const todayDateObj = new Date(today + 'T12:00:00Z');
            const diffInDays = Math.floor(
                (todayDateObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (diffInDays === 1) {
                // Consecutive day
                newStreak = currentStreak + 1;
            } else if (diffInDays >= 2) {
                // Missed 2+ days, start fresh
                newStreak = 1;
            } else {
                // Same day or invalid, shouldn't happen
                newStreak = currentStreak;
            }
        }

        // Update Firebase
        const updates = {
            streak: newStreak,
            lastCompletionDate: today,
        };

        await update(userRef, updates);

        // Update AsyncStorage
        await AsyncStorage.setItem("streak", newStreak.toString());

        return {
            success: true,
            streak: newStreak,
            alreadyPlayedToday: false,
            increased: newStreak > currentStreak
        };

    } catch (error) {
        console.error("Error updating streak:", error);
        return { success: false, streak: 0 };
    }
};

export const checkStreakDecay = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) return;

        const userData = snapshot.val();
        const lastCompletionDate = userData.lastCompletionDate;
        const currentStreak = userData.streak || 0;
        const today = new Date().toISOString().split("T")[0];

        // Only check decay if user has a streak and last completion date
        if (lastCompletionDate && currentStreak > 0) {
            const lastDateObj = new Date(lastCompletionDate + 'T12:00:00Z');
            const todayDateObj = new Date(today + 'T12:00:00Z');
            const diffInDays = Math.floor(
                (todayDateObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (diffInDays >= 2) {
                // Reset streak to 0
                const updates = { streak: 0 };
                await update(userRef, updates);
                await AsyncStorage.setItem("streak", "0");
                return { decayed: true, newStreak: 0 };
            }
        }

        return { decayed: false, newStreak: currentStreak };
    } catch (error) {
        console.error("Error checking streak decay:", error);
        return { decayed: false, newStreak: 0 };
    }
};