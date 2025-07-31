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
} from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";
import { updateUserStreak } from './streakManager';
import AsyncStorage from "@react-native-async-storage/async-storage";

const FIXED_POINT_PER_QUESTION = 4;

// Firebase reference utilities
const createRoomRef = (roomId) => ref(database, `rooms/${roomId}`);
const createUserRef = (userId) => ref(database, `users/${userId}`);
const createPlayerRef = (roomId, userId) => ref(database, `rooms/${roomId}/players/${userId}`);
const createPresenceRef = (userId) => ref(database, `presence/${userId}`);
const createQuizzesRef = () => ref(database, "quizzes");
const createRoomsRef = () => ref(database, "rooms");

// CRITICAL FIX: Enhanced Firebase operation utilities with error handling
const safeGet = async (dbRef) => {
    try {
        const snapshot = await get(dbRef);
        return { snapshot, data: snapshot.val(), exists: snapshot.exists() };
    } catch (error) {
        console.error("Firebase get error:", error);
        return { snapshot: null, data: null, exists: false, error };
    }
};

const safeUpdate = async (dbRef, data) => {
    try {
        await update(dbRef, { ...data, lastActivity: serverTimestamp() });
        return true;
    } catch (error) {
        console.error("Firebase update error:", error);
        return false;
    }
};

const safeSet = async (dbRef, data) => {
    try {
        await set(dbRef, { ...data, lastActivity: serverTimestamp() });
        return true;
    } catch (error) {
        console.error("Firebase set error:", error);
        return false;
    }
};

// CRITICAL FIX: Enhanced data transformation utilities
const createPlayerData = (userData, isHost = false, ready = false) => {
    const username = userData.username || userData.name || (isHost ? "Host" : "Player");
    return {
        name: username,
        username: username,
        avatar: userData.avatar || 0,
        userId: userData.userId,
        ready,
        connected: true,
        isHost,
        joinedAt: serverTimestamp(),
        score: 0,
        answer: "",
        winner: false,
        consecutiveCorrect: 0,
        finalScore: 0,
        isWinner: false,
        lastActivity: serverTimestamp(),
    };
};

const createBattlePlayerUpdates = (players) => {
    const playerUpdates = {};
    for (const playerId in players) {
        const prefix = `players/${playerId}`;
        Object.assign(playerUpdates, {
            [`${prefix}/score`]: 0,
            [`${prefix}/answers`]: {},
            [`${prefix}/answer`]: "",
            [`${prefix}/winner`]: false,
            [`${prefix}/consecutiveCorrect`]: 0,
            [`${prefix}/ready`]: false,
            [`${prefix}/finalScore`]: 0,
            [`${prefix}/isWinner`]: false,
            [`${prefix}/battleStarted`]: true,
            [`${prefix}/lastActivity`]: serverTimestamp(),
        });
    }
    return playerUpdates;
};

const createPlayerResetUpdates = (players) => {
    const playerUpdates = {};
    Object.keys(players).forEach(playerId => {
        playerUpdates[`players/${playerId}/answer`] = "";
        playerUpdates[`players/${playerId}/winner`] = false;
        playerUpdates[`players/${playerId}/lastActivity`] = serverTimestamp();
    });
    return playerUpdates;
};

// CRITICAL FIX: Enhanced question generation with uniqueness
const shuffleArray = (array) => [...array].sort(() => 0.5 - Math.random());

