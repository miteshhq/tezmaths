import {
    equalTo,
    get,
    off,
    onDisconnect,
    onValue,
    orderByChild,
    push,
    query,
    ref,
    remove,
    runTransaction,
    serverTimestamp,
    set,
    update
} from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";
import { endBattleDueToHostExit } from './handlehostExit';
import { updateUserStreak } from './streakManager';

export class BattleManager {
    constructor() {
        this.userId = null;
        this.listeners = new Map();
        this.userPresenceRef = null;
        this.matchmakingListener = null;
        this.roomListener = null;
        this.setupUserPresence();
    }

    async waitForAuth() {
        return new Promise((resolve, reject) => {
            if (auth.currentUser) {
                resolve(auth.currentUser);
                return;
            }

            const unsubscribe = auth.onAuthStateChanged((user) => {
                unsubscribe();
                if (user) {
                    resolve(user);
                } else {
                    reject(new Error("User not authenticated"));
                }
            });

            setTimeout(() => {
                unsubscribe();
                reject(new Error("Authentication timeout"));
            }, 5000);
        });
    }

    async setupUserPresence() {
        try {
            const user = await this.waitForAuth();
            this.userId = user.uid;
            const userId = this.userId;

            this.userPresenceRef = ref(database, `presence/${userId}`);
            await set(this.userPresenceRef, {
                online: true,
                lastSeen: serverTimestamp()
            });
            onDisconnect(this.userPresenceRef).remove();
        } catch (error) {
            console.error("Failed to setup user presence:", error);
        }
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async generateUniqueRoomCode() {
        const maxAttempts = 10;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const code = this.generateRoomCode();

            const snapshot = await get(query(
                ref(database, "rooms"),
                orderByChild("code"),
                equalTo(code)
            ));

            if (!snapshot.exists()) {
                return code;
            }
        }

        throw new Error("Failed to generate unique room code");
    }

