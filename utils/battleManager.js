import {
    ref, get, set, update, remove, onValue, off, push,
    serverTimestamp, onDisconnect, query, orderByChild,
    equalTo, runTransaction
} from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";

export class BattleManager {
    constructor() {
        this.listeners = new Map();
        this.userPresenceRef = null;
        this.matchmakingListener = null;
        this.roomListener = null; // Add this property
        this.setupUserPresence();
    }

    // Wait for auth state to be ready
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

            // Timeout after 5 seconds
            setTimeout(() => {
                unsubscribe();
                reject(new Error("Authentication timeout"));
            }, 5000);
        });
    }

    async setupUserPresence() {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

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

            // Check if code already exists
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

    // CREATE ROOM
    async createRoom(roomName, maxPlayers = 4) {
        try {
            // Input validation
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

            // Validate maxPlayers
            if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
                throw new Error("Max players must be an integer between 2 and 10");
            }

            // Wait for authentication
            const user = await this.waitForAuth();
            if (!user || !user.uid) {
                throw new Error("User authentication failed");
            }

            const userId = user.uid;

            // Generate room code with validation
            const roomCode = await this.generateUniqueRoomCode();
            if (!roomCode) {
                throw new Error("Failed to generate room code");
            }

            // Ensure user has a valid display name
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
                        ready: false,
                        score: 0,
                        isHost: true,
                        connected: true,
                        joinedAt: serverTimestamp(),
                        answers: {} // Initialize answers object
                    }
                },
                // Add game state initialization
                gameState: {
                    currentRound: 0,
                    totalRounds: 5,
                    currentQuestion: null,
                    timeLeft: 0
                }
            };

            // Create room reference and set data
            const newRoomRef = push(ref(database, "rooms"));
            if (!newRoomRef.key) {
                throw new Error("Failed to generate room reference");
            }

            await set(newRoomRef, roomData);

            // Verify the room was created successfully
            const snapshot = await get(newRoomRef);
            if (!snapshot.exists()) {
                throw new Error("Failed to verify room creation");
            }

            return {
                roomId: newRoomRef.key,
                roomCode,
                roomData: {
                    ...roomData,
                    createdAt: new Date().toISOString(), // Convert serverTimestamp for client
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
            // Enhanced error logging
            console.error("Create room error:", {
                message: error.message,
                stack: error.stack,
                roomName,
                maxPlayers,
                timestamp: new Date().toISOString()
            });

            // Re-throw with more specific error messages
            if (error.message.includes("permission") || error.message.includes("auth")) {
                throw new Error("Permission denied. Please check your authentication.");
            } else if (error.message.includes("network") || error.message.includes("offline")) {
                throw new Error("Network error. Please check your connection and try again.");
            } else if (error.message.startsWith("Room name") || error.message.startsWith("Max players")) {
                throw error; // Re-throw validation errors as-is
            } else {
                throw new Error(`Failed to create room: ${error.message}`);
            }
        }
    }

    // JOIN ROOM BY CODE
    async joinRoom(roomCode) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            // Find room by code
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

            // Check room status
            if (roomData.status === "playing" || roomData.status === "finished") {
                throw new Error("Game already in progress");
            }

            // Check if room is full
            const currentPlayerCount = Object.keys(roomData.players || {}).length;
            if (currentPlayerCount >= roomData.maxPlayers) {
                throw new Error("Room is full");
            }

            // Check if player is already in room
            if (roomData.players && roomData.players[userId]) {
                // Player rejoining - update connection status
                await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                    connected: true,
                    lastSeen: serverTimestamp()
                });
            } else {
                // New player joining
                const playerName = user.displayName ||
                    user.email?.split('@')[0] ||
                    `Player ${currentPlayerCount + 1}`;

                const playerData = {
                    name: playerName,
                    ready: roomData.matchmakingRoom ? true : false, // Auto-ready for quick battles
                    score: 0,
                    isHost: false,
                    connected: true,
                    joinedAt: serverTimestamp(),
                    answers: {} // Initialize answers object
                };

                // Add player to room
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

    // RANDOM MATCHMAKING
    async findRandomMatch() {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            // First, try to find existing waiting rooms
            const roomsSnapshot = await get(ref(database, "rooms"));
            const rooms = roomsSnapshot.val() || {};

            // Look for available matchmaking rooms
            const availableRooms = Object.entries(rooms).filter(([roomId, room]) =>
                room.matchmakingRoom &&
                room.status === "waiting" &&
                Object.keys(room.players || {}).length < room.maxPlayers
            );

            if (availableRooms.length > 0) {
                // Join existing room
                const [roomId, roomData] = availableRooms[0];
                await this.joinRoom(roomData.code);
                return { roomId, roomCode: roomData.code };
            }

            // Create new matchmaking room
            const roomName = `Quick Battle ${Date.now()}`;
            const { roomId, roomCode } = await this.createRoom(roomName, 2);

            // Mark as matchmaking room
            await update(ref(database, `rooms/${roomId}`), {
                matchmakingRoom: true,
                [`players/${userId}/ready`]: true // Auto-ready in matchmaking
            });

            return { roomId, roomCode };

        } catch (error) {
            console.error("Random match error:", error);
            throw error;
        }
    }

    // Cancel matchmaking
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

    // ROOM LISTENER
    listenToRoom(roomId, callback) {
        const roomRef = ref(database, `rooms/${roomId}`);
        const listener = onValue(roomRef, (snapshot) => {
            const roomData = snapshot.val();

            if (roomData) {
                // Auto-start quick battles when room is full
                if (roomData?.matchmakingRoom &&
                    roomData.status === "waiting" &&
                    Object.keys(roomData.players || {}).length === 2) {

                    const allReady = Object.values(roomData.players).every(p => p.ready);
                    if (allReady) {
                        // Auto-start the battle after a short delay
                        setTimeout(() => {
                            this.startBattle(roomId).catch(console.error);
                        }, 1000);
                    }
                }
            }

            // Call original callback
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

    // PLAYER STATUS
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

            // Update room's last activity
            await update(ref(database, `rooms/${roomId}`), {
                lastActivity: serverTimestamp()
            });

        } catch (error) {
            console.error("Toggle ready error:", error);
            throw error;
        }
    }

    // Update player connection status
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

    // START BATTLE
    async startBattle(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room || room.hostId !== userId) {
                throw new Error("Not authorized to start battle");
            }

            const connectedPlayers = Object.values(room.players || {}).filter(p => p.connected);
            if (connectedPlayers.length < 2) {
                throw new Error("Need at least 2 players");
            }

            const questions = await this.generateQuestions(10);
            if (questions.length === 0) {
                throw new Error("No questions available");
            }

            const now = Date.now();
            await update(roomRef, {
                status: "playing",
                questions,
                currentQuestion: 0,
                totalQuestions: questions.length,
                questionTimeLimit: 15,
                gameStartedAt: serverTimestamp(),
                questionStartedAt: now, // Add question start timestamp
                lastActivity: serverTimestamp()
            });
        } catch (error) {
            console.error("Start battle error:", error);
            throw new Error(error.message || "Failed to start battle");
        }
    }

    // GENERATE QUESTIONS FOR BATTLE
    async generateQuestions(count = 10) {
        try {
            const quizzesRef = ref(database, "quizzes");
            const snapshot = await get(quizzesRef);
            const quizzes = snapshot.val() || {};

            const allQuestions = [];
            Object.values(quizzes).forEach(quiz => {
                if (quiz.questions) {
                    Object.values(quiz.questions).forEach(q => {
                        if (q.questionText && q.options && q.correctAnswer !== undefined) {
                            allQuestions.push({
                                question: q.questionText,
                                options: q.options,
                                correctAnswer: parseInt(q.correctAnswer),
                                timeLimit: q.timeLimit || 15,
                                points: q.point || 10
                            });
                        }
                    });
                }
            });

            // Shuffle and select random questions
            const shuffled = allQuestions.sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count);
        } catch (error) {
            console.error("Error generating questions:", error);
            return [];
        }
    }

    // ANSWER SUBMISSION
    async submitAnswer(roomId, questionIndex, answerIndex) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;
            const roomRef = ref(database, `rooms/${roomId}`);

            let isCorrect = false;

            await runTransaction(roomRef, (room) => {
                if (!room || room.status !== "playing") return;
                if (questionIndex !== room.currentQuestion) return;

                isCorrect = room.questions[questionIndex].correctAnswer === answerIndex;
                const scoreIncrement = isCorrect ? 100 : 0;

                if (!room.players[userId]) return;

                // Initialize answers if not exists
                if (!room.players[userId].answers) {
                    room.players[userId].answers = {};
                }

                // Prevent duplicate answers
                if (room.players[userId].answers[questionIndex] === undefined) {
                    room.players[userId].answers[questionIndex] = {
                        answerIndex,
                        isCorrect,
                        timestamp: serverTimestamp()
                    };
                    room.players[userId].score = (room.players[userId].score || 0) + scoreIncrement;
                }

                return room;
            });

            await this.checkGameProgression(roomId);
            return isCorrect;
        } catch (error) {
            console.error("Submit answer error:", error);
            throw error;
        }
    }

    // CHECK IF ALL PLAYERS ANSWERED
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
                    // Next question
                    const now = Date.now();
                    await update(roomRef, {
                        currentQuestion: currentQ + 1,
                        questionStartedAt: now
                    });
                } else {
                    // Game finished
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

    // CLEANUP
    async leaveRoom(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);

            if (!snapshot.exists()) return;

            const roomData = snapshot.val();

            if (roomData.hostId === userId) {
                // If host is leaving, transfer host or delete room
                const otherPlayers = Object.keys(roomData.players || {})
                    .filter(id => id !== userId && roomData.players[id].connected);

                if (otherPlayers.length > 0) {
                    // Transfer host to first connected player
                    const newHostId = otherPlayers[0];
                    await update(roomRef, {
                        hostId: newHostId,
                        [`players/${newHostId}/isHost`]: true,
                        [`players/${userId}`]: null,
                        currentPlayerCount: otherPlayers.length,
                        lastActivity: serverTimestamp()
                    });
                } else {
                    // Delete room if no other players
                    await remove(roomRef);
                }
            } else {
                // Regular player leaving
                await update(roomRef, {
                    [`players/${userId}`]: null,
                    currentPlayerCount: Object.keys(roomData.players || {}).length - 1,
                    lastActivity: serverTimestamp()
                });
            }

            // Remove listener
            this.removeRoomListener(roomId);

        } catch (error) {
            console.error("Leave room error:", error);
            throw error;
        }
    }

    cleanup() {
        // Clean up all room listeners
        this.listeners.forEach((listener, roomId) => {
            off(ref(database, `rooms/${roomId}`), listener);
        });
        this.listeners.clear();

        // Clean up matchmaking listener
        if (this.matchmakingListener) {
            off(ref(database, "matchmaking"), this.matchmakingListener);
            this.matchmakingListener = null;
        }

        // Clean up room listener
        if (this.roomListener) {
            off(this.roomListener);
            this.roomListener = null;
        }

        // Clean up presence
        if (this.userPresenceRef) {
            remove(this.userPresenceRef).catch(() => { });
        }

        // Cancel any active matchmaking
        this.cancelMatchmaking().catch(() => { });
    }
}

export const battleManager = new BattleManager();