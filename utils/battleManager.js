import {
    equalTo, get, off, onDisconnect, onValue, orderByChild, push, query,
    ref, remove, runTransaction, serverTimestamp, set, update
} from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";
import { updateUserStreak } from './streakManager';
import AsyncStorage from "@react-native-async-storage/async-storage";

// === EXTERNAL UTILITY FUNCTIONS ===

const FIXED_POINT_PER_QUESTINON = 4;

// Firebase reference utilities
const createRoomRef = (roomId) => ref(database, `rooms/${roomId}`);
const createUserRef = (userId) => ref(database, `users/${userId}`);
const createPlayerRef = (roomId, userId) => ref(database, `rooms/${roomId}/players/${userId}`);
const createPresenceRef = (userId) => ref(database, `presence/${userId}`);
const createQuizzesRef = () => ref(database, "quizzes");
const createRoomsRef = () => ref(database, "rooms");

// Firebase operation utilities
const safeGet = async (dbRef) => {
    const snapshot = await get(dbRef);
    return { snapshot, data: snapshot.val(), exists: snapshot.exists() };
};

const safeUpdate = async (dbRef, data) => {
    await update(dbRef, { ...data, lastActivity: serverTimestamp() });
};

const safeSet = async (dbRef, data) => {
    await set(dbRef, { ...data, lastActivity: serverTimestamp() });
};

// Data transformation utilities
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
        score: 0
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
            [`${prefix}/isWinner`]: false
        });
    }
    return playerUpdates;
};

const createPlayerResetUpdates = (players) => {
    const playerUpdates = {};
    Object.keys(players).forEach(playerId => {
        playerUpdates[`players/${playerId}/answer`] = "";
        playerUpdates[`players/${playerId}/winner`] = false;
    });
    return playerUpdates;
};

// Question generation utilities
const shuffleArray = (array) => [...array].sort(() => 0.5 - Math.random());

const generateFallbackQuestions = (count = 25) => {
    console.log(`[BattleManager] Generating ${count} fallback questions`);
    return Array(count).fill().map((_, i) => ({
        question: `${i + 1} + ${i + 5}`,
        correctAnswer: `${(i + 1) + (i + 5)}`,
        timeLimit: 15,
        points: FIXED_POINT_PER_QUESTINON,
        explanation: `Add ${i + 1} and ${i + 5} together`,
        level: Math.floor(i / 5) + 1
    }));
};

const processQuizData = (quizzesData, startLevel, maxLevels) => {
    const questionsByLevel = {};
    const levelSettings = {};

    Object.values(quizzesData).forEach((quiz) => {
        const level = quiz.level || 1;
        if (level >= startLevel && level <= maxLevels) {
            levelSettings[level] = {
                pointsPerQuestion: FIXED_POINT_PER_QUESTINON
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
                            points: FIXED_POINT_PER_QUESTINON,
                            explanation: q.explanation || "",
                            level: level
                        });
                    }
                });
            }
        }
    });

    return { questionsByLevel, levelSettings };
};

const collectQuestionsFromLevels = (questionsByLevel, availableLevels) => {
    const battleQuestions = [];
    const TARGET_TOTAL = 25;
    let questionsCollected = 0;

    const getQuestionsFromLevel = (level, count) => {
        if (!questionsByLevel[level]?.length) return [];
        return shuffleArray(questionsByLevel[level]).slice(0, Math.min(count, questionsByLevel[level].length));
    };

    // Collect from levels 1-5 (3 questions each)
    for (let level = 1; level <= 5 && questionsCollected < TARGET_TOTAL; level++) {
        if (availableLevels.includes(level)) {
            const questions = getQuestionsFromLevel(level, 3);
            battleQuestions.push(...questions);
            questionsCollected += questions.length;
        }
    }

    // Collect from levels 6-10 (2 questions each)
    for (let level = 6; level <= 10 && questionsCollected < TARGET_TOTAL; level++) {
        if (availableLevels.includes(level)) {
            const questions = getQuestionsFromLevel(level, 2);
            battleQuestions.push(...questions);
            questionsCollected += questions.length;
        }
    }

    // Fill remaining slots if needed
    if (questionsCollected < TARGET_TOTAL) {
        const remainingNeeded = TARGET_TOTAL - questionsCollected;
        const allRemainingQuestions = [];

        availableLevels.forEach(level => {
            if (questionsByLevel[level]) {
                const usedQuestions = battleQuestions.filter(q => q.level === level).length;
                const remainingFromLevel = questionsByLevel[level].slice(usedQuestions);
                allRemainingQuestions.push(...remainingFromLevel);
            }
        });

        const shuffled = shuffleArray(allRemainingQuestions);
        battleQuestions.push(...shuffled.slice(0, remainingNeeded));
    }

    // Add fallback questions if still not enough
    if (battleQuestions.length < TARGET_TOTAL) {
        const fallbackNeeded = TARGET_TOTAL - battleQuestions.length;
        battleQuestions.push(...generateFallbackQuestions(fallbackNeeded));
    }

    return battleQuestions;
};

// Validation utilities
const validateRoomForJoining = (roomData, userId) => {
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

// Room code generation utilities
const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// Logging utility
const logOperation = (operation, roomId = null, details = "") => {
    const roomInfo = roomId ? ` room ${roomId}` : "";
    console.log(`[${operation}]${roomInfo} ${details}`);
};

const HOST_TIMEOUT_MS = 45_000; // 45 s since lastActivity

const findAvailableMatchmakingRoom = (roomsData, userId, maxPlayers) => {
    if (!roomsData) return null;

    const now = Date.now();
    return Object.entries(roomsData)
        .filter(([_, room]) => (
            (room.matchmakingRoom || room.roomName === "Random Battle") &&
            Object.keys(room.players || {}).length < maxPlayers &&
            room.hostId !== userId &&
            // host still connected
            room.players?.[room.hostId]?.connected === true &&
            // host ping within 45 s
            (now - (room.lastActivity || 0)) < HOST_TIMEOUT_MS
        ))
        // take the oldest room first for fairness
        .sort(([, a], [, b]) => (a.createdAt || 0) - (b.createdAt || 0))
        .map(([roomId, roomData]) => ({ roomId, roomData }))[0] || null;
};

const createMatchmakingRoomData = (userId, userData, maxPlayers) => {
    return {
        roomName: "Random Battle",
        hostId: userId,
        status: "waiting",
        maxPlayers: maxPlayers,
        matchmakingRoom: true,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
        players: {
            [userId]: { ...createPlayerData({ ...userData, userId }, true), ready: true }
        }
    };
};

// Battle utilities
const createBattleInitData = (questionData, now) => {
    return {
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
};

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

// === BATTLEMANAGER CLASS ===
export class BattleManager {
    constructor() {
        this.userId = null;
        this.listeners = new Map();
        this.activeRooms = new Set();
        this.userPresenceRef = null;
        this.isInitialized = false;
        this.setupUserPresence();
    }

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
        } catch (error) {
            console.error("Failed to setup user presence:", error);
            this.isInitialized = false;
        }
    }

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
            console.error("[validateRoomExists] Error:", error);
            return { exists: false, error: error.message || "Failed to validate room" };
        }
    }

    async leaveRoom(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            if (!roomId) {
                console.warn("[leaveRoom] No roomId provided");
                return;
            }

            logOperation("leaveRoom", roomId, `Player ${userId} leaving`);

            // First remove the listener to prevent interference
            this.removeRoomListener(roomId);

            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));

            if (!exists) {
                logOperation("leaveRoom", roomId, "Room doesn't exist");
                return;
            }

            // If battle is active, use leaveDuringBattle instead
            if (roomData.status === "playing") {
                return await this.leaveDuringBattle(roomId);
            }

            // Handle leaving during waiting phase
            if (roomData.players?.[userId]) {
                await remove(createPlayerRef(roomId, userId));
                logOperation("leaveRoom", roomId, `Removed player ${userId}`);
            }

            // Check if room should be cleaned up (no players left)
            const remainingPlayers = Object.keys(roomData.players || {}).filter(id => id !== userId);

            if (remainingPlayers.length === 0) {
                // No players left, clean up room
                await this.cleanupRoom(roomId, "no_players_left");
            } else {
                // Update room activity
                await safeUpdate(createRoomRef(roomId), {});
            }

            logOperation("leaveRoom", roomId, "Successfully left");
        } catch (error) {
            console.error("[leaveRoom] Error:", error);
            // Always remove listener even on error
            this.removeRoomListener(roomId);
        }
    }

    async handleHostExit(roomId) {
        try {
            logOperation("handleHostExit", roomId, "Host leaving during battle");

            await safeUpdate(createRoomRef(roomId), {
                hostLeft: true,
                status: "finished",
                gameEndReason: "host_left",
                finishedAt: serverTimestamp()
            });

            // Clean up after 5 seconds
            setTimeout(() => {
                this.cleanupRoom(roomId, "host_exit").catch(() => { });
            }, 5000);
        } catch (error) {
            console.error("[handleHostExit] Error:", error);
        }
    }

    async generateQuestions(startLevel = 1, maxLevels = 10) {
        logOperation("generateQuestions", null, "Starting question generation");

        const { data: quizzesData, exists } = await safeGet(createQuizzesRef());

        if (!exists) {
            logOperation("generateQuestions", null, "No quizzes found, using fallback");
            return {
                questions: generateFallbackQuestions(25),
                levelInfo: [],
                totalLevels: 0
            };
        }

        const { questionsByLevel, levelSettings } = processQuizData(quizzesData, startLevel, maxLevels);
        const availableLevels = Object.keys(questionsByLevel).map(Number).sort((a, b) => a - b);

        if (availableLevels.length === 0) {
            return {
                questions: generateFallbackQuestions(25),
                levelInfo: [],
                totalLevels: 0
            };
        }

        const battleQuestions = collectQuestionsFromLevels(questionsByLevel, availableLevels);
        const finalQuestions = shuffleArray(battleQuestions).slice(0, 25);

        while (finalQuestions.length < 25) {
            const fallbackQuestion = {
                question: `${finalQuestions.length + 1} × 2`,
                correctAnswer: `${(finalQuestions.length + 1) * 2}`,
                timeLimit: 15,
                points: FIXED_POINT_PER_QUESTINON,
                explanation: `Multiply ${finalQuestions.length + 1} by 2`,
                level: 1
            };
            finalQuestions.push(fallbackQuestion);
        }

        logOperation("generateQuestions", null, `Generated ${finalQuestions.length} questions`);

        return {
            questions: finalQuestions,
            levelInfo: availableLevels.map(level => ({
                level: level,
                questionCount: questionsByLevel[level]?.length || 0,
                pointsPerQuestion: FIXED_POINT_PER_QUESTINON,
                usedInBattle: finalQuestions.filter(q => q.level === level).length
            })),
            totalLevels: availableLevels.length
        };
    }

    async createRoom(roomName, maxPlayers = 4) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;
            logOperation("createRoom", null, `Creating room: ${roomName}`);

            const userData = await this.getUserData(userId);
            const roomCode = await this.generateUniqueRoomCode();

            const roomData = {
                roomName: roomName || "Battle Room",
                code: roomCode,
                hostId: userId,
                status: "waiting",
                maxPlayers: maxPlayers,
                createdAt: serverTimestamp(),
                lastActivity: serverTimestamp(),
                players: {
                    [userId]: { ...createPlayerData({ ...userData, userId }, true), ready: false }
                }
            };

            const roomRef = push(createRoomsRef());
            await set(roomRef, roomData);
            const roomId = roomRef.key;

            logOperation("createRoom", roomId, `Room created with code: ${roomCode}`);
            return { roomId, roomCode, roomData };
        } catch (error) {
            console.error("[createRoom] Error:", error);
            throw error;
        }
    }

    async leaveDuringBattle(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            logOperation("leaveDuringBattle", roomId, `Player ${userId} leaving during battle`);

            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));

            if (!exists || !roomData) {
                return [];
            }

            // Remove the leaving player
            if (roomData.players?.[userId]) {
                await update(createPlayerRef(roomId, userId), { connected: false });
            }

            // Count remaining connected players
            const remainingPlayers = Object.values(roomData.players || {}).filter(
                (player) => player.userId !== userId && player.connected
            );

            // Check if the host is leaving
            const isHostLeaving = roomData.hostId === userId;

            // End battle if only one player is left
            if (remainingPlayers.length < 2) {
                logOperation("leaveDuringBattle", roomId, "Ending battle due to insufficient players");
                const playerArray = calculatePlayerScores(roomData.players);

                // Update room to finished state
                await update(createRoomRef(roomId), {
                    status: "finished",
                    results: playerArray,
                    gameEndReason: "insufficient_players",
                    finishedAt: serverTimestamp(),
                    lastActivity: serverTimestamp()
                });

                return playerArray;
            }

            // If the host leaves, end the battle for everyone
            if (isHostLeaving) {
                logOperation("leaveDuringBattle", roomId, "Host left during battle, ending for all players");
                const playerArray = calculatePlayerScores(roomData.players);

                await update(createRoomRef(roomId), {
                    status: "finished",
                    results: playerArray,
                    gameEndReason: "host_left",
                    finishedAt: serverTimestamp(),
                    lastActivity: serverTimestamp()
                });

                return playerArray;
            }

            // Update activity timestamp if the battle continues
            await safeUpdate(createRoomRef(roomId), {
                lastActivity: serverTimestamp()
            });

            return [];
        } catch (error) {
            console.error("[leaveDuringBattle] Error:", error);
            return [];
        }
    }

    async findRandomMatch(maxPlayers = 2) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            logOperation("findRandomMatch", null, "Looking for random match");

            const { data: roomsData, exists } = await safeGet(query(
                createRoomsRef(),
                orderByChild("status"),
                equalTo("waiting")
            ));

            const foundRoom = findAvailableMatchmakingRoom(exists ? roomsData : null, userId, maxPlayers);

            if (foundRoom) {
                logOperation("findRandomMatch", foundRoom.roomId, "Joining existing room");
                const userData = await this.getUserData(userId);
                const playerData = createPlayerData({ ...userData, userId }, false, true);
                playerData.ready = true;

                await update(createPlayerRef(foundRoom.roomId, userId), playerData);
                return { roomId: foundRoom.roomId, isHost: false };
            } else {
                logOperation("findRandomMatch", null, "Creating new matchmaking room");
                const userData = await this.getUserData(userId);
                const roomData = createMatchmakingRoomData(userId, userData, maxPlayers);

                const roomRef = push(createRoomsRef());
                await set(roomRef, roomData);
                const roomId = roomRef.key;

                logOperation("findRandomMatch", roomId, "Created matchmaking room");
                return { roomId: roomId, isHost: true };
            }
        } catch (error) {
            console.error("[findRandomMatch] Error:", error);
            throw error;
        }
    }

    async joinRoom(roomCode) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            if (!roomCode || roomCode.length < 4) {
                throw new Error("Invalid room code");
            }

            logOperation("joinRoom", null, `Attempting to join room with code: ${roomCode}`);

            const normalizedCode = roomCode.toUpperCase();
            const { data: roomsData, exists } = await safeGet(query(
                createRoomsRef(),
                orderByChild("code"),
                equalTo(normalizedCode)
            ));

            if (!exists) {
                throw new Error("Room not found or expired");
            }

            let roomId, roomData;
            Object.entries(roomsData).forEach(([id, data]) => {
                roomId = id;
                roomData = data;
            });

            validateRoomForJoining(roomData, userId);

            const userData = await this.getUserData(userId);
            const playerData = createPlayerData({ ...userData, userId });

            await update(createPlayerRef(roomId, userId), playerData);
            await safeUpdate(createRoomRef(roomId), {});

            logOperation("joinRoom", roomId, "Successfully joined room");
            return { roomId, roomData };
        } catch (error) {
            console.error("[joinRoom] Error:", error);
            throw error;
        }
    }

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

    async startBattle(roomId) {
        try {
            const user = await this.waitForAuth();
            this.userId = user.uid;

            if (!roomId) throw new Error("No roomId provided");

            const { data: room, exists } = await safeGet(createRoomRef(roomId));

            if (!validateBattleStart(room, this.userId)) return;

            logOperation("startBattle", roomId, "Generating questions...");
            const questionData = await this.generateQuestions(1, 10);

            if (!questionData.questions?.length) {
                throw new Error("Failed to generate questions");
            }

            logOperation("startBattle", roomId, `Generated ${questionData.questions.length} questions`);

            const now = Date.now();
            const playerUpdates = createBattlePlayerUpdates(room.players);
            const battleData = createBattleInitData(questionData, now);

            const updateData = { ...battleData, ...playerUpdates };

            await update(createRoomRef(roomId), updateData);

            // Notify all players about the battle start
            Object.keys(room.players).forEach(playerId => {
                // Here we can use a messaging service or a simple flag update
                update(createPlayerRef(roomId, playerId), { battleStarted: true });
            });

            logOperation("startBattle", roomId, "Battle started successfully");
        } catch (error) {
            console.error("[startBattle] Error:", error.message);
            throw error;
        }
    }

    async moveToNextQuestion(roomId) {
        try {
            const { data: roomData, exists } = await safeGet(createRoomRef(roomId));

            if (!exists || !roomData) return;

            const nextIndex = roomData.currentQuestion + 1;
            const now = Date.now();

            const questionsArray = roomData.questions
                ? (Array.isArray(roomData.questions) ? roomData.questions : Object.values(roomData.questions))
                : [];

            // CRITICAL FIX: Ensure all 25 questions are played
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
                logOperation("moveToNextQuestion", roomId, "All 25 questions completed, ending battle");
                await this.endBattle(roomId);
            }
        } catch (error) {
            console.error("[moveToNextQuestion] Error:", error);
            throw error;
        }
    }

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
                gameEndReason: gameEndReason,
                finishedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            logOperation("endBattle", roomId, `Battle ended successfully. Winner: ${winner.username}`);

            // Clean up after 30 seconds
            setTimeout(() => {
                this.cleanupRoom(roomId, "battle_completed").catch(() => { });
            }, 30000);

            return playerArray;
        } catch (error) {
            console.error("[endBattle] Error:", error);
            return [];
        }
    }

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
                await update(createPlayerRef(roomId, userId), {
                    answer: userAnswer,
                    consecutiveCorrect: 0,
                    lastActivity: serverTimestamp()
                });
                return false;
            }

            const winnerRef = ref(database, `rooms/${roomId}/currentWinner`);
            const txResult = await runTransaction(winnerRef, (current) => {
                if (!current) return userId;
                return current;
            });

            // FIXED: Always award 1 point regardless of level
            const pointsToAdd = txResult.committed && txResult.snapshot.val() === userId ? FIXED_POINT_PER_QUESTINON : 0;
            const newScore = (currentPlayer.score || 0) + pointsToAdd;

            if (txResult.committed && txResult.snapshot.val() === userId) {
                const newConsecutiveCorrect = (currentPlayer.consecutiveCorrect || 0) + 1;

                const playerUpdates = {};
                Object.keys(room.players).forEach(playerId => {
                    if (playerId !== userId) {
                        playerUpdates[`players/${playerId}/consecutiveCorrect`] = 0;
                    }
                });

                await update(createRoomRef(roomId), {
                    [`players/${userId}/score`]: newScore,
                    [`players/${userId}/winner`]: true,
                    [`players/${userId}/consecutiveCorrect`]: newConsecutiveCorrect,
                    [`players/${userId}/answer`]: userAnswer,
                    ...playerUpdates,
                    lastActivity: serverTimestamp()
                });

                // CRITICAL FIX: Remove early winner logic - let all 25 questions play
                setTimeout(() => {
                    this.startQuestionTransition(roomId, 2000).catch(console.error);
                }, 1000);

                return true;
            } else {
                await update(createPlayerRef(roomId, userId), {
                    score: newScore,
                    answer: userAnswer,
                    consecutiveCorrect: 0,
                    lastActivity: serverTimestamp()
                });
                return false;
            }
        } catch (error) {
            console.error("Submit answer error:", error);
            throw error;
        }
    }

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
            console.error("[toggleReady] Error:", error);
            throw error;
        }
    }

    async resetUserBattleState() {
        try {
            // Clear all listeners
            this.listeners.forEach((listener, roomId) => {
                try {
                    off(listener.ref, "value", listener.handler);
                } catch (error) {
                    console.warn("Error removing listener:", error);
                }
            });
            this.listeners.clear();
            this.activeRooms.clear();

            console.log("Battle state reset completed");
        } catch (error) {
            console.error("Battle state reset error:", error);
        }
    }

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

    async updateUserScore(userId, scoreToAdd) {
        try {
            if (scoreToAdd <= 0) return;

            const { data: userData } = await safeGet(createUserRef(userId));
            const currentUserData = userData || {};

            const currentTotalPoints = currentUserData.totalPoints || 0;
            const newTotalPoints = currentTotalPoints + scoreToAdd;

            let newStreak;
            const streakResult = await updateUserStreak();
            if (streakResult.increased) {
                newStreak = streakResult.streak;
            }

            await update(createUserRef(userId), {
                totalPoints: newTotalPoints,
            });

            if (!streakResult.alreadyPlayedToday) {
                await AsyncStorage.setItem("showStreakPopup", "true");
            }

        } catch (error) {
            console.error("Update user score error:", error);
        }
    }

    async getUserData(userId) {
        try {
            const { data } = await safeGet(createUserRef(userId));
            return data || {};
        } catch (error) {
            console.warn("Error getting user data:", error);
            return {};
        }
    }

    addRoomListener(roomId, callback) {
        return this.listenToRoom(roomId, callback);
    }

    listenToRoom(roomId, callback) {
        if (!roomId) {
            console.warn("listenToRoom: No roomId provided");
            return () => { };
        }

        this.removeRoomListener(roomId);

        const roomRef = createRoomRef(roomId);

        const handler = (snapshot) => {
            const roomData = snapshot.val();
            // Enhanced callback with opponent detection
            this.handleRoomUpdate(roomData, callback);
        };

        this.listeners.set(roomId, { ref: roomRef, handler });
        onValue(roomRef, handler);

        return () => {
            this.removeRoomListener(roomId);
        };
    }

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
            console.error("[endBattleInsufficientPlayers] Error:", error);
        }
    }

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
                this.endBattleInsufficientPlayers(roomData.roomId || Object.keys(this.listeners)[0])
                    .catch(console.error);
            }
        }

        callback(roomData);
    }

    removeRoomListener(roomId) {
        const listener = this.listeners.get(roomId);
        if (listener) {
            try {
                off(listener.ref, "value", listener.handler);
            } catch (error) {
                console.warn("Error removing listener:", error);
            }
            this.listeners.delete(roomId);
        }
    }

    async cleanupRoom(roomId, reason = "manual") {
        try {
            logOperation("cleanupRoom", roomId, `Cleaning up - Reason: ${reason}`);

            await remove(createRoomRef(roomId));
            this.removeRoomListener(roomId);
            this.activeRooms.delete(roomId);

        } catch (error) {
            console.error("[cleanupRoom] Error:", error);
        }
    }

    async cancelMatchmaking() {
        try {
            logOperation("cancelMatchmaking", null, "Canceling matchmaking");
            // Simple implementation - no complex cleanup needed
        } catch (error) {
            console.warn("Cancel matchmaking error:", error);
        }
    }

    async updatePlayerConnection(roomId, connected = true) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            // ❶ Promote new host if the old host is offline and game not started
            const { data: roomData } = await safeGet(createRoomRef(roomId));
            if (roomData &&
                roomData.status === "waiting" &&
                connected === true &&            // we’re coming online
                roomData.hostId !== userId &&    // we are NOT already host
                roomData.players?.[roomData.hostId]?.connected === false) {

                await update(createRoomRef(roomId), {
                    hostId: userId,              // make this player the new host
                    [`players/${userId}/isHost`]: true
                });
                console.log(`[updatePlayerConnection] Promoted ${userId} to host of ${roomId}`);
            }

            await update(createPlayerRef(roomId, userId), {
                connected,
                lastSeen: serverTimestamp()
            });

            await safeUpdate(createRoomRef(roomId), {});
        } catch (error) {
            console.warn("Update player connection error:", error);
        }
    }

    cleanup() {
        this.listeners.forEach((listener, roomId) => {
            off(createRoomRef(roomId), listener.handler);
        });
        this.listeners.clear();

        if (this.userPresenceRef) {
            remove(this.userPresenceRef).catch(() => { });
        }
    }
}

export const battleManager = new BattleManager();
