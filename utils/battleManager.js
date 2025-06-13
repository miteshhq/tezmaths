import {
    ref, get, set, update, remove, onValue, off, push,
    serverTimestamp, onDisconnect, query, orderByChild,
    equalTo, runTransaction
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
                        winner: false
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
            console.error("Create room error:", {
                message: error.message,
                stack: error.stack,
                roomName,
                maxPlayers,
                timestamp: new Date().toISOString()
            });

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

    async joinRoom(roomCode) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

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
                    lastSeen: serverTimestamp()
                });
            } else {
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
                    winner: false
                };

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

    async findRandomMatch() {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomsSnapshot = await get(ref(database, "rooms"));
            const rooms = roomsSnapshot.val() || {};

            const availableRooms = Object.entries(rooms).filter(([roomId, room]) =>
                room.matchmakingRoom &&
                room.status === "waiting" &&
                Object.keys(room.players || {}).length < 2
            );

            if (availableRooms.length > 0) {
                const [roomId, roomData] = availableRooms[0];
                await this.joinRoom(roomData.code);
                return { roomId, roomCode: roomData.code };
            }

            const roomName = `Quick Battle ${Date.now()}`;
            const { roomId, roomCode } = await this.createRoom(roomName, 2);

            await update(ref(database, `rooms/${roomId}`), {
                matchmakingRoom: true,
                [`players/${userId}/ready`]: true
            });

            return { roomId, roomCode };
        } catch (error) {
            console.error("Random match error:", error);
            throw new Error("Failed to find or create a match: " + error.message);
        }
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

    listenToRoom(roomId, callback) {
        const roomRef = ref(database, `rooms/${roomId}`);
        const listener = onValue(roomRef, (snapshot) => {
            const roomData = snapshot.val();

            if (roomData) {
                // Auto-start only if current user is host
                if (roomData?.matchmakingRoom &&
                    roomData.status === "waiting" &&
                    Object.keys(roomData.players || {}).length === roomData.maxPlayers &&
                    roomData.hostId === this.userId) {

                    const allReady = Object.values(roomData.players).every(p => p.ready);
                    if (allReady) {
                        setTimeout(() => {
                            this.startBattle(roomId).catch(console.error);
                        }, 1000);
                    }
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
        } catch (error) {
            console.error("Update player connection error:", error);
        }
    }

    async startBattle(roomId) {
        try {
            console.log("Starting battle for room:", roomId);

            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room) {
                throw new Error("Room not found");
            }

            if (room.hostId !== userId) {
                console.log("Not host, cannot start battle");
                return; // Don't throw error, just return silently
            }

            const connectedPlayers = Object.values(room.players || {}).filter(p => p.connected);
            console.log("Connected players:", connectedPlayers.length);

            if (connectedPlayers.length < 2) {
                throw new Error("Need at least 2 players");
            }

            // Generate questions with error handling
            let questions;
            try {
                questions = await this.generateQuestions(20);
                console.log("Generated questions:", questions);
            } catch (error) {
                console.error("Question generation failed:", error);
                questions = this.getFallbackQuestions(10);
            }

            if (!questions || questions.length === 0) {
                throw new Error("Failed to generate questions");
            }

            // Reset all player states for new game
            const playerUpdates = {};
            Object.keys(room.players).forEach(playerId => {
                playerUpdates[`players/${playerId}/score`] = 0;
                playerUpdates[`players/${playerId}/answers`] = {};
                playerUpdates[`players/${playerId}/answer`] = "";
                playerUpdates[`players/${playerId}/winner`] = false;
            });

            const questionsArray = questions.map((q, index) => ({
                ...q,
                id: `q${index}`
            }));

            // Use consistent timestamp format
            const now = Date.now();
            const updateData = {
                status: "playing",
                questions,
                currentQuestion: 0,
                totalQuestions: questionsArray.length,
                questionTimeLimit: 15,
                gameStartedAt: now,
                questionStartedAt: now,
                lastActivity: serverTimestamp(),
                questionTransition: false,
                nextQuestionStartTime: null,
                currentWinner: null,
                ...playerUpdates
            };

            console.log("Updating room with:", updateData);
            await update(roomRef, updateData);

            console.log("Battle started successfully");

        } catch (error) {
            console.error("Start battle error:", error);
            throw error;
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

    async generateQuestions(count = 10) {
        try {
            console.log("Generating questions, count:", count);

            const quizzesRef = ref(database, "quizzes");
            const snapshot = await get(quizzesRef);

            if (!snapshot.exists()) {
                console.log("No quizzes found in database, using fallback");
                return this.getFallbackQuestions(count);
            }

            let allQuestions = [];

            snapshot.forEach((childSnapshot) => {
                const quiz = childSnapshot.val();
                if (quiz.questions) {
                    // Handle both array and object formats
                    const questions = Array.isArray(quiz.questions)
                        ? quiz.questions
                        : Object.values(quiz.questions);

                    questions.forEach(q => {
                        if (q.questionText && q.correctAnswer !== undefined) {
                            allQuestions.push({
                                question: q.questionText,
                                correctAnswer: q.correctAnswer.toString(),
                                timeLimit: q.timeLimit || 15,
                                points: q.point || 10,
                                explanation: q.explanation || ""
                            });
                        }
                    });
                }
            });

            console.log("Total valid questions found:", allQuestions.length);

            if (allQuestions.length < count) {
                console.log(`Only ${allQuestions.length} questions found, adding ${count - allQuestions.length} fallback questions`);
                const additional = this.getFallbackQuestions(count - allQuestions.length);
                return [...allQuestions, ...additional].sort(() => Math.random() - 0.5);
            }

            return allQuestions.sort(() => Math.random() - 0.5).slice(0, count);
        } catch (error) {
            console.error("Error generating questions:", error);
            return this.getFallbackQuestions(count);
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

    async submitAnswer(roomId, questionIndex, userAnswer) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            console.log("Submitting answer:", { roomId, questionIndex, userAnswer, userId });

            // First update the player's answer immediately
            await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                answer: userAnswer,
                lastActivity: serverTimestamp()
            });

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room || room.status !== "playing" || questionIndex !== room.currentQuestion) {
                console.log("Invalid room state for answer submission");
                return false;
            }

            const currentQuestion = room.questions[questionIndex];
            if (!currentQuestion) {
                console.log("Current question not found");
                return false;
            }

            const isCorrect = currentQuestion.correctAnswer.toLowerCase() === userAnswer.toLowerCase();
            console.log("Answer is correct:", isCorrect);

            if (isCorrect && !room.currentWinner) {
                // This is the first correct answer
                console.log("First correct answer, updating score and starting transition");

                await update(ref(database, `rooms/${roomId}`), {
                    [`players/${userId}/score`]: (room.players[userId]?.score || 0) + 100,
                    [`players/${userId}/winner`]: true,
                    currentWinner: userId,
                    lastActivity: serverTimestamp()
                });

                // Start transition immediately with 2 second delay
                setTimeout(async () => {
                    try {
                        await this.startQuestionTransition(roomId, 2000);
                    } catch (error) {
                        console.error("Error starting transition:", error);
                    }
                }, 500);

                return true;
            }

            return isCorrect;
        } catch (error) {
            console.error("Submit answer error:", error);
            throw error;
        }
    }

    async moveToNextQuestion(roomId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const roomData = snapshot.val();

            if (!roomData) return;

            const nextIndex = roomData.currentQuestion + 1;
            const now = Date.now();

            // Convert questions to array if stored as object
            const questionsArray = roomData.questions
                ? Object.values(roomData.questions)
                : [];

            const hasMoreQuestions = nextIndex < questionsArray.length;

            // Reset player states
            const playerUpdates = {};
            Object.keys(roomData.players).forEach(playerId => {
                playerUpdates[`players/${playerId}/answer`] = "";
                playerUpdates[`players/${playerId}/winner`] = false;
            });

            if (hasMoreQuestions) {
                await update(roomRef, {
                    ...playerUpdates,
                    currentWinner: null,
                    currentQuestion: nextIndex,
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

    async handleTimeExpiry(roomId) {
        try {
            console.log("Handling time expiry for room:", roomId);

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room || room.status !== "playing" || room.questionTransition) {
                console.log("Room not in valid state for time expiry");
                return;
            }

            // Start transition if no winner yet
            if (!room.currentWinner) {
                console.log("No winner found, starting transition due to time expiry");
                await this.startQuestionTransition(roomId, 2000);
            }
        } catch (error) {
            console.error("Handle time expiry error:", error);
            throw error;
        }
    }

    async endBattle(roomId) {
        try {
            console.log("Ending battle for room:", roomId);

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const roomData = snapshot.val();

            if (!roomData) {
                console.log("Room not found for ending battle");
                return;
            }

            const playerArray = Object.entries(roomData.players || {})
                .map(([id, data]) => ({
                    userId: id,
                    username: data.username || data.name,
                    score: data.score || 0,
                }))
                .sort((a, b) => b.score - a.score);

            await update(roomRef, {
                status: "finished",
                results: playerArray,
                finishedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            // immediately clear the room data to prevent garbage storage
            await remove(ref(database, `rooms/${roomId}`));
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

            if (!snapshot.exists()) return;

            const roomData = snapshot.val();

            if (roomData.hostId === userId) {
                const otherPlayers = Object.keys(roomData.players || {})
                    .filter(id => id !== userId && roomData.players[id].connected);

                if (otherPlayers.length > 0) {
                    const newHostId = otherPlayers[0];
                    await update(roomRef, {
                        hostId: newHostId,
                        [`players/${newHostId}/isHost`]: true,
                        [`players/${userId}`]: null,
                        currentPlayerCount: otherPlayers.length,
                        lastActivity: serverTimestamp()
                    });
                } else {
                    await remove(roomRef);
                }
            } else {
                await update(roomRef, {
                    [`players/${userId}`]: null,
                    currentPlayerCount: Object.keys(roomData.players || {}).length - 1,
                    lastActivity: serverTimestamp()
                });
            }

            this.removeRoomListener(roomId);

        } catch (error) {
            console.error("Leave room error:", error);
            throw error;
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