    async createRoom(roomName, maxPlayers = 4) {
        try {
            // 🔐 Step 1: Validate inputs
            if (!roomName || typeof roomName !== 'string') {
                throw new Error("Room name is required and must be a string");
            }

            const trimmedRoomName = roomName.trim();
            if (trimmedRoomName.length === 0) {
                throw new Error("Room name cannot be empty");
            }

            if (trimmedRoomName.length > 50) {
                throw new Error("Room name cannot exceed 50 characters");
            }

            if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
                throw new Error("Max players must be an integer between 2 and 4");
            }

            // ✅ Step 2: Auth and user data
            const user = await this.waitForAuth();
            if (!user || !user.uid) {
                throw new Error("User authentication failed");
            }

            const userId = user.uid;
            const hostId = user.uid;

            const userData = await this.getUserData(userId);
            const avatar = userData?.avatar || 0;

            // 🔍 Step 3: Check for existing room by the user
            const roomsQuery = query(ref(database, "rooms"), orderByChild("hostId"), equalTo(userId));
            const existingRoomsSnapshot = await get(roomsQuery);

            if (existingRoomsSnapshot.exists()) {
                const rooms = existingRoomsSnapshot.val();
                const roomIds = Object.keys(rooms);

                for (const roomId of roomIds) {
                    console.log(`Deleting old room for user: ${roomId}`);
                    await remove(ref(database, `rooms/${roomId}`));
                }
            }

            // 🎲 Step 4: Generate room code
            const roomCode = await this.generateUniqueRoomCode();
            if (!roomCode) {
                throw new Error("Failed to generate room code");
            }

            const playerName = user.displayName?.trim() || user.email?.split('@')[0] || "Player";

            // 🏗️ Step 5: Room structure
            const roomData = {
                roomName: trimmedRoomName,
                hostId,
                userId,
                code: roomCode,
                status: "waiting",
                maxPlayers,
                currentPlayerCount: 1,
                createdAt: serverTimestamp(),
                lastActivity: serverTimestamp(),
                totalQuestions: 25, // always 25
                players: {
                    [userId]: {
                        name: user.displayName || "Host",
                        username: user.displayName || "Host",
                        ready: false,
                        score: 0,
                        isHost: true,
                        connected: true,
                        joinedAt: serverTimestamp(),
                        answers: {},
                        answer: "",
                        winner: false,
                        avatar
                    }
                },
                gameState: {
                    currentRound: 0,
                    totalRounds: 5,
                    currentQuestion: null,
                    timeLeft: 0
                }
            };

            // 🔑 Step 6: Push new room
            const newRoomRef = push(ref(database, "rooms"));
            if (!newRoomRef.key) {
                throw new Error("Failed to generate room reference");
            }

            await set(newRoomRef, roomData);

            const snapshot = await get(newRoomRef);
            if (!snapshot.exists()) {
                throw new Error("Failed to verify room creation");
            }

            return {
                roomId: newRoomRef.key,
                roomCode,
                roomData: {
                    ...roomData,
                    createdAt: new Date().toISOString(),
                    lastActivity: new Date().toISOString(),
                    players: {
                        [userId]: {
                            ...roomData.players[userId],
                            joinedAt: new Date().toISOString()
                        }
                    }
                }
            };

        } catch (error) {
            console.error("Create room error:", error);

            if (error.message.includes("permission") || error.message.includes("auth")) {
                throw new Error("Permission denied. Please check your authentication.");
            } else if (error.message.includes("network") || error.message.includes("offline")) {
                throw new Error("Network error. Please check your connection and try again.");
            } else if (error.message.startsWith("Room name") || error.message.startsWith("Max players")) {
                throw error;
            } else {
                throw new Error(`Failed to create room: ${error.message}`);
            }
        }
    }

    async clearAllUserRooms() {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomsRef = ref(database, "rooms");
            const snapshot = await get(roomsRef);

            if (!snapshot.exists()) return 0;

            const allRooms = snapshot.val();
            const deletePromises = [];

            for (const [roomId, room] of Object.entries(allRooms)) {
                const isHost = room.hostId === userId;
                const isPlayer = room.players && room.players[userId];

                if (isHost || isPlayer) {
                    console.log("Deleting room for user:", roomId);
                    deletePromises.push(remove(ref(database, `rooms/${roomId}`)));
                }
            }

            await Promise.all(deletePromises);
            return deletePromises.length;

        } catch (error) {
            console.error("clearAllUserRooms error:", error);
            throw error;
        }
    }
    async findRandomMatch(maxPlayers = 2) {
        const user = await this.waitForAuth();
        const userId = user.uid;
        const now = Date.now();
        const timeoutDuration = 30000;
        const halfMinuteAgo = now - timeoutDuration;

        const cleanUserRooms = async () => {
            const roomsSnapshot = await get(ref(database, "rooms"));
            const rooms = roomsSnapshot.val() || {};

            for (const [roomId, room] of Object.entries(rooms)) {
                if (room.hostId === userId || (room.players && room.players[userId])) {
                    console.log("🧹 Deleting previous room of user:", roomId);
                    await remove(ref(database, `rooms/${roomId}`));
                }
            }
        };

        try {
            // 🧹 Step 1: Delete any previous room this user was in
            await cleanUserRooms();

            const startTime = Date.now();

            // ⏳ Step 2: Loop for up to 30 seconds
            while (Date.now() - startTime < timeoutDuration) {
                const roomsSnapshot = await get(ref(database, "rooms"));
                const rooms = roomsSnapshot.val() || {};

                const nowCheck = Date.now();

                const availableRooms = Object.entries(rooms).filter(([roomId, room]) => {
                    if (room.players) {
                        Object.entries(room.players).forEach(([playerId, player]) => {
                            if (!player.connected) {
                                delete room.players[playerId];
                            }
                        });
                    }

                    const isMatchmakingRoom = room.matchmakingRoom === true;
                    const isWaiting = room.status === "waiting";
                    const hasSpace = room.players && Object.keys(room.players).length < (room.maxPlayers || 2);
                    const isRecent = (room.lastActivity || 0) > halfMinuteAgo;
                    const matchesMaxPlayers = room.maxPlayers === maxPlayers;

                    return (
                        isMatchmakingRoom &&
                        isWaiting &&
                        hasSpace &&
                        isRecent &&
                        matchesMaxPlayers &&
                        room.hostId !== userId // Don't join your own room
                    );
                });

                if (availableRooms.length > 0) {
                    availableRooms.sort(
                        ([, a], [, b]) => (b.lastActivity || 0) - (a.lastActivity || 0)
                    );

                    const [roomId, roomData] = availableRooms[0];

                    // Update lastActivity and join
                    await update(ref(database, `rooms/${roomId}`), {
                        lastActivity: Date.now(),
                    });

                    await this.joinRoom(roomData.code);

                    return {
                        roomId,
                        roomCode: roomData.code,
                        isHost: false,
                    };
                }

                // If no room found, wait a bit then retry (poll every 3 seconds)
                await new Promise((res) => setTimeout(res, 3000));
            }

            // 😔 Step 3: After timeout, create your own room as host
            const newRoom = await this.createRoom("Quick Battle", 2);

            await update(ref(database, `rooms/${newRoom.roomId}`), {
                matchmakingRoom: true,
                lastActivity: Date.now(),
            });

            return {
                ...newRoom,
                isHost: true,
                noMatchFound: true
            };

        } catch (error) {
            console.error("Random match error:", error);
            throw new Error("Failed to find or create match");
        }
    }

    async handleHostLeave(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            // Mark the room as finished and set the hostLeft flag
            await update(roomRef, {
                status: "finished",
                hostLeft: true,
                endedBy: "host",
                endedAt: Date.now(),
                lastActivity: serverTimestamp()
            });
            console.log(`[handleHostLeave] Room ${roomId} marked finished due to host exit.`);
        } catch (error) {
            console.error("[handleHostLeave] Error:", error);
        }
    }

    async cleanupMatchmakingRoom(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (room?.matchmakingRoom && room.status === "finished") {
                await remove(roomRef);
                console.log(`Room ${roomId} cleaned up.`);
            } else {
                console.log(`Room ${roomId} not eligible for cleanup.`);
            }
        } catch (error) {
            console.error("Cleanup error:", error);
        }
    }

    async cleanupStaleMatchmaking(userId) {
        const matchmakingRef = ref(database, "matchmaking");
        const snapshot = await get(matchmakingRef);
        const matchmaking = snapshot.val() || {};

        await Promise.all(
            Object.entries(matchmaking)
                .filter(([_, data]) => data.players && data.players[userId])
                .map(([roomId, _]) => this.cleanupMatchmakingRoom(roomId))
        );
    }

    //  listenToRoom(roomId, callback) {
    //   if (!roomId) return console.warn("listenToRoom: No roomId provided");

    //   const roomRef = ref(database, `rooms/${roomId}`);

    //   const listener = onValue(roomRef, (snapshot) => {
    //     const roomData = snapshot.val();
    //     if (!roomData) {
    //       console.warn("[listenToRoom] Room deleted or not found");
    //       callback(null); // Notify room is gone
    //       return;
    //     }

    //     // Example: React based on status
    //     if (roomData.status === "playing") {
    //        router.replace({
    //         pathname: "/user/battle-screen",
    //         params: { roomId },
    //        });
    //         console.log("[listenToRoom] Game started!");
    //     } else if (roomData.status === "waiting") {
    //       console.log("[listenToRoom] Waiting for players...");
    //     }

    //     callback(roomData);
    //   });

    //   // Return unsubscribe function
    //   return () => off(roomRef, "value", listener);
    // }


    listenToRoom(roomId, callback) {
        if (!roomId) {
            console.warn("listenToRoom: No roomId provided");
            return () => { };
        }

        const roomRef = ref(database, `rooms/${roomId}`);

        const handler = (snapshot) => {
            const roomData = snapshot.val();
            if (!roomData) {
                console.warn("[listenToRoom] Room deleted or not found");
                callback(null);
                return;
            }

            if (roomData.status === "playing") {
                router.replace({
                    pathname: "/user/battle-screen",
                    params: { roomId },
                });
                console.log("[listenToRoom] Game started!");
            } else if (roomData.status === "waiting") {
                console.log("[listenToRoom] Waiting for players...");
            }

            callback(roomData);
        };

        onValue(roomRef, handler);

        return () => {
            try {
                off(roomRef, "value", handler); // ✅ Correct way to unsubscribe
            } catch (err) {
                console.warn("[listenToRoom] Failed to detach listener:", err.message);
            }
        };
    }

    async joinRoom(roomCode) {
        try {
            console.log("[joinRoom] Starting join process for code:", roomCode);

            const user = await this.waitForAuth();
            const userId = user.uid;
            console.log("[joinRoom] Authenticated user:", userId);

            const userData = await this.getUserData(userId);
            const avatar = userData?.avatar || 0;
            console.log("[joinRoom] User data loaded:", userData);

            // Query room by code
            const snapshot = await get(query(
                ref(database, "rooms"),
                orderByChild("code"),
                equalTo(roomCode.toUpperCase())
            ));
            console.log("[joinRoom] Firebase query executed for roomCode:", roomCode.toUpperCase());

            if (!snapshot.exists()) {
                console.warn("[joinRoom] No room found for code:", roomCode);
                throw new Error("Room not found or expired");
            }

            const roomId = Object.keys(snapshot.val())[0];
            const roomData = snapshot.val()[roomId];
            console.log("[joinRoom] Found room:", roomId, "Room data:", roomData);

            // Check room status
            if (roomData.status === "playing" || roomData.status === "finished") {
                console.warn("[joinRoom] Room already in progress or finished:", roomId);
                throw new Error("Game already in progress");
            }

            // Check capacity
            const currentPlayerCount = Object.keys(roomData.players || {}).length;
            if (currentPlayerCount >= roomData.maxPlayers) {
                throw new Error("Room is full");
            }

            // Check if user is already in room
            if (roomData.players && roomData.players[userId]) {
                console.log("[joinRoom] User already exists in room, updating status...");
                await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                    connected: true,
                    ready: true,
                    lastSeen: serverTimestamp()
                });
                console.log("[joinRoom] User reconnected successfully");
            } else {
                // New player joining
                const playerName = user.displayName ||
                    user.email?.split('@')[0] ||
                    `Player ${currentPlayerCount + 1}`;

                const playerData = {
                    name: playerName,
                    username: playerName,
                    ready: roomData.matchmakingRoom ? true : false,
                    score: 0,
                    isHost: false,
                    connected: true,
                    joinedAt: serverTimestamp(),
                    answers: {},
                    answer: "",
                    winner: false,
                    avatar: avatar || 0
                };

                if (roomData.matchmakingRoom) {
                    playerData.ready = true;
                }

                console.log("[joinRoom] Adding new player data:", playerData);

                await update(ref(database, `rooms/${roomId}`), {
                    [`players/${userId}`]: playerData,
                    currentPlayerCount: currentPlayerCount + 1,
                    lastActivity: serverTimestamp()
                });
                console.log("[joinRoom] New user added to room:", roomId);
            }

            console.log("[joinRoom] Successfully joined room:", roomId);
            return { roomId, roomData: { ...roomData, code: roomCode } };

        } catch (error) {
            console.error("[joinRoom] Error:", error);
            throw error;
        }
    }


    async validateRoomExists(roomId) {
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);
        return snapshot.exists();
    }

    async cancelMatchmaking() {
        await endBattleDueToHostExit();
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            // Remove from all matchmaking entries
            const matchmakingRef = ref(database, "matchmaking");
            const snapshot = await get(matchmakingRef);
            const matchmaking = snapshot.val() || {};

            const cleanupPromises = Object.entries(matchmaking)
                .filter(([roomId, data]) =>
                    data.hostId === userId || (data.players && data.players[userId])
                )
                .map(([roomId]) => remove(ref(database, `matchmaking/${roomId}`)));

            await Promise.allSettled(cleanupPromises);
        } catch (error) {
            // Don't log error, just silently fail
        }
    }

    removeRoomListener(roomId) {
        const listener = this.listeners.get(roomId);
        if (listener) {
            off(ref(database, `rooms/${roomId}`), listener);
            this.listeners.delete(roomId);
        }
    }

    async toggleReady(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const playerRef = ref(database, `rooms/${roomId}/players/${userId}`);
            const snapshot = await get(playerRef);

            if (!snapshot.exists()) {
                throw new Error("Player not found in room");
            }

            const currentReady = snapshot.val().ready;

            await update(playerRef, {
                ready: !currentReady,
                lastActivity: serverTimestamp()
            });

            await update(ref(database, `rooms/${roomId}`), {
                lastActivity: serverTimestamp()
            });

        } catch (error) {
            console.error("Toggle ready error:", error);
            throw error;
        }
    }

    async updatePlayerConnection(roomId, connected = true) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            // console.log(`Updating connection: ${connected} for ${userId} in ${roomId}`);

            await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                connected,
                lastSeen: serverTimestamp()
            });

            // Add room activity update
            await update(ref(database, `rooms/${roomId}`), {
                lastActivity: serverTimestamp()
            });
        } catch (error) {
            console.error("Update player connection error:", error);
        }
    }

    async startQuestionTransition(roomId, duration = 3000) {
        try {
            // console.log("Starting question transition for room:", roomId);
            const now = Date.now();
            const nextQuestionStartTime = now + duration;

            await update(ref(database, `rooms/${roomId}`), {
                questionTransition: true,
                nextQuestionStartTime,
                lastActivity: serverTimestamp()
            });

            // console.log("Question transition started, next question at:", new Date(nextQuestionStartTime));
            return nextQuestionStartTime;
        } catch (error) {
            console.error("Start transition error:", error);
            throw error;
        }
    }


    getFallbackQuestions(count = 25) {
        // console.log(`[BattleManager] Using ${count} fallback questions`);
        return Array(count).fill().map((_, i) => ({
            question: `${i + 1} + ${i + 5}`,
            correctAnswer: `${(i + 1) + (i + 5)}`,
            timeLimit: 15,
            points: Math.floor(i / 5) + 1, // Gradually increase points
            explanation: `Add ${i + 1} and ${i + 5} together`,
            level: Math.floor(i / 5) + 1
        }));
    }

    async handleTimeExpiry(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room || room.status !== "playing" || room.questionTransition) {
                return;
            }

            // Force transition if no winner and time is up
            if (!room.currentWinner) {
                await this.startQuestionTransition(roomId, 2000);
            }
        } catch (error) {
            console.error("Handle time expiry error:", error);
            throw error;
        }
    }

    async getUserData(userId) {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);
        return snapshot.val();
    }

    async generateQuestions(startLevel = 1, maxLevels = 10) {
        const quizzesRef = ref(database, "quizzes");
        const snapshot = await get(quizzesRef);
        if (!snapshot.exists()) return { questions: this.getFallbackQuestions(25), levelInfo: [], totalLevels: 0 };

        const questionsByLevel = {};
        const levelSettings = {};

        // Collect questions by level
        snapshot.forEach((childSnapshot) => {
            const quiz = childSnapshot.val();
            const level = quiz.level || 1;
            if (level >= startLevel && level <= maxLevels) {
                levelSettings[level] = {
                    pointsPerQuestion: Number.parseInt(quiz.pointsPerQuestion) || level,
                };
                if (quiz.questions) {
                    const questions = Array.isArray(quiz.questions) ? quiz.questions : Object.values(quiz.questions);
                    questions.forEach(q => {
                        if (q.questionText && q.correctAnswer !== undefined) {
                            if (!questionsByLevel[level]) questionsByLevel[level] = [];
                            questionsByLevel[level].push({
                                question: q.questionText,
                                correctAnswer: q.correctAnswer.toString(),
                                timeLimit: 15,
                                points: levelSettings[level].pointsPerQuestion,
                                explanation: q.explanation || "",
                                level: level
                            });
                        }
                    });
                }
            }
        });

        // Get available levels
        const availableLevels = Object.keys(questionsByLevel).map(Number).sort((a, b) => a - b);

        if (availableLevels.length === 0) {
            return { questions: this.getFallbackQuestions(25), levelInfo: [], totalLevels: 0 };
        }

        // Define question distribution for 25 total questions
        const battleQuestions = [];
        const targetTotal = 25;

        // Strategy: 3 questions from levels 1-5, 2 questions from levels 6-10
        const getQuestionsFromLevel = (level, count) => {
            if (!questionsByLevel[level] || questionsByLevel[level].length === 0) return [];

            const shuffled = [...questionsByLevel[level]].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, Math.min(count, shuffled.length));
        };

        // First, try to get questions according to the preferred distribution
        let questionsCollected = 0;

        // Levels 1-5: 3 questions each
        for (let level = 1; level <= 5 && questionsCollected < targetTotal; level++) {
            if (availableLevels.includes(level)) {
                const questions = getQuestionsFromLevel(level, 3);
                battleQuestions.push(...questions);
                questionsCollected += questions.length;
            }
        }

        // Levels 6-10: 2 questions each
        for (let level = 6; level <= 10 && questionsCollected < targetTotal; level++) {
            if (availableLevels.includes(level)) {
                const questions = getQuestionsFromLevel(level, 2);
                battleQuestions.push(...questions);
                questionsCollected += questions.length;
            }
        }

        // If we don't have 25 questions yet, fill from available levels
        if (questionsCollected < targetTotal) {
            const remainingNeeded = targetTotal - questionsCollected;
            const allRemainingQuestions = [];

            // Collect remaining questions from all levels
            availableLevels.forEach(level => {
                if (questionsByLevel[level]) {
                    const usedQuestions = battleQuestions.filter(q => q.level === level).length;
                    const remainingFromLevel = questionsByLevel[level].slice(usedQuestions);
                    allRemainingQuestions.push(...remainingFromLevel);
                }
            });

            // Shuffle and take what we need
            const shuffled = allRemainingQuestions.sort(() => 0.5 - Math.random());
            battleQuestions.push(...shuffled.slice(0, remainingNeeded));
        }

        // If we still don't have enough, use fallback
        if (battleQuestions.length < targetTotal) {
            const fallbackNeeded = targetTotal - battleQuestions.length;
            const fallbackQuestions = this.getFallbackQuestions(fallbackNeeded);
            battleQuestions.push(...fallbackQuestions);
        }

        // Shuffle final questions and limit to exactly 25
        const finalQuestions = battleQuestions.sort(() => 0.5 - Math.random()).slice(0, targetTotal);

        return {
            questions: finalQuestions,
            levelInfo: availableLevels.map(level => ({
                level: level,
                questionCount: questionsByLevel[level]?.length || 0,
                pointsPerQuestion: levelSettings[level]?.pointsPerQuestion || level,
                usedInBattle: finalQuestions.filter(q => q.level === level).length
            })),
            totalLevels: availableLevels.length
        };
    }

    async startBattle(roomId) {
        try {
            const user = await this.waitForAuth();
            this.userId = user.uid;

            if (!roomId) throw new Error("No roomId provided");

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room) throw new Error("Room not found");
            if (room.hostId !== this.userId) return; // Only host can start
            if (room.status === "playing") return; // Prevent double-starting

            // ✅ Check that at least 2 players are connected
            const connectedPlayers = Object.values(room.players || {}).filter(
                (p) => p.connected
            );
            if (connectedPlayers.length < 2) {
                throw new Error("At least 2 connected players are required");
            }

            // ✅ Generate quiz questions
            const questionData = await this.generateQuestions(1, 10);
            if (!questionData.questions || questionData.questions.length === 0) {
                throw new Error("Failed to generate questions");
            }

            const now = Date.now();

            // ✅ Prepare player state resets
            const playerUpdates: Record<string, any> = {};
            for (const playerId in room.players) {
                playerUpdates[`players/${playerId}/score`] = 0;
                playerUpdates[`players/${playerId}/answers`] = {};
                playerUpdates[`players/${playerId}/answer`] = "";
                playerUpdates[`players/${playerId}/winner`] = false;
                playerUpdates[`players/${playerId}/consecutiveCorrect`] = 0;
                playerUpdates[`players/${playerId}/ready`] = false;
            }

            // ✅ Build update payload
            const updateData = {
                status: "playing",
                questions: questionData.questions,
                currentQuestion: 0,
                currentLevel: 1,
                totalQuestions: 25,
                questionTimeLimit: 15,
                gameStartedAt: now,
                questionStartedAt: now,
                lastActivity: serverTimestamp(),
                questionTransition: false,
                nextQuestionStartTime: null,
                currentWinner: null,
                maxConsecutiveTarget: 0,
                consecutiveWinThreshold: 0,
                ...playerUpdates,
            };

            // ✅ Apply update
            await update(roomRef, updateData);
            console.log("[startBattle] Battle started for room:", roomId);
        } catch (error) {
            console.error("[startBattle] Error:", error.message);
            throw error;
        }
    }

    async submitAnswer(roomId, questionIndex, userAnswer) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomRef = ref(database, `rooms/${roomId}`);
            const roomSnapshot = await get(roomRef);
            const room = roomSnapshot.val();

            if (!room || room.status !== "playing" || questionIndex !== room.currentQuestion) {
                return false;
            }

            const currentQuestion = room.questions[questionIndex];
            if (!currentQuestion) return false;

            const currentPlayer = room.players[userId] || {};
            const isCorrect = currentQuestion.correctAnswer.toLowerCase() === userAnswer.toLowerCase();

            if (!isCorrect) {
                await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                    answer: userAnswer,
                    consecutiveCorrect: 0, // Reset on incorrect answer
                    lastActivity: serverTimestamp()
                });
                return false;
            }

            const winnerRef = ref(database, `rooms/${roomId}/currentWinner`);
            const txResult = await runTransaction(winnerRef, (current) => {
                if (!current) return userId;
                return current;
            });

            const basePoints = currentQuestion.level || 1;
            const pointsToAdd = txResult.committed && txResult.snapshot.val() === userId ? basePoints * 1 : basePoints * 0;
            const newScore = (currentPlayer.score || 0) + pointsToAdd;

            const remainingQuestions = room.totalQuestions - (questionIndex + 1);
            const gapToLastQuestion = remainingQuestions + 1; // Include current question

            if (txResult.committed && txResult.snapshot.val() === userId) {
                // First correct answer
                const newConsecutiveCorrect = (currentPlayer.consecutiveCorrect || 0) + 1;

                // Reset consecutive count for all other players
                const playerUpdates = {};
                Object.keys(room.players).forEach(playerId => {
                    if (playerId !== userId) {
                        playerUpdates[`players/${playerId}/consecutiveCorrect`] = 0;
                    }
                });

                await update(ref(database, `rooms/${roomId}`), {
                    [`players/${userId}/score`]: newScore,
                    [`players/${userId}/winner`]: true,
                    [`players/${userId}/consecutiveCorrect`]: newConsecutiveCorrect,
                    [`players/${userId}/answer`]: userAnswer,
                    ...playerUpdates,
                    lastActivity: serverTimestamp()
                });

                setTimeout(() => {
                    this.startQuestionTransition(roomId, 2000).catch(console.error('Error found'));
                }, 1000);

                return true;
            } else {
                // Not first, but correct
                await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                    score: newScore,
                    answer: userAnswer,
                    consecutiveCorrect: 0, // Reset since someone else answered first
                    lastActivity: serverTimestamp()
                });
                return false;
            }
        } catch (error) {
            console.error("Submit answer error:", error);
            throw error;
        }
    }

    // Add new method to declare winner
    async declareWinner(roomId, winnerId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const roomData = snapshot.val();

            if (!roomData) return;

            // Update final scores in database for each player
            const playerUpdates = {};
            Object.entries(roomData.players || {}).forEach(([playerId, player]) => {
                playerUpdates[`players/${playerId}/finalScore`] = player.score || 0;
                if (playerId === winnerId) {
                    playerUpdates[`players/${playerId}/isWinner`] = true;
                }
            });

            await update(roomRef, {
                ...playerUpdates,
                status: "finished",
                gameWinner: winnerId,
                gameEndReason: "consecutive_target_reached",
                finishedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            // Update user scores in database
            for (const [playerId, player] of Object.entries(roomData.players || {})) {
                const battleScore = player.score || 0;
                await this.updateUserScore(playerId, battleScore);
            }

        } catch (error) {
            console.error("Declare winner error:", error);
        }
    }

    async updateUserScore(userId, scoreToAdd) {
        try {
            if (scoreToAdd <= 0) return;

            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);
            const userData = snapshot.val() || {};

            const currentTotalPoints = userData.totalPoints || 0;
            const currentHighScore = userData.highScore || 0;
            const newTotalPoints = currentTotalPoints + scoreToAdd;

            // Update high score if current battle score is higher
            const newHighScore = Math.max(currentHighScore, scoreToAdd);

            let newStreak;
            const streakResult = await updateUserStreak();
            if (streakResult.increased) {
                newStreak = streakResult.streak;
            }

            await update(userRef, {
                totalPoints: newTotalPoints,
                highScore: newHighScore  // Add this line
            });

            if (!streakResult.alreadyPlayedToday) {
                await AsyncStorage.setItem("showStreakPopup", "true");
            }

        } catch (error) {
            console.error("Update user score error:", error);
        }
    }

    async disconnectFromRoom(roomId) {
        try {
            if (!roomId) return;

            // Remove any active listeners first
            if (battleManager.activeListeners && battleManager.activeListeners[roomId]) {
                battleManager.activeListeners[roomId]();
                delete battleManager.activeListeners[roomId];
            }

            // Get current user ID
            const currentUserId = await AsyncStorage.getItem('userId');
            if (!currentUserId) return;

            // Reference to the room
            const roomRef = ref(database, `battleRooms/${roomId}`);

            // Get current room data
            const roomSnapshot = await get(roomRef);
            if (!roomSnapshot.exists()) return;

            const roomData = roomSnapshot.val();

            // Remove player from room
            if (roomData.players && roomData.players[currentUserId]) {
                const updatedPlayers = { ...roomData.players };
                delete updatedPlayers[currentUserId];

                // Update room with removed player
                await update(roomRef, {
                    players: updatedPlayers,
                    [`lastActivity/${currentUserId}`]: null, // Remove activity tracking
                });

                // If no players left, mark room for cleanup
                if (Object.keys(updatedPlayers).length === 0) {
                    await update(roomRef, {
                        status: 'empty',
                        emptyAt: Date.now()
                    });
                }
            }

            // Update user's connection status
            const userRef = ref(database, `users/${currentUserId}/battleConnection`);
            await update(userRef, {
                isInBattle: false,
                currentRoomId: null,
                lastDisconnected: Date.now()
            });

            // console.log(`Disconnected from room: ${roomId}`);

        } catch (error) {
            console.error('Error disconnecting from room:', error);
            // Don't throw error to prevent blocking cleanup
        }
    }

    async deleteRoom(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            await remove(roomRef);
            // console.log('Room deleted successfully');
        } catch (error) {
            console.error('Error deleting room:', error);
            throw error;
        }
    }

    // Update moveToNextQuestion method
    async moveToNextQuestion(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            if (!snapshot.exists()) {
                throw new Error("Room has been deleted");
            }

            const roomData = snapshot.val();
            if (!roomData) return;

            const nextIndex = roomData.currentQuestion + 1;
            const now = Date.now();

            const questionsArray = roomData.questions
                ? (Array.isArray(roomData.questions) ? roomData.questions : Object.values(roomData.questions))
                : [];

            const hasMoreQuestions = nextIndex < questionsArray.length;

            // Reset player states for next question
            const playerUpdates = {};
            Object.keys(roomData.players).forEach(playerId => {
                playerUpdates[`players/${playerId}/answer`] = "";
                playerUpdates[`players/${playerId}/winner`] = false;
            });

            if (hasMoreQuestions) {
                const nextQuestion = questionsArray[nextIndex];
                const nextLevel = nextQuestion?.level || roomData.currentLevel;

                await update(roomRef, {
                    ...playerUpdates,
                    currentWinner: null,
                    currentQuestion: nextIndex,
                    currentLevel: nextLevel,
                    questionStartedAt: now,
                    questionTransition: false,
                    nextQuestionStartTime: null,
                    lastActivity: serverTimestamp()
                });
            } else {
                await this.endBattle(roomId);
            }
        } catch (error) {
            console.error("Move to next question error:", error);
            throw error;
        }
    }

    async endBattle(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const roomData = snapshot.val();

            // Always return array, never undefined
            if (!roomData || !roomData.players) {
                // Clean up empty room
                if (roomData) {
                    await update(roomRef, {
                        status: "finished",
                        finishedAt: serverTimestamp(),
                    });
                }
                return [];
            }

            const players = roomData.players;
            const playerArray = Object.keys(players).map(id => ({
                userId: id,
                username: players[id].username || players[id].name || "Unknown Player",
                score: players[id].score || 0,
                avatar: players[id].avatar || 0,
            })).sort((a, b) => b.score - a.score);

            for (const player of playerArray) {
                await this.updateUserScore(player.userId, player.score);
            }

            // Update room status
            await update(roomRef, {
                status: "finished",
                results: playerArray,
                finishedAt: serverTimestamp(),
            });

            // Schedule cleanup
            setTimeout(() => {
                this.cleanupRoom(roomId, "battle_completed").catch(() => { });
            }, 30000);

            return playerArray;
        } catch (error) {
            console.error("End battle error:", error);
            return []; // Always return array
        }
    }

    async checkGameProgression(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room || room.status !== "playing") return;

            const players = room.players;
            const currentQ = room.currentQuestion;
            const allAnswered = Object.keys(players).every(playerId =>
                players[playerId].answers && players[playerId].answers[currentQ] !== undefined
            );

            if (allAnswered) {
                if (currentQ < room.totalQuestions - 1) {
                    const now = Date.now();
                    await update(roomRef, {
                        currentQuestion: currentQ + 1,
                        questionStartedAt: now
                    });
                } else {
                    const results = Object.entries(players).map(([id, player]) => ({
                        playerId: id,
                        name: player.name,
                        score: player.score || 0
                    }));

                    await update(roomRef, {
                        status: "finished",
                        results: results.sort((a, b) => b.score - a.score),
                        finishedAt: serverTimestamp()
                    });
                }
            }
        } catch (error) {
            console.error("Check game progression error:", error);
        }
    }

    async leaveRoom(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);

            if (!snapshot.exists()) {
                this.removeRoomListener(roomId);
                return;
            }

            const roomData = snapshot.val();
            const playerCount = Object.keys(roomData.players || {}).length;

            if (roomData.status === "playing") {
                await this.updatePlayerConnection(roomId, false);
            } else {
                if (roomData.hostId === userId) {
                    const otherPlayers = Object.keys(roomData.players || {}).filter(id => id !== userId && roomData.players[id].connected);

                    if (otherPlayers.length > 0 && playerCount > 1) {
                        const newHostId = otherPlayers[0];
                        await update(roomRef, {
                            hostId: newHostId,
                            [`players/${newHostId}/isHost`]: true,
                            [`players/${userId}`]: null,
                            currentPlayerCount: otherPlayers.length,
                            lastActivity: serverTimestamp()
                        });
                    } else {
                        // No other players or only host - mark battle finished due to host leaving
                        await this.handleHostLeave(roomId);
                        await this.cleanupRoom(roomId, "host_left_empty_room");
                    }
                } else {
                    if (playerCount <= 1) {
                        // Last player leaving - remove room
                        await this.cleanupRoom(roomId, "last_player_left");
                    } else {
                        await update(roomRef, {
                            [`players/${userId}`]: null,
                            currentPlayerCount: playerCount - 1,
                            lastActivity: serverTimestamp()
                        });
                    }
                }
            }

            this.removeRoomListener(roomId);

        } catch (error) {
            console.error("Leave room error:", error);
            this.removeRoomListener(roomId);
        }
    }

    async cleanupRoom(roomId, reason = "manual") {
        try {
            // console.log(`Cleaning up room ${roomId} - Reason: ${reason}`);

            const roomRef = ref(database, `rooms/${roomId}`);
            await remove(roomRef);

            // Remove from listeners
            this.removeRoomListener(roomId);

            // Clean up matchmaking if applicable
            const matchmakingRef = ref(database, `matchmaking/${roomId}`);
            await remove(matchmakingRef).catch(() => { }); // Ignore errors

        } catch (error) {
            console.error("Room cleanup error:", error);
            // Don't throw error to prevent blocking other operations
        }
    }

    cleanup() {
        this.listeners.forEach((listener, roomId) => {
            off(ref(database, `rooms/${roomId}`), listener);
        });
        this.listeners.clear();

        if (this.matchmakingListener) {
            off(ref(database, "matchmaking"), this.matchmakingListener);
            this.matchmakingListener = null;
        }

        if (this.roomListener) {
            off(this.roomListener);
            this.roomListener = null;
        }

        if (this.userPresenceRef) {
            remove(this.userPresenceRef).catch(() => { });
        }

        this.cancelMatchmaking().catch(() => { });
    }
}

export const battleManager = new BattleManager();