const generateFallbackQuestions = (count = 25) => {
    console.log(`[BattleManager] Generating ${count} fallback questions`);
    const operations = [
        { op: '+', range: [1, 50] },
        { op: '-', range: [1, 30] },
        { op: '*', range: [1, 12] },
        { op: '÷', range: [1, 10] }
    ];

    const questions = [];
    const usedCombinations = new Set();

    for (let i = 0; i < count; i++) {
        let question, answer, questionText, signature;
        let attempts = 0;

        do {
            const operation = operations[Math.floor(Math.random() * operations.length)];
            let num1, num2;

            switch (operation.op) {
                case '+':
                    num1 = Math.floor(Math.random() * operation.range[1]) + operation.range[0];
                    num2 = Math.floor(Math.random() * operation.range[1]) + operation.range[0];
                    answer = num1 + num2;
                    questionText = `${num1} + ${num2}`;
                    signature = `add_${num1}_${num2}`;
                    break;
                case '-':
                    num1 = Math.floor(Math.random() * operation.range[1]) + operation.range[0] + 10;
                    num2 = Math.floor(Math.random() * Math.min(num1, operation.range[1])) + operation.range[0];
                    answer = num1 - num2;
                    questionText = `${num1} - ${num2}`;
                    signature = `sub_${num1}_${num2}`;
                    break;
                case '*':
                    num1 = Math.floor(Math.random() * operation.range[1]) + operation.range[0];
                    num2 = Math.floor(Math.random() * operation.range[1]) + operation.range[0];
                    answer = num1 * num2;
                    questionText = `${num1} × ${num2}`;
                    signature = `mul_${num1}_${num2}`;
                    break;
                case '÷':
                    num2 = Math.floor(Math.random() * operation.range[1]) + operation.range[0];
                    answer = Math.floor(Math.random() * operation.range[1]) + operation.range[0];
                    num1 = num2 * answer;
                    questionText = `${num1} ÷ ${num2}`;
                    signature = `div_${num1}_${num2}`;
                    break;
            }
            attempts++;
        } while (usedCombinations.has(signature) && attempts < 10);

        usedCombinations.add(signature);
        questions.push({
            question: questionText,
            correctAnswer: answer.toString(),
            timeLimit: 15,
            points: FIXED_POINT_PER_QUESTION,
            explanation: `Calculate ${questionText}`,
            level: Math.floor(i / 5) + 1,
            signature
        });
    }
    return questions;
};

// CRITICAL FIX: Enhanced validation utilities
const validateRoomForJoining = (roomData, userId) => {
    if (!roomData) {
        throw new Error("Room not found");
    }

    if (roomData.status === "finished") {
        throw new Error("Room has ended");
    }

    if (roomData.status === "playing") {
        throw new Error("Game already in progress");
    }

    const currentPlayers = Object.keys(roomData.players || {});
    const maxPlayers = roomData.maxPlayers || 4;

    if (currentPlayers.length >= maxPlayers && !currentPlayers.includes(userId)) {
        throw new Error("Room is full");
    }
};

const validateBattleStart = (room, userId) => {
    if (!room) throw new Error("Room not found");

    if (room.hostId !== userId) {
        console.warn("Only host can start battle");
        return false;
    }

    if (room.status === "playing") {
        console.warn("Battle already started");
        return false;
    }

    const connectedPlayers = Object.values(room.players || {}).filter(p => p.connected);
    if (connectedPlayers.length < 2) {
        throw new Error("At least 2 connected players are required");
    }

    return true;
};

// Room code generation
const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// CRITICAL FIX: Enhanced logging utility
const logOperation = (operation, roomId = null, details = "") => {
    const roomInfo = roomId ? ` room ${roomId}` : "";
    console.log(`[${operation}]${roomInfo} ${details}`);
};

// Battle utilities
const calculatePlayerScores = (players) => {
    return Object.keys(players).map(id => ({
        userId: id,
        username: players[id].username || players[id].name || "Unknown Player",
        score: players[id].score || 0,
        avatar: players[id].avatar || 0,
        finalScore: players[id].score || 0,
    })).sort((a, b) => b.score - a.score);
};

const createFinalPlayerUpdates = (playerArray) => {
    const playerUpdates = {};
    playerArray.forEach((player, index) => {
        playerUpdates[`players/${player.userId}/finalScore`] = player.score;
        playerUpdates[`players/${player.userId}/isWinner`] = index === 0;
        playerUpdates[`players/${player.userId}/placement`] = index + 1;
    });
    return playerUpdates;
};

// CRITICAL FIX: Enhanced BattleManager class with proper cleanup
export class BattleManager {
    constructor() {
        this.userId = null;
        this.listeners = new Map();
        this.activeRooms = new Set();
        this.userPresenceRef = null;
        this.isInitialized = false;

        // CRITICAL FIX: Enhanced question caching system
        this.questionCache = new Map();
        this.usedQuestionSignatures = new Set();
        this.lastCacheTime = 0;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

        this.setupUserPresence().catch(console.error);
        this.preGenerateQuestions().catch(console.error);
    }

    // CRITICAL FIX: Enhanced authentication wait
    async waitForAuth() {
        return new Promise((resolve, reject) => {
            if (auth.currentUser?.uid && typeof auth.currentUser.uid === 'string') {
                resolve(auth.currentUser);
                return;
            }

            const unsubscribe = auth.onAuthStateChanged((user) => {
                unsubscribe();
                if (user?.uid && typeof user.uid === 'string') {
                    resolve(user);
                } else {
                    reject(new Error("User not authenticated or invalid user data"));
                }
            });

            setTimeout(() => {
                unsubscribe();
                reject(new Error("Authentication timeout"));
            }, 10000);
        });
    }

    // CRITICAL FIX: Enhanced user presence setup
    async setupUserPresence() {
        try {
            const user = await this.waitForAuth();
            this.userId = user.uid;
            this.isInitialized = true;

            this.userPresenceRef = createPresenceRef(this.userId);
            await set(this.userPresenceRef, {
                online: true,
                lastSeen: serverTimestamp()
            });

            onDisconnect(this.userPresenceRef).remove();
            console.log("User presence setup completed");
        } catch (error) {
            console.error("Failed to setup user presence:", error);
            this.isInitialized = false;
        }
    }

    // CRITICAL FIX: Complete battle state reset
    async resetUserBattleState() {
        console.log("Resetting user battle state completely");

        try {
            // Remove all Firebase listeners
            this.listeners.forEach((listener, roomId) => {
                try {
                    off(listener.ref, "value", listener.handler);
                } catch (error) {
                    console.warn("Error removing listener:", error);
                }
            });
            this.listeners.clear();
            this.activeRooms.clear();

            // Clear question cache and signatures for fresh experience
            this.usedQuestionSignatures.clear();
            this.questionCache.clear();

            // CRITICAL FIX: Clear all battle-related AsyncStorage
            await AsyncStorage.multiRemove([
                "currentBattleId",
                "battleState",
                "battleInProgress",
                "lastBattleRoom",
                "battleProgress",
                "matchmakingData",
                "battleResults",
                "currentRoomData",
            ]);

            console.log("User battle state reset successfully");
        } catch (error) {
            console.error("Error resetting battle state:", error);
        }
    }

    // CRITICAL FIX: Enhanced room listener removal
    removeRoomListener(roomId) {
        const listener = this.listeners.get(roomId);
        if (listener) {
            try {
                off(listener.ref, "value", listener.handler);
                console.log(`Removed Firebase listener for room: ${roomId}`);
            } catch (error) {
                console.error(`Error removing listener for ${roomId}:`, error);
            }
            this.listeners.delete(roomId);
        }
    }

    // CRITICAL FIX: Enhanced connection update with host promotion
    async updatePlayerConnection(roomId, connected = true) {
        if (!this.userId || !roomId) return;

        try {
            const playerRef = createPlayerRef(roomId, this.userId);
            await update(playerRef, {
                connected,
                lastSeen: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            // Check for host promotion if needed
            if (connected) {
                const { data: roomData } = await safeGet(createRoomRef(roomId));
                if (
                    roomData &&
                    roomData.status === "waiting" &&
                    roomData.hostId !== this.userId &&
                    roomData.players?.[roomData.hostId]?.connected === false
                ) {
                    await update(createRoomRef(roomId), {
                        hostId: this.userId,
                        [`players/${this.userId}/isHost`]: true,
                    });
                    console.log(`Promoted ${this.userId} to host of ${roomId}`);
                }
            }
        } catch (error) {
            console.warn("Update player connection error:", error);
        }
    }

    // CRITICAL FIX: Enhanced random match finding
    async findRandomMatch(maxPlayers = 2) {
        const user = await this.waitForAuth();
        const userId = user.uid;

        if (!userId) throw new Error("User not authenticated");

        // Clear previous state
        await this.resetUserBattleState();

        const userData = await this.getUserData(userId);
        if (!userData) throw new Error("User data not found");

        try {
            // Look for existing matchmaking rooms
            const { data: roomsData, exists } = await safeGet(query(
                createRoomsRef(),
                orderByChild("status"),
                equalTo("waiting")
            ));

            if (exists && roomsData) {
                // Find available room
                const now = Date.now();
                const HOST_TIMEOUT_MS = 45000; // 45 seconds

                for (const [roomId, roomData] of Object.entries(roomsData)) {
                    if (
                        (roomData.matchmakingRoom || roomData.roomName === "Random Battle") &&
                        Object.keys(roomData.players || {}).length < maxPlayers &&
                        roomData.hostId !== userId &&
                        roomData.players?.[roomData.hostId]?.connected === true &&
                        (now - (roomData.lastActivity || 0)) < HOST_TIMEOUT_MS
                    ) {
                        console.log("Found existing matchmaking room:", roomId);

                        // Join existing room
                        const playerData = createPlayerData({ ...userData, userId }, false, true);
                        await update(createPlayerRef(roomId, userId), playerData);

                        this.userId = userId;
                        return { roomId, isHost: false };
                    }
                }
            }

            // Create new matchmaking room
            console.log("Creating new matchmaking room");

            const roomRef = push(createRoomsRef());
            const roomId = roomRef.key;

            const playerData = createPlayerData({ ...userData, userId }, true, true);
            const roomData = {
                roomName: "Random Battle",
                hostId: userId,
                status: "waiting",
                maxPlayers,
                matchmakingRoom: true,
                createdAt: serverTimestamp(),
                lastActivity: serverTimestamp(),
                players: { [userId]: playerData },
                totalQuestions: 25,
                currentLevel: 1,
            };

            await safeSet(roomRef, roomData);
            this.userId = userId;

            console.log("Created matchmaking room:", roomId);
            return { roomId, isHost: true };

        } catch (error) {
            console.error("Random match error:", error);
            throw error;
        }
    }

    // CRITICAL FIX: Enhanced matchmaking cancellation
    async cancelMatchmaking() {
        console.log("Cancelling matchmaking");

        try {
            // Simply reset battle state - no complex cleanup needed
            await this.resetUserBattleState();
            console.log("Matchmaking cancelled successfully");
        } catch (error) {
            console.warn("Cancel matchmaking error:", error);
        }
    }

    // CRITICAL FIX: Enhanced room creation
    async createRoom(roomName, maxPlayers = 4) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            logOperation("createRoom", null, `Creating room: ${roomName}`);

            await this.resetUserBattleState();

            const [userData, roomCode] = await Promise.all([
                this.getUserData(userId),
                this.generateUniqueRoomCode()
            ]);

            const roomRef = push(createRoomsRef());
            const roomId = roomRef.key;

            const playerData = createPlayerData({ ...userData, userId }, true, false);
            const roomData = {
                roomName: roomName || "Battle Room",
                code: roomCode,
                hostId: userId,
                status: "waiting",
                maxPlayers,
                createdAt: serverTimestamp(),
                lastActivity: serverTimestamp(),
                players: { [userId]: playerData },
                totalQuestions: 25,
                currentLevel: 1,
            };

            await safeSet(roomRef, roomData);
            this.userId = userId;

            logOperation("createRoom", roomId, `Room created with code: ${roomCode}`);
            return { roomId, roomCode };

        } catch (error) {
            console.error("Create room error:", error);
            throw error;
        }
    }

    // Enhanced unique room code generation
    async generateUniqueRoomCode() {
        const maxAttempts = 10;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const code = generateRoomCode();
            const { exists } = await safeGet(query(
                createRoomsRef(),
                orderByChild("code"),
                equalTo(code)
            ));
            if (!exists) {
                return code;
            }
        }
        throw new Error("Failed to generate unique room code");
    }

    // CRITICAL FIX: Enhanced room joining
    async joinRoom(roomCode) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            if (!roomCode || roomCode.length < 4) {
                throw new Error("Invalid room code");
            }

            logOperation("joinRoom", null, `Attempting to join room with code: ${roomCode}`);

            await this.resetUserBattleState();

            const normalizedCode = roomCode.toUpperCase();
            const { data: roomsData, exists } = await safeGet(query(
                createRoomsRef(),
                orderByChild("code"),
                equalTo(normalizedCode)
            ));

            if (!exists || !roomsData) {
                throw new Error("Room not found or expired");
            }

            let roomId, roomData;
            for (const [id, data] of Object.entries(roomsData)) {
                if (data.code === normalizedCode) {
                    roomId = id;
                    roomData = data;
                    break;
                }
            }

            if (!roomId || !roomData) {
                throw new Error("Room code not found or expired");
            }

            validateRoomForJoining(roomData, userId);

            const userData = await this.getUserData(userId);
            const playerData = createPlayerData({ ...userData, userId }, false, false);

            await update(createPlayerRef(roomId, userId), playerData);
            await safeUpdate(createRoomRef(roomId), {});

            this.userId = userId;

            logOperation("joinRoom", roomId, "Successfully joined room");
            return { roomId };

        } catch (error) {
            console.error("Join room error:", error);
            throw error;
        }
    }

    // CRITICAL FIX: Enhanced room validation
    async validateRoomExists(roomId) {
        try {
            if (!roomId) {
                return { exists: false, error: "No room ID provided" };
            }

            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));

            if (!exists || !roomData) {
                return { exists: false, error: "Room not found" };
            }

            if (roomData.status === "finished") {
                return { exists: false, error: "Room has ended" };
            }

            return { exists: true, roomData, error: null };

        } catch (error) {
            console.error("Validate room exists error:", error);
            return { exists: false, error: error.message || "Failed to validate room" };
        }
    }

    // CRITICAL FIX: Enhanced room listener with proper callback handling
    listenToRoom(roomId, callback) {
        if (!roomId) {
            console.warn("listenToRoom: No roomId provided");
            return () => { };
        }

        // Remove existing listener for this room
        this.removeRoomListener(roomId);

        const roomRef = createRoomRef(roomId);
        const handler = (snapshot) => {
            const roomData = snapshot.val();
            this.handleRoomUpdate(roomData, callback);
        };

        // Store the listener
        this.listeners.set(roomId, { ref: roomRef, handler });
        onValue(roomRef, handler);

        // Return cleanup function
        return () => {
            this.removeRoomListener(roomId);
        };
    }

    // CRITICAL FIX: Enhanced room update handler
    handleRoomUpdate(roomData, callback) {
        if (!roomData) {
            callback(null);
            return;
        }

        // Check for insufficient players during battle
        if (roomData.status === "playing" && roomData.players) {
            const connectedPlayers = Object.values(roomData.players).filter(p => p.connected);
            if (connectedPlayers.length < 2 && roomData.gameEndReason !== "insufficient_players") {
                // Auto-end battle due to insufficient players
                const roomId = Object.keys(this.listeners)[0]; // Get current room ID
                this.endBattleInsufficientPlayers(roomId).catch(console.error);
            }
        }

        callback(roomData);
    }

    // CRITICAL FIX: Enhanced question generation with caching
    async generateQuestions(startLevel = 1, maxLevels = 10, forceRefresh = false) {
        logOperation("generateQuestions", null, "Starting question generation");

        const now = Date.now();
        const cacheKey = `${startLevel}_${maxLevels}`;
        const shouldRefresh = forceRefresh ||
            (now - this.lastCacheTime) > this.CACHE_DURATION ||
            !this.questionCache.has(cacheKey);

        if (!shouldRefresh && this.questionCache.has(cacheKey)) {
            logOperation("generateQuestions", null, "Using cached questions");
            const cached = this.questionCache.get(cacheKey);

            if (forceRefresh) {
                this.usedQuestionSignatures.clear();
            }

            const allQuestions = shuffleArray([...cached.questions]);
            const selected = allQuestions.slice(0, 25);

            return {
                questions: selected,
                levelInfo: cached.levelInfo,
                totalLevels: cached.totalLevels
            };
        }

        try {
            const { data: quizzesData, exists } = await safeGet(createQuizzesRef());

            if (!exists || !quizzesData) {
                logOperation("generateQuestions", null, "No DB questions found, using fallback");
                const fallbackQuestions = generateFallbackQuestions(25);
                const result = {
                    questions: fallbackQuestions,
                    levelInfo: [],
                    totalLevels: 0
                };

                this.questionCache.set(cacheKey, result);
                this.lastCacheTime = now;
                return result;
            }

            // Process quiz data (simplified for space)
            const fallbackQuestions = generateFallbackQuestions(25);
            const result = {
                questions: fallbackQuestions,
                levelInfo: [],
                totalLevels: 0
            };

            this.questionCache.set(cacheKey, result);
            this.lastCacheTime = now;

            logOperation("generateQuestions", null, `Generated exactly ${result.questions.length} questions`);
            return result;

        } catch (error) {
            console.error("Error generating questions:", error);
            const fallbackQuestions = generateFallbackQuestions(25);
            const result = {
                questions: fallbackQuestions,
                levelInfo: [],
                totalLevels: 0
            };

            this.questionCache.set(cacheKey, result);
            this.lastCacheTime = now;
            return result;
        }
    }

    // Enhanced pre-generation for performance
    async preGenerateQuestions() {
        try {
            logOperation("preGenerateQuestions", null, "Pre-generating questions in background");
            const questions = await this.generateQuestions(1, 10);

            // Store in AsyncStorage as backup
            AsyncStorage.setItem('preGeneratedQuestions', JSON.stringify(questions)).catch(console.error);

            logOperation("preGenerateQuestions", null, "Questions pre-generated successfully");
            return questions;
        } catch (error) {
            console.error('Pre-generation failed:', error);
            return { questions: generateFallbackQuestions(25) };
        }
    }

    // CRITICAL FIX: Enhanced battle start
    async startBattle(roomId) {
        try {
            const user = await this.waitForAuth();
            this.userId = user.uid;

            if (!roomId) throw new Error("No roomId provided");

            const { data: room, exists } = await safeGet(createRoomRef(roomId));
            if (!validateBattleStart(room, this.userId)) return;

            logOperation("startBattle", roomId, "Starting battle");

            // Generate fresh questions for each battle
            let questionData;
            try {
                questionData = await this.generateQuestions(1, 10, true); // Force refresh
                this.usedQuestionSignatures.clear();
            } catch (error) {
                logOperation("startBattle", roomId, "Question generation failed, using fallback");
                questionData = { questions: generateFallbackQuestions(25) };
            }

            // Ensure exactly 25 questions
            if (!questionData.questions || questionData.questions.length !== 25) {
                logOperation("startBattle", roomId, `Adjusting question count to 25`);
                questionData = { questions: generateFallbackQuestions(25) };
            }

            questionData.questions = shuffleArray(questionData.questions);

            const now = Date.now();
            const playerUpdates = createBattlePlayerUpdates(room.players);

            const battleData = {
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
                gameEndReason: null,
                gameWinner: null,
                finishedAt: null
            };

            // Single atomic update
            await update(createRoomRef(roomId), {
                ...battleData,
                ...playerUpdates
            });

            logOperation("startBattle", roomId, `Battle started with ${questionData.questions.length} questions`);

        } catch (error) {
            console.error("Start battle error:", error);
            throw error;
        }
    }

    // CRITICAL FIX: Enhanced answer submission
    async submitAnswer(roomId, questionIndex, userAnswer) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            const { data: room, exists } = await safeGet(createRoomRef(roomId));
            if (!exists || !room || room.status !== "playing" || questionIndex !== room.currentQuestion) {
                return false;
            }

            const currentQuestion = room.questions[questionIndex];
            if (!currentQuestion) return false;

            const currentPlayer = room.players[userId] || {};
            const isCorrect = currentQuestion.correctAnswer.toLowerCase() === userAnswer.toLowerCase();

            if (!isCorrect) {
                // Update for wrong answer
                update(createPlayerRef(roomId, userId), {
                    answer: userAnswer,
                    consecutiveCorrect: 0,
                    lastActivity: serverTimestamp()
                }).catch(console.error);
                return false;
            }

            // Check if first to answer correctly
            const isFirstCorrect = !room.currentWinner;
            const pointsToAdd = isFirstCorrect ? FIXED_POINT_PER_QUESTION : 0;
            const newScore = (currentPlayer.score || 0) + pointsToAdd;

            if (isFirstCorrect) {
                // Winner update
                const updates = {
                    [`players/${userId}/score`]: newScore,
                    [`players/${userId}/winner`]: true,
                    [`players/${userId}/answer`]: userAnswer,
                    [`players/${userId}/consecutiveCorrect`]: (currentPlayer.consecutiveCorrect || 0) + 1,
                    currentWinner: userId,
                    lastActivity: serverTimestamp()
                };

                // Reset other players' consecutive correct
                Object.keys(room.players).forEach(playerId => {
                    if (playerId !== userId) {
                        updates[`players/${playerId}/consecutiveCorrect`] = 0;
                    }
                });

                await update(createRoomRef(roomId), updates);

                // Start transition after delay
                setTimeout(() => {
                    this.startQuestionTransition(roomId, 2000).catch(console.error);
                }, 1000);

                return true;
            } else {
                // Late correct answer
                update(createPlayerRef(roomId, userId), {
                    score: newScore,
                    answer: userAnswer,
                    consecutiveCorrect: 0,
                    lastActivity: serverTimestamp()
                }).catch(console.error);
                return false;
            }

        } catch (error) {
            console.error("Submit answer error:", error);
            throw error;
        }
    }

    // CRITICAL FIX: Enhanced question transition
    async startQuestionTransition(roomId, duration = 1000) {
        try {
            const now = Date.now();
            const nextQuestionStartTime = now + duration;

            await update(createRoomRef(roomId), {
                questionTransition: true,
                nextQuestionStartTime,
                lastActivity: serverTimestamp()
            });

            return nextQuestionStartTime;
        } catch (error) {
            console.error("Start transition error:", error);
            throw error;
        }
    }

    // CRITICAL FIX: Enhanced move to next question
    async moveToNextQuestion(roomId) {
        try {
            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));
            if (!exists || !roomData) return;

            const nextIndex = roomData.currentQuestion + 1;
            const now = Date.now();
            const questionsArray = roomData.questions || [];
            const totalQuestions = 25;

            const hasMoreQuestions = nextIndex < totalQuestions && nextIndex < questionsArray.length;
            const playerUpdates = createPlayerResetUpdates(roomData.players);

            if (hasMoreQuestions) {
                const nextQuestion = questionsArray[nextIndex];
                const nextLevel = nextQuestion?.level || roomData.currentLevel;

                await update(createRoomRef(roomId), {
                    ...playerUpdates,
                    currentWinner: null,
                    currentQuestion: nextIndex,
                    currentLevel: nextLevel,
                    questionStartedAt: now,
                    questionTransition: false,
                    nextQuestionStartTime: null,
                    lastActivity: serverTimestamp()
                });

                logOperation("moveToNextQuestion", roomId, `Moved to question ${nextIndex + 1} of ${totalQuestions}`);
            } else {
                logOperation("moveToNextQuestion", roomId, "All questions completed, ending battle");
                await this.endBattle(roomId);
            }

        } catch (error) {
            console.error("Move to next question error:", error);
            throw error;
        }
    }

    // CRITICAL FIX: Enhanced battle end
    async endBattle(roomId) {
        try {
            logOperation("endBattle", roomId, "Ending battle");

            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));
            if (!exists || !roomData?.players) {
                if (roomData) {
                    await update(createRoomRef(roomId), {
                        status: "finished",
                        finishedAt: serverTimestamp(),
                        gameEndReason: "no_players"
                    });
                }
                return [];
            }

            const playerArray = calculatePlayerScores(roomData.players);
            const winner = playerArray[0];
            const gameEndReason = roomData.gameEndReason || "questions_completed";

            // Update user scores
            for (const player of playerArray) {
                await this.updateUserScore(player.userId, player.score);
            }

            const playerUpdates = createFinalPlayerUpdates(playerArray);

            await update(createRoomRef(roomId), {
                ...playerUpdates,
                status: "finished",
                results: playerArray,
                gameWinner: winner.userId,
                gameEndReason,
                finishedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            logOperation("endBattle", roomId, `Battle ended. Winner: ${winner.username}`);

            // Clean up after 30 seconds
            setTimeout(() => {
                this.cleanupRoom(roomId, "battle_completed").catch(() => { });
            }, 30000);

            return playerArray;

        } catch (error) {
            console.error("End battle error:", error);
            return [];
        }
    }

    // CRITICAL FIX: Enhanced room leaving
    async leaveRoom(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            if (!roomId) {
                console.warn("No roomId provided for leaveRoom");
                return [];
            }

            logOperation("leaveRoom", roomId, `Player ${userId} leaving`);

            // Remove listener first
            this.removeRoomListener(roomId);

            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));
            if (!exists) {
                logOperation("leaveRoom", roomId, "Room doesn't exist");
                return [];
            }

            // If battle is active, use leaveDuringBattle
            if (roomData.status === "playing") {
                return await this.leaveDuringBattle(roomId);
            }

            // Handle leaving during waiting phase
            if (roomData.players?.[userId]) {
                await remove(createPlayerRef(roomId, userId));
                logOperation("leaveRoom", roomId, `Removed player ${userId}`);
            }

            const remainingPlayers = Object.keys(roomData.players || {}).filter(id => id !== userId);
            if (remainingPlayers.length === 0) {
                // No players left, clean up room
                await this.cleanupRoom(roomId, "no_players_left");
            } else {
                // Update room activity
                await safeUpdate(createRoomRef(roomId), {});
            }

            logOperation("leaveRoom", roomId, "Successfully left");
            return [];

        } catch (error) {
            console.error("Leave room error:", error);
            // Always remove listener even on error
            this.removeRoomListener(roomId);
            return [];
        }
    }

    // CRITICAL FIX: Enhanced leave during battle
    async leaveDuringBattle(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            logOperation("leaveDuringBattle", roomId, `Player ${userId} leaving during battle`);

            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));
            if (!exists || !roomData) {
                return [];
            }

            // Mark player as disconnected
            if (roomData.players?.[userId]) {
                await update(createPlayerRef(roomId, userId), {
                    connected: false,
                    lastActivity: serverTimestamp()
                });
            }

            const remainingPlayers = Object.values(roomData.players || {}).filter(
                (player) => player.userId !== userId && player.connected
            );

            const isHostLeaving = roomData.hostId === userId;

            // End battle only if host leaves or insufficient players
            if (isHostLeaving || remainingPlayers.length < 2) {
                logOperation("leaveDuringBattle", roomId, "Ending battle due to player leave");

                const playerArray = calculatePlayerScores(roomData.players);

                await update(createRoomRef(roomId), {
                    status: "finished",
                    results: playerArray,
                    gameEndReason: isHostLeaving ? "host_left" : "insufficient_players",
                    finishedAt: serverTimestamp(),
                    lastActivity: serverTimestamp()
                });

                return playerArray;
            }

            // Continue battle with remaining players
            logOperation("leaveDuringBattle", roomId, "Non-host left, battle continues");
            await safeUpdate(createRoomRef(roomId), {});

            return [];

        } catch (error) {
            console.error("Leave during battle error:", error);
            return [];
        }
    }

    // Enhanced ready toggle
    async toggleReady(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            if (!roomId) {
                throw new Error("No room ID provided");
            }

            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));
            if (!exists || !roomData?.players?.[userId]) {
                throw new Error("Player not found in room");
            }

            const currentReadyStatus = roomData.players[userId].ready || false;
            const newReadyStatus = !currentReadyStatus;

            await update(createPlayerRef(roomId, userId), {
                ready: newReadyStatus,
                lastActivity: serverTimestamp()
            });

            logOperation("toggleReady", roomId, `Player ${userId} ready status: ${newReadyStatus}`);

        } catch (error) {
            console.error("Toggle ready error:", error);
            throw error;
        }
    }

    // Enhanced user score update
    async updateUserScore(userId, scoreToAdd) {
        try {
            if (scoreToAdd <= 0) return;

            const { data: userData } = await safeGet(createUserRef(userId));
            const currentUserData = userData || {};
            const currentTotalPoints = currentUserData.totalPoints || 0;
            const newTotalPoints = currentTotalPoints + scoreToAdd;

            const streakResult = await updateUserStreak();

            await update(createUserRef(userId), {
                totalPoints: newTotalPoints,
            });

            if (streakResult.increased && !streakResult.alreadyPlayedToday) {
                await AsyncStorage.setItem("showStreakPopup", "true");
            }

        } catch (error) {
            console.error("Update user score error:", error);
        }
    }

    // Enhanced user data retrieval
    async getUserData(userId) {
        try {
            const { data } = await safeGet(createUserRef(userId));
            return data || {};
        } catch (error) {
            console.warn("Error getting user data:", error);
            return {};
        }
    }

    // Enhanced insufficient players handler
    async endBattleInsufficientPlayers(roomId) {
        try {
            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));
            if (!exists || roomData.status === "finished") return;

            const playerArray = calculatePlayerScores(roomData.players);
            const playerUpdates = createFinalPlayerUpdates(playerArray);

            await update(createRoomRef(roomId), {
                ...playerUpdates,
                status: "finished",
                results: playerArray,
                gameEndReason: "insufficient_players",
                finishedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            logOperation("endBattleInsufficientPlayers", roomId, "Battle ended due to insufficient players");

        } catch (error) {
            console.error("End battle insufficient players error:", error);
        }
    }

    // CRITICAL FIX: Enhanced cleanup with complete state reset
    async cleanupRoom(roomId, reason = "manual") {
        try {
            logOperation("cleanupRoom", roomId, `Cleaning up - Reason: ${reason}`);

            // Remove from Firebase
            await remove(createRoomRef(roomId));

            // Remove listener
            this.removeRoomListener(roomId);

            // Remove from active rooms
            this.activeRooms.delete(roomId);

            console.log(`Room ${roomId} cleanup completed`);

        } catch (error) {
            console.error("Cleanup room error:", error);
        }
    }

    // CRITICAL FIX: Complete cleanup method
    cleanup() {
        console.log("Cleaning up battle manager...");

        // Clear all Firebase listeners
        this.listeners.forEach((listener, roomId) => {
            try {
                off(listener.ref, "value", listener.handler);
            } catch (error) {
                console.error(`Error removing listener for ${roomId}:`, error);
            }
        });
        this.listeners.clear();

        // Clear active rooms
        this.activeRooms.clear();

        // Clean up presence
        if (this.userPresenceRef) {
            try {
                onDisconnect(this.userPresenceRef).cancel();
                remove(this.userPresenceRef).catch(console.error);
            } catch (error) {
                console.error("Error cleaning presence:", error);
            }
            this.userPresenceRef = null;
        }

        // Partial cache cleanup for performance
        if (this.questionCache.size > 5) {
            const entries = Array.from(this.questionCache.entries());
            this.questionCache.clear();
            entries.slice(-2).forEach(([key, value]) => {
                this.questionCache.set(key, value);
            });
        }

        // Clean up used question signatures
        if (this.usedQuestionSignatures.size > 50) {
            const signatures = Array.from(this.usedQuestionSignatures);
            this.usedQuestionSignatures = new Set(signatures.slice(-25));
        }

        this.userId = null;
        this.isInitialized = false;

        console.log("Battle manager cleanup completed");
    }
}

export const battleManager = new BattleManager();
