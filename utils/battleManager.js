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

    async findRandomMatch() {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            console.log("Starting random match search for user:", userId);

            // First, try to find an existing matchmaking room
            const roomsSnapshot = await get(ref(database, "rooms"));
            const rooms = roomsSnapshot.val() || {};

            const availableRooms = Object.entries(rooms).filter(([roomId, room]) => {
                const playerCount = Object.keys(room.players || {}).length;
                const isWaiting = room.status === "waiting";
                const isMatchmaking = room.matchmakingRoom;
                const userNotInRoom = !room.players[userId];
                const notStarting = !room.battleStarting && !room.autoStartTriggered;

                return (
                    isMatchmaking &&
                    isWaiting &&
                    playerCount === 1 &&
                    userNotInRoom &&
                    notStarting
                );
            });

            console.log("Available rooms found:", availableRooms.length);

            if (availableRooms.length > 0) {
                // Join existing room
                const [roomId, roomData] = availableRooms[0];
                console.log("Joining existing room:", roomId);

                // Mark room as starting to prevent others from joining
                await update(ref(database, `rooms/${roomId}`), {
                    waitingForOpponent: true,
                    battleStarting: false
                });

                const { roomId: joinedRoomId } = await this.joinRoom(roomData.code);
                return { roomId: joinedRoomId, roomCode: roomData.code };
            } else {
                // ... create new room and set waitingForOpponent ...
                await update(ref(database, `rooms/${roomId}`), {
                    waitingForOpponent: true,
                    battleStarting: false
                });
            }

            // No available rooms, create new one
            console.log("No available rooms, creating new matchmaking room");
            const roomName = `Quick Battle ${Date.now()}`;
            const { roomId, roomCode } = await this.createRoom(roomName, 2);

            // Mark as matchmaking room and set player ready
            await update(ref(database, `rooms/${roomId}`), {
                matchmakingRoom: true,
                [`players/${userId}/ready`]: true,
                waitingForOpponent: true,
                battleStarting: false,
                autoStartTriggered: false
            });

            console.log("Created matchmaking room:", roomId);
            return { roomId, roomCode };

        } catch (error) {
            console.error("Random match error:", error);
            throw new Error("Failed to find or create a match: " + error.message);
        }
    }

    // FIXED: Enhanced room listener with proper auto-start logic
    listenToRoom(roomId, callback) {
        const roomRef = ref(database, `rooms/${roomId}`);
        const listener = onValue(roomRef, async (snapshot) => {
            const roomData = snapshot.val();

            if (roomData) {
                const connectedPlayers = Object.values(roomData.players || {}).filter(p => p.connected);
                console.log(`Room ${roomId} update: status=${roomData.status}, connectedPlayers=${connectedPlayers.length}, hostId=${roomData.hostId}`);

                // FIXED: Auto-start logic for matchmaking rooms
                if (roomData.matchmakingRoom &&
                    roomData.status === "waiting" &&
                    connectedPlayers.length === 2 &&
                    roomData.hostId === this.userId) {

                    console.log("Matchmaking room full, checking if should auto-start...");

                    // Check if both players are ready (they should be auto-ready for matchmaking)
                    const readyPlayers = connectedPlayers.filter(p => p.ready);
                    if (readyPlayers.length === 2 && !roomData.autoStartTriggered) {
                        console.log("Both players ready, auto-starting battle...");

                        // Mark as auto-start triggered to prevent multiple attempts
                        await update(roomRef, { autoStartTriggered: true });

                        setTimeout(async () => {
                            try {
                                const currentSnapshot = await get(roomRef);
                                const currentRoom = currentSnapshot.val();

                                if (currentRoom &&
                                    currentRoom.status === "waiting" &&
                                    Object.values(currentRoom.players || {}).filter(p => p.connected && p.ready).length === 2) {
                                    console.log(`Starting battle for room ${roomId} with 2 ready players`);
                                    await this.startBattle(roomId);
                                    console.log("Battle started successfully");
                                } else {
                                    console.log(`Battle start aborted for room ${roomId}: conditions not met`);
                                }
                            } catch (error) {
                                console.error("Auto-start battle error:", error);
                                // Reset flag on error
                                await update(roomRef, { autoStartTriggered: false });
                            }
                        }, 1500); // 1.5 second delay
                    }
                }
            } else {
                console.log(`Room ${roomId} not found or deleted`);
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
                // Player already in room, just update connection
                await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                    connected: true,
                    ready: roomData.matchmakingRoom ? true : false, // Auto ready for matchmaking, manual for regular rooms
                    lastSeen: serverTimestamp()
                });
                console.log("Reconnected to room");
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

                await update(ref(database, `rooms/${roomId}`), {
                    [`players/${userId}`]: playerData,
                    currentPlayerCount: currentPlayerCount + 1,
                    lastActivity: serverTimestamp()
                });

                console.log("Successfully joined room as player", currentPlayerCount + 1);
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

            const matchmakingRef = ref(database, `matchmaking/${userId}`);
            await remove(matchmakingRef);

            if (this.matchmakingListener) {
                off(ref(database, "matchmaking"), this.matchmakingListener);
                this.matchmakingListener = null;
            }
        } catch (error) {
            console.error("Cancel matchmaking error:", error);
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

            const playerRef = ref(database, `rooms/${roomId}/players/${userId}`);
            await update(playerRef, {
                connected,
                lastSeen: serverTimestamp()
            });

            if (!connected) {
                const roomRef = ref(database, `rooms/${roomId}`);
                const snapshot = await get(roomRef);
                const room = snapshot.val();

                if (room && room.status === "playing") {
                    const connectedPlayers = Object.values(room.players || {}).filter(p => p.connected);
                    if (connectedPlayers.length < 2) {
                        const lastPlayer = connectedPlayers[0];
                        if (lastPlayer) {
                            await this.declareWinner(roomId, lastPlayer.userId || lastPlayer.id);
                        } else {
                            await this.endBattle(roomId);
                        }
                    }
                }
            }
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

    // Add fallback questions method
    getFallbackQuestions(count) {
        console.log("Using fallback questions");
        return Array(count).fill().map((_, i) => ({
            question: `${i + 1} + ${i + 5}`,
            correctAnswer: `${i + 1 + i + 5}`,
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

    // FIXED: Improved startBattle method
    async startBattle(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room) {
                throw new Error("Room not found");
            }

            if (room.hostId !== userId) {
                throw new Error("Only host can start battle");
            }

            if (room.status === "playing") {
                console.log("Battle already started");
                return;
            }

            const connectedPlayers = Object.values(room.players || {}).filter(p => p.connected);

            if (connectedPlayers.length < 2) {
                throw new Error("Need at least 2 players");
            }

            if (!room.matchmakingRoom) {
                const readyPlayers = connectedPlayers.filter(p => p.ready);
                if (readyPlayers.length < connectedPlayers.length) {
                    throw new Error("Not all connected players are ready");
                }
            }

            let questionData;
            try {
                console.log("Fetching questions for battle...");
                questionData = await this.generateQuestions(1, 10);
                console.log(`Questions fetched: ${questionData.questions.length} questions`);
            } catch (error) {
                console.error("Question generation failed:", error);
                questionData = {
                    questions: this.getFallbackQuestions(50),
                    levelInfo: [{ level: 1, questionCount: 50, pointsPerQuestion: 1 }],
                    totalLevels: 1
                };
            }

            if (!questionData.questions || questionData.questions.length === 0) {
                throw new Error("Failed to generate questions");
            }

            const playerUpdates = {};
            Object.keys(room.players).forEach(playerId => {
                playerUpdates[`players/${playerId}/score`] = 0;
                playerUpdates[`players/${playerId}/answers`] = {};
                playerUpdates[`players/${playerId}/answer`] = "";
                playerUpdates[`players/${playerId}/winner`] = false;
                playerUpdates[`players/${playerId}/levelScore`] = 0;
                playerUpdates[`players/${playerId}/consecutiveCorrect`] = 0;
            });

            const now = Date.now();
            const updateData = {
                status: "playing",
                questions: questionData.questions,
                levelInfo: questionData.levelInfo,
                currentQuestion: 0,
                currentLevel: 1,
                totalQuestions: questionData.questions.length,
                totalLevels: questionData.totalLevels,
                questionTimeLimit: 15,
                gameStartedAt: now,
                questionStartedAt: now,
                lastActivity: serverTimestamp(),
                questionTransition: false,
                nextQuestionStartTime: null,
                currentWinner: null,
                gamePhase: "playing",
                maxConsecutiveTarget: 50,
                autoStartTriggered: false, // Reset flag
                ...playerUpdates
            };

            await update(roomRef, updateData);
            console.log(`Battle started for room ${roomId} with ${connectedPlayers.length} players`);
        } catch (error) {
            console.error("Start battle error:", error);
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

            if (txResult.committed && txResult.snapshot.val() === userId) {
                // First correct answer - increment consecutive and reset others
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
                const remainingQuestions = room.questions.length - (questionIndex + 1);
                const questionsToWin = Math.min(50, remainingQuestions + 1);

                if (newConsecutiveCorrect >= questionsToWin) {
                    await this.declareWinner(roomId, userId);
                    return true;
                }

                setTimeout(() => {
                    this.startQuestionTransition(roomId, 2000).catch(console.error);
                }, 1000);

                return true;
            } else {
                const playerUpdates = {};
                Object.keys(room.players).forEach(playerId => {
                    playerUpdates[`players/${playerId}/consecutiveCorrect`] = 0;
                });
                // Not first, but correct - reset consecutive
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

    // Add method to update user scores
    async updateUserScore(userId, scoreToAdd) {
        try {
            if (scoreToAdd <= 0) return;

            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);
            const userData = snapshot.val() || {};

            const currentTotalPoints = userData.totalPoints || 0;
            const newTotalPoints = currentTotalPoints + scoreToAdd;

            const today = new Date().toISOString().split("T")[0];
            const lastDate = userData.lastCompletionDate;
            const currentStreak = userData.streak || 0;

            let newStreak;
            if (!lastDate || lastDate !== today) {
                const lastDateObj = new Date(lastDate || today);
                const todayDateObj = new Date(today);
                const diffInHours = (todayDateObj - lastDateObj) / (1000 * 60 * 60);
                if (diffInHours > 30) {
                    newStreak = 0;
                } else {
                    newStreak = currentStreak + 1;
                }
            } else {
                newStreak = currentStreak > 0 ? currentStreak : 1;
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

    // Update moveToNextQuestion method
    async moveToNextQuestion(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
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

    // Update endBattle method
    async endBattle(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const roomData = snapshot.val();

            if (!roomData) return;

            // Find winner based on highest score
            const playerArray = Object.entries(roomData.players || {})
                .map(([id, data]) => ({
                    userId: id,
                    username: data.username || data.name || "Unknown Player",
                    score: data.score || 0,
                    avatar: data.avatar || 0,
                    isHost: data.isHost || false,
                    consecutiveCorrect: data.consecutiveCorrect || 0
                }))
                .sort((a, b) => b.score - a.score);

            const winner = playerArray[0];

            // Update final results
            const playerUpdates = {};
            playerArray.forEach(player => {
                playerUpdates[`players/${player.userId}/finalScore`] = player.score;
                playerUpdates[`players/${player.userId}/isWinner`] = player.userId === winner.userId;
            });

            await update(roomRef, {
                ...playerUpdates,
                status: "finished",
                gameWinner: winner.userId,
                gameEndReason: "all_questions_completed",
                results: playerArray,
                finishedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            // Update user scores in database
            for (const player of playerArray) {
                await this.updateUserScore(player.userId, player.score);
            }

            // Schedule cleanup
            setTimeout(async () => {
                try {
                    const currentSnapshot = await get(roomRef);
                    if (currentSnapshot.exists()) {
                        await remove(roomRef);
                    }
                } catch (error) {
                    console.error("Final room cleanup error:", error);
                }
            }, 90000);

        } catch (error) {
            console.error("End battle error:", error);
            throw error;
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
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);

            if (snapshot.exists()) {
                console.log(`Cleaning up room ${roomId} - Reason: ${reason}`);
                await remove(roomRef);
            }

            this.removeRoomListener(roomId);
        } catch (error) {
            console.error("Room cleanup error:", error);
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