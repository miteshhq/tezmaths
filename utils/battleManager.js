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
    serverTimestamp,
    set,
    update,
    runTransaction
} from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";

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

            if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
                throw new Error("Max players must be an integer between 2 and 10");
            }

            const user = await this.waitForAuth();
            if (!user || !user.uid) {
                throw new Error("User authentication failed");
            }

            const userId = user.uid;

            const userData = await this.getUserData(userId);
            const avatar = userData?.avatar || 0;

            const roomCode = await this.generateUniqueRoomCode();
            if (!roomCode) {
                throw new Error("Failed to generate room code");
            }

            const playerName = user.displayName?.trim() || user.email?.split('@')[0] || "Player";

            const roomData = {
                roomName: roomName.trim(),
                hostId: userId,
                code: roomCode,
                status: "waiting",
                maxPlayers,
                currentPlayerCount: 1,
                createdAt: serverTimestamp(),
                lastActivity: serverTimestamp(),
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
                        avatar: avatar || 0
                    }
                },
                gameState: {
                    currentRound: 0,
                    totalRounds: 5,
                    currentQuestion: null,
                    timeLeft: 0
                }
            };

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

    async clearAllRooms() {
        try {
            const roomsRef = ref(database, "rooms");
            const snapshot = await get(roomsRef);

            if (snapshot.exists()) {
                const rooms = snapshot.val();
                const deletePromises = Object.keys(rooms).map(roomId =>
                    remove(ref(database, `rooms/${roomId}`))
                );

                await Promise.all(deletePromises);
                console.log(`Deleted ${deletePromises.length} rooms`);
                return deletePromises.length;
            }
            return 0;
        } catch (error) {
            console.error("Clear rooms error:", error);
            throw error;
        }
    }

    async findRandomMatch() {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomsSnapshot = await get(ref(database, "rooms"));
            const rooms = roomsSnapshot.val() || {};

            // Current timestamp
            const now = Date.now();
            const halfMinutesAgo = now - (30 * 1000);

            const availableRooms = Object.entries(rooms).filter(([roomId, room]) => {
                // Check if room meets basic criteria
                const isMatchmakingRoom = room.matchmakingRoom;
                const isWaiting = room.status === "waiting";
                const hasSpace = Object.keys(room.players || {}).length < room.maxPlayers;

                // Check if room is recent (created within last 2 minutes)
                const lastActivity = room.lastActivity || 0;
                const isRecent = lastActivity > halfMinutesAgo;

                // Additional check: ensure the room hasn't been abandoned
                // (no activity for more than 2 minutes means it's stale)
                const isActive = lastActivity > halfMinutesAgo;

                return isMatchmakingRoom && isWaiting && hasSpace && isRecent && isActive;
            });

            if (availableRooms.length > 0) {
                // Sort by most recent activity first
                availableRooms.sort(([, roomA], [, roomB]) =>
                    (roomB.lastActivity || 0) - (roomA.lastActivity || 0)
                );

                const [roomId, roomData] = availableRooms[0];

                // Update lastActivity before joining
                await update(ref(database, `rooms/${roomId}`), {
                    lastActivity: now
                });

                await this.joinRoom(roomData.code);
                return {
                    roomId,
                    roomCode: roomData.code,
                    isHost: false
                };
            }

            // No available rooms found, create a new one
            const roomName = `Quick Battle ${Date.now()}`;
            const { roomId, roomCode } = await this.createRoom(roomName, 2);

            // Set up the room for matchmaking with current timestamp
            await update(ref(database, `rooms/${roomId}`), {
                matchmakingRoom: true,
                lastActivity: now,
                [`players/${userId}/ready`]: true
            });

            return {
                roomId,
                roomCode,
                isHost: true
            };
        } catch (error) {
            console.error("Random match error:", error);
            throw new Error("Failed to find or create a match: " + error.message);
        }
    }


    async cleanupMatchmakingRoom(roomId) {
        try {
            await remove(ref(database, `matchmaking/${roomId}`));
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

    listenToRoom(roomId, callback) {
        const roomRef = ref(database, `rooms/${roomId}`);
        const listener = onValue(roomRef, async (snapshot) => {
            const roomData = snapshot.val();

            console.log(`Room ${roomId} update:`, {
                status: roomData?.status,
                players: roomData?.players ? Object.keys(roomData.players).length : 0,
                hostId: roomData?.hostId,
                currentUserId: this.userId
            });

            if (roomData) {
                // Auto-start only if current user is host
                if (roomData?.matchmakingRoom &&
                    roomData.status === "waiting" &&
                    Object.keys(roomData.players || {}).length === roomData.maxPlayers &&
                    roomData.hostId === this.userId) {

                    console.log("Conditions met for auto-start");

                    // Add a delay to ensure both clients are ready
                    setTimeout(async () => {
                        try {
                            console.log("=== STARTING BATTLE ===");
                            await this.startBattle(roomId);
                            console.log("=== BATTLE START SUCCESS ===");
                        } catch (error) {
                            console.error("=== BATTLE START FAILED ===", error);
                        }
                    }, 2000);
                }
            }

            callback(roomData);
        }, (error) => {
            console.error("Room listener error:", error);
            callback(null);
        });

        this.listeners.set(roomId, listener);
        return () => this.removeRoomListener(roomId);
    }

    async joinRoom(roomCode) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const userData = await this.getUserData(userId);
            const avatar = userData?.avatar || 0;

            console.log("Attempting to join room with code:", roomCode);

            const snapshot = await get(query(
                ref(database, "rooms"),
                orderByChild("code"),
                equalTo(roomCode.toUpperCase())
            ));

            if (!snapshot.exists()) {
                throw new Error("Room not found or expired");
            }

            const roomId = Object.keys(snapshot.val())[0];
            const roomData = snapshot.val()[roomId];

            console.log("Found room:", roomId, "Status:", roomData.status);

            if (roomData.status === "playing" || roomData.status === "finished") {
                throw new Error("Game already in progress");
            }

            const currentPlayerCount = Object.keys(roomData.players || {}).length;
            if (currentPlayerCount >= roomData.maxPlayers) {
                throw new Error("Room is full");
            }

            if (roomData.players && roomData.players[userId]) {
                await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                    connected: true,
                    ready: true, // Add this line to mark player as ready
                    lastSeen: serverTimestamp()
                });
            } else {
                // New player joining
                const playerName = user.displayName ||
                    user.email?.split('@')[0] ||
                    `Player ${currentPlayerCount + 1}`;

                const playerData = {
                    name: playerName,
                    username: playerName,
                    ready: roomData.matchmakingRoom ? true : false, // Auto-ready for matchmaking
                    score: 0,
                    isHost: false,
                    connected: true,
                    joinedAt: serverTimestamp(),
                    answers: {},
                    answer: "",
                    winner: false,
                    avatar: avatar || 0
                };

                // Ensure player is marked as ready for matchmaking rooms
                if (roomData.matchmakingRoom) {
                    playerData.ready = true;
                }

                await update(ref(database, `rooms/${roomId}`), {
                    [`players/${userId}`]: playerData,
                    currentPlayerCount: currentPlayerCount + 1,
                    lastActivity: serverTimestamp()
                });
            }

            return { roomId, roomData: { ...roomData, code: roomCode } };

        } catch (error) {
            console.error("Join room error:", error);
            throw error;
        }
    }

    async validateRoomExists(roomId) {
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);
        return snapshot.exists();
    }

    async cancelMatchmaking() {
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

            console.log(`Updating connection: ${connected} for ${userId} in ${roomId}`);

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
            console.log("Starting question transition for room:", roomId);
            const now = Date.now();
            const nextQuestionStartTime = now + duration;

            await update(ref(database, `rooms/${roomId}`), {
                questionTransition: true,
                nextQuestionStartTime,
                lastActivity: serverTimestamp()
            });

            console.log("Question transition started, next question at:", new Date(nextQuestionStartTime));
            return nextQuestionStartTime;
        } catch (error) {
            console.error("Start transition error:", error);
            throw error;
        }
    }


    getFallbackQuestions(count) {
        console.log("[BattleManager] Using fallback questions");
        return Array(count).fill().map((_, i) => ({
            question: `${i + 1} + ${i + 5}`,
            correctAnswer: `${(i + 1) + (i + 5)}`, // Fixed: proper addition instead of string concatenation
            timeLimit: 15,
            points: 10,
            explanation: `Add ${i + 1} and ${i + 5} together`
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
        if (!snapshot.exists()) return this.getFallbackQuestions(50);

        const questionsByLevel = {};
        const levelSettings = {};

        snapshot.forEach((childSnapshot) => {
            const quiz = childSnapshot.val();
            const level = quiz.level || 1;
            if (level >= startLevel && level <= maxLevels) {
                levelSettings[level] = {
                    maxDisplayQuestions: Math.max(1, Number.parseInt(quiz.maxDisplayQuestions) || 20),
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

        const allQuestions = [];
        for (let level = startLevel; level <= maxLevels; level++) {
            if (questionsByLevel[level]) {
                const settings = levelSettings[level];
                const maxQuestions = Math.min(settings.maxDisplayQuestions, questionsByLevel[level].length);
                const shuffled = [...questionsByLevel[level]].sort(() => 0.5 - Math.random());
                allQuestions.push(...shuffled.slice(0, maxQuestions));
            }
        }

        return {
            questions: allQuestions,
            levelInfo: Object.keys(levelSettings).map(level => ({
                level: Number(level),
                questionCount: questionsByLevel[level]?.length || 0,
                pointsPerQuestion: levelSettings[level].pointsPerQuestion,
                maxDisplayQuestions: levelSettings[level].maxDisplayQuestions
            })),
            totalLevels: Object.keys(levelSettings).length
        };
    }

    async startBattle(roomId) {
        try {
            console.log("[startBattle] Starting battle for room:", roomId);
            const user = await this.waitForAuth();
            this.userId = user.uid; // Ensure userId is set
            console.log("[startBattle] User:", this.userId);

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room) throw new Error("Room not found");
            if (room.hostId !== this.userId) return; // Only host can start
            if (Object.values(room.players || {}).filter(p => p.connected).length < 2) {
                throw new Error("Need at least 2 players");
            }

            console.log("[startBattle] Generating questions...");
            const questionData = await this.generateQuestions(1, 10);
            console.log(`[startBattle] Questions fetched: ${questionData.questions.length} questions`);

            if (!questionData.questions || questionData.questions.length === 0) {
                throw new Error("Failed to generate questions");
            }

            const playerUpdates = {};
            Object.keys(room.players).forEach(playerId => {
                playerUpdates[`players/${playerId}/score`] = 0;
                playerUpdates[`players/${playerId}/answers`] = {};
                playerUpdates[`players/${playerId}/answer`] = "";
                playerUpdates[`players/${playerId}/winner`] = false;
                playerUpdates[`players/${playerId}/consecutiveCorrect`] = 0;
            });

            const now = Date.now();
            const updateData = {
                status: "playing",
                questions: questionData.questions,
                currentQuestion: 0,
                currentLevel: 1,
                totalQuestions: questionData.questions.length,
                questionTimeLimit: 15,
                gameStartedAt: now,
                questionStartedAt: now,
                lastActivity: serverTimestamp(),
                questionTransition: false,
                nextQuestionStartTime: null,
                currentWinner: null,
                maxConsecutiveTarget: 50,
                consecutiveWinThreshold: 50,
                ...playerUpdates
            };

            console.log("[startBattle] Updating room with battle data");
            await update(roomRef, updateData);
            console.log("[startBattle] Battle started successfully");
        } catch (error) {
            console.error("[startBattle] Error:", error);
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

                // Check for consecutive win condition
                if (gapToLastQuestion > room.consecutiveWinThreshold && newConsecutiveCorrect >= room.maxConsecutiveTarget) {
                    await this.declareWinner(roomId, userId);
                    return true;
                }

                setTimeout(() => {
                    this.startQuestionTransition(roomId, 2000).catch(console.error);
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
                await this.updateUserScore(playerId, player.score || 0);
            }

        } catch (error) {
            console.error("Declare winner error:", error);
        }
    }

    // In battleManager.js, update updateUserScore
    async updateUserScore(userId, scoreToAdd) {
        try {
            if (scoreToAdd <= 0) return;

            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);
            const userData = snapshot.val() || {};

            const currentTotalPoints = userData.totalPoints || 0;
            const newTotalPoints = currentTotalPoints + scoreToAdd;

            // FIXED: Proper streak logic
            const today = new Date().toISOString().split("T")[0];
            const lastDate = userData.lastCompletionDate;
            const currentStreak = userData.streak || 0;

            let newStreak;
            if (!lastDate) {
                // First time playing
                newStreak = 1;
            } else {
                // Calculate difference in days
                const lastDateObj = new Date(lastDate);
                const todayDateObj = new Date(today);

                // Set hours to noon to avoid timezone issues
                lastDateObj.setHours(12, 0, 0, 0);
                todayDateObj.setHours(12, 0, 0, 0);

                const diffInDays = Math.round(
                    (todayDateObj.getTime() - lastDateObj.getTime()) /
                    (1000 * 60 * 60 * 24)
                );

                if (diffInDays === 0) {
                    // Same day, no change in streak
                    newStreak = currentStreak;
                } else if (diffInDays === 1) {
                    // Consecutive day, increment streak
                    newStreak = currentStreak + 1;
                } else if (diffInDays === 2) {
                    // Missed 1 day, pause streak
                    newStreak = currentStreak;
                } else {
                    // Missed 2+ days, reset streak to 1 (playing today)
                    newStreak = 1;
                }
            }

            await update(userRef, {
                totalPoints: newTotalPoints,
                streak: newStreak,
                lastCompletionDate: today,
            });

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

            console.log(`Disconnected from room: ${roomId}`);

        } catch (error) {
            console.error('Error disconnecting from room:', error);
            // Don't throw error to prevent blocking cleanup
        }
    }

    async deleteRoom(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            await remove(roomRef);
            console.log('Room deleted successfully');
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
                    const otherPlayers = Object.keys(roomData.players || {})
                        .filter(id => id !== userId && roomData.players[id].connected);

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
                        // No other players or only host - remove room
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
            console.log(`Cleaning up room ${roomId} - Reason: ${reason}`);

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