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
import AsyncStorage from "@react-native-async-storage/async-storage";

export class BattleManager {
    constructor() {
        this.userId = null;
        this.listeners = new Map();
        this.activeRooms = new Set();
        this.userPresenceRef = null;
        this.matchmakingListener = null;
        this.roomListener = null;
        this.isInitialized = false;
        this.cleanupInProgress = false;
        this.battleEndCleanupCallbacks = new Map();
        this.setupUserPresence();
    }

    // ... [Previous authentication and setup methods remain the same] ...
    async waitForAuth() {
        return new Promise((resolve, reject) => {
            if (auth.currentUser?.uid) {
                const user = auth.currentUser;
                if (user.uid && typeof user.uid === 'string') {
                    resolve(user);
                    return;
                }
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

            this.userPresenceRef = ref(database, `presence/${this.userId}`);
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

    // Enhanced question generation with exact 25 questions
    async generateQuestions(startLevel = 1, maxLevels = 10) {
        console.log("[generateQuestions] Starting question generation");

        const quizzesRef = ref(database, "quizzes");
        const snapshot = await get(quizzesRef);

        if (!snapshot.exists()) {
            console.log("[generateQuestions] No quizzes found, using fallback");
            return {
                questions: this.getFallbackQuestions(25),
                levelInfo: [],
                totalLevels: 0
            };
        }

        const questionsByLevel = {};
        const levelSettings = {};

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

        const availableLevels = Object.keys(questionsByLevel).map(Number).sort((a, b) => a - b);

        if (availableLevels.length === 0) {
            console.log("[generateQuestions] No valid levels found, using fallback");
            return {
                questions: this.getFallbackQuestions(25),
                levelInfo: [],
                totalLevels: 0
            };
        }

        // Generate exactly 25 questions with proper distribution
        const battleQuestions = [];
        const TARGET_TOTAL = 25;

        const getQuestionsFromLevel = (level, count) => {
            if (!questionsByLevel[level] || questionsByLevel[level].length === 0) return [];
            const shuffled = [...questionsByLevel[level]].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, Math.min(count, shuffled.length));
        };

        let questionsCollected = 0;

        // Levels 1-5: 3 questions each (15 total)
        for (let level = 1; level <= 5 && questionsCollected < TARGET_TOTAL; level++) {
            if (availableLevels.includes(level)) {
                const questions = getQuestionsFromLevel(level, 3);
                battleQuestions.push(...questions);
                questionsCollected += questions.length;
            }
        }

        // Levels 6-10: 2 questions each (10 total)
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

            const shuffled = allRemainingQuestions.sort(() => 0.5 - Math.random());
            battleQuestions.push(...shuffled.slice(0, remainingNeeded));
        }

        // Use fallback for any remaining slots
        if (battleQuestions.length < TARGET_TOTAL) {
            const fallbackNeeded = TARGET_TOTAL - battleQuestions.length;
            const fallbackQuestions = this.getFallbackQuestions(fallbackNeeded);
            battleQuestions.push(...fallbackQuestions);
        }

        // Final shuffle and ensure exactly 25 questions
        const finalQuestions = battleQuestions.sort(() => 0.5 - Math.random()).slice(0, TARGET_TOTAL);

        console.log(`[generateQuestions] Generated ${finalQuestions.length} questions`);

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

    getFallbackQuestions(count = 25) {
        console.log(`[BattleManager] Generating ${count} fallback questions`);
        return Array(count).fill().map((_, i) => ({
            question: `${i + 1} + ${i + 5}`,
            correctAnswer: `${(i + 1) + (i + 5)}`,
            timeLimit: 15,
            points: Math.floor(i / 5) + 1,
            explanation: `Add ${i + 1} and ${i + 5} together`,
            level: Math.floor(i / 5) + 1
        }));
    }

    // Enhanced battle start with proper cleanup
    async startBattle(roomId) {
        try {
            const user = await this.waitForAuth();
            this.userId = user.uid;

            if (!roomId) throw new Error("No roomId provided");

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room) throw new Error("Room not found");
            if (room.hostId !== this.userId) {
                console.warn("Only host can start battle");
                return;
            }
            if (room.status === "playing") {
                console.warn("Battle already started");
                return;
            }

            const connectedPlayers = Object.values(room.players || {}).filter(
                (p) => p.connected
            );

            if (connectedPlayers.length < 2) {
                throw new Error("At least 2 connected players are required");
            }

            console.log("[startBattle] Generating questions...");
            const questionData = await this.generateQuestions(1, 10);

            if (!questionData.questions || questionData.questions.length === 0) {
                throw new Error("Failed to generate questions");
            }

            console.log(`[startBattle] Generated ${questionData.questions.length} questions`);

            const now = Date.now();

            // Reset all player states
            const playerUpdates = {};
            for (const playerId in room.players) {
                playerUpdates[`players/${playerId}/score`] = 0;
                playerUpdates[`players/${playerId}/answers`] = {};
                playerUpdates[`players/${playerId}/answer`] = "";
                playerUpdates[`players/${playerId}/winner`] = false;
                playerUpdates[`players/${playerId}/consecutiveCorrect`] = 0;
                playerUpdates[`players/${playerId}/ready`] = false;
                playerUpdates[`players/${playerId}/finalScore`] = 0;
                playerUpdates[`players/${playerId}/isWinner`] = false;
            }

            const updateData = {
                status: "playing",
                questions: questionData.questions,
                currentQuestion: 0,
                currentLevel: 1,
                totalQuestions: 25, // Ensure exactly 25 questions
                questionTimeLimit: 15,
                gameStartedAt: now,
                questionStartedAt: now,
                lastActivity: serverTimestamp(),
                questionTransition: false,
                nextQuestionStartTime: null,
                currentWinner: null,
                maxConsecutiveTarget: 5, // Win condition
                consecutiveWinThreshold: 3,
                gameEndReason: null,
                gameWinner: null,
                finishedAt: null,
                ...playerUpdates,
            };

            await update(roomRef, updateData);
            console.log("[startBattle] Battle started successfully for room:", roomId);

            // Setup battle end cleanup callback
            this.battleEndCleanupCallbacks.set(roomId, () => {
                this.performPostBattleCleanup(roomId);
            });

        } catch (error) {
            console.error("[startBattle] Error:", error.message);
            throw error;
        }
    }

    // Enhanced host exit handling
    async handleHostExit(roomId) {
        try {
            console.log(`[handleHostExit] Processing host exit for room: ${roomId}`);

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const room = snapshot.val();

            if (!room) {
                console.log("[handleHostExit] Room not found");
                return;
            }

            // End battle immediately when host exits
            await update(roomRef, {
                status: "finished",
                gameEndReason: "host_exit",
                hostLeft: true,
                endedBy: "host",
                endedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            console.log(`[handleHostExit] Room ${roomId} marked finished due to host exit`);

            // Notify remaining players
            const remainingPlayers = Object.keys(room.players || {}).filter(
                playerId => playerId !== room.hostId
            );

            if (remainingPlayers.length > 0) {
                // Update player scores before ending
                for (const playerId of remainingPlayers) {
                    const player = room.players[playerId];
                    if (player?.score) {
                        await this.updateUserScore(playerId, player.score);
                    }
                }
            }

            // Schedule room cleanup
            setTimeout(() => {
                this.cleanupRoom(roomId, "host_exit").catch(console.error);
            }, 5000);

        } catch (error) {
            console.error("[handleHostExit] Error:", error);
        }
    }

    // Enhanced battle end with proper cleanup
    async endBattle(roomId) {
        try {
            console.log(`[endBattle] Ending battle for room: ${roomId}`);

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const roomData = snapshot.val();

            if (!roomData || !roomData.players) {
                if (roomData) {
                    await update(roomRef, {
                        status: "finished",
                        finishedAt: serverTimestamp(),
                        gameEndReason: "no_players"
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
                finalScore: players[id].score || 0,
            })).sort((a, b) => b.score - a.score);

            // Determine winner
            const winner = playerArray[0];
            const gameEndReason = roomData.gameEndReason || "questions_completed";

            // Update user scores
            for (const player of playerArray) {
                await this.updateUserScore(player.userId, player.score);
            }

            // Mark winner in player data
            const playerUpdates = {};
            playerArray.forEach((player, index) => {
                playerUpdates[`players/${player.userId}/finalScore`] = player.score;
                playerUpdates[`players/${player.userId}/isWinner`] = index === 0;
                playerUpdates[`players/${player.userId}/placement`] = index + 1;
            });

            await update(roomRef, {
                ...playerUpdates,
                status: "finished",
                results: playerArray,
                gameWinner: winner.userId,
                gameEndReason: gameEndReason,
                finishedAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });

            console.log(`[endBattle] Battle ended successfully. Winner: ${winner.username}`);

            // Execute cleanup callback if exists
            const cleanupCallback = this.battleEndCleanupCallbacks.get(roomId);
            if (cleanupCallback) {
                setTimeout(cleanupCallback, 2000);
                this.battleEndCleanupCallbacks.delete(roomId);
            }

            // Schedule room cleanup
            setTimeout(() => {
                this.cleanupRoom(roomId, "battle_completed").catch(() => { });
            }, 30000);

            return playerArray;
        } catch (error) {
            console.error("[endBattle] Error:", error);
            return [];
        }
    }

    // Post-battle cleanup for seamless replay
    async performPostBattleCleanup(roomId) {
        try {
            console.log(`[performPostBattleCleanup] Cleaning up after battle: ${roomId}`);

            // Remove room listener
            this.removeRoomListener(roomId);

            // Clear active rooms
            this.activeRooms.delete(roomId);

            // Reset any battle-specific states
            const user = await this.waitForAuth();
            const userId = user.uid;

            // Update user presence
            if (this.userPresenceRef) {
                await update(this.userPresenceRef, {
                    currentBattle: null,
                    battleStatus: "available",
                    lastBattleEnded: serverTimestamp()
                });
            }

            console.log(`[performPostBattleCleanup] Cleanup completed for room: ${roomId}`);
        } catch (error) {
            console.error("[performPostBattleCleanup] Error:", error);
        }
    }

    // Enhanced move to next question with battle end logic
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

            // Check if we've reached the question limit (25 questions)
            const hasMoreQuestions = nextIndex < Math.min(questionsArray.length, 25);

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

                console.log(`[moveToNextQuestion] Moved to question ${nextIndex + 1} of 25`);
            } else {
                console.log("[moveToNextQuestion] Reached question limit, ending battle");
                await this.endBattle(roomId);
            }
        } catch (error) {
            console.error("[moveToNextQuestion] Error:", error);
            throw error;
        }
    }

    // Enhanced leave room with host exit handling
    async leaveRoom(roomId) {
        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

            console.log(`[leaveRoom] Player ${userId} leaving room ${roomId}`);

            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);

            if (!snapshot.exists()) {
                console.log("[leaveRoom] Room doesn't exist, nothing to leave");
                return;
            }

            const roomData = snapshot.val();

            // Check if this is the host leaving during battle
            if (roomData.hostId === userId && roomData.status === "playing") {
                console.log("[leaveRoom] Host leaving during battle, ending battle");
                await this.handleHostExit(roomId);
                return;
            }

            if (roomData.players && roomData.players[userId]) {
                const playerRef = ref(database, `rooms/${roomId}/players/${userId}`);
                await remove(playerRef);

                const currentPlayers = Object.keys(roomData.players).length - 1;
                await update(roomRef, {
                    currentPlayers: Math.max(0, currentPlayers),
                    lastActivity: serverTimestamp()
                });
            }

            if (roomData.hostId === userId && roomData.status !== "finished") {
                const remainingPlayers = Object.keys(roomData.players).filter(id => id !== userId);

                if (remainingPlayers.length > 0) {
                    const newHostId = remainingPlayers[0];
                    await update(roomRef, {
                        hostId: newHostId,
                        lastActivity: serverTimestamp()
                    });

                    const newHostRef = ref(database, `rooms/${roomId}/players/${newHostId}`);
                    await update(newHostRef, {
                        isHost: true
                    });

                    console.log(`[leaveRoom] Host transferred to ${newHostId}`);
                } else {
                    await remove(roomRef);
                    console.log("[leaveRoom] Room deleted - no players remaining");
                }
            }

            console.log(`[leaveRoom] Successfully left room ${roomId}`);
        } catch (error) {
            console.error("[leaveRoom] Error:", error);
            throw error;
        }
    }

    // ... [Rest of the methods remain the same but with enhanced error handling] ...

    async createRoom(roomName, maxPlayers = 2) {
        try {
            const user = await this.waitForAuth();
            const hostId = user.uid;

            if (!hostId || typeof hostId !== 'string') {
                throw new Error("Invalid user authentication");
            }

            if (!roomName || typeof roomName !== 'string') {
                roomName = "Battle Room";
            }

            let hostName = user.displayName;
            if (!hostName || hostName === null || hostName === undefined) {
                hostName = user.email?.split('@')[0] || "Anonymous Player";
            }

            console.log("Creating room with validated data:", { roomName, hostId, hostName });

            const roomCode = await this.generateUniqueRoomCode();
            const roomsRef = ref(database, 'rooms');
            const newRoomRef = push(roomsRef);
            const roomId = newRoomRef.key;

            const roomData = {
                id: roomId,
                code: roomCode,
                name: roomName,
                hostId: hostId,
                status: "waiting",
                createdAt: Date.now(),
                players: {
                    [hostId]: {
                        id: hostId,
                        name: hostName,
                        username: hostName,
                        connected: true,
                        joinedAt: Date.now(),
                        isHost: true,
                        ready: false,
                        score: 0,
                        avatar: 0
                    }
                },
                maxPlayers: maxPlayers,
                currentPlayers: 1,
                lastActivity: serverTimestamp()
            };

            this.validateRoomData(roomData);
            await set(newRoomRef, roomData);

            console.log("Room created successfully:", { roomId, roomCode });

            return {
                roomId: roomId,
                roomCode: roomCode,
                roomData: roomData
            };

        } catch (error) {
            console.error("Error creating room:", error);
            throw error;
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

    validateRoomData(roomData) {
        const checkForUndefined = (obj, path = '') => {
            for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                if (value === undefined) {
                    throw new Error(`Undefined value at path: ${currentPath}`);
                }
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    checkForUndefined(value, currentPath);
                }
            }
        };

        checkForUndefined(roomData);
    }

    async findRandomMatch(maxPlayers = 2) {
        try {
            if (this.cleanupInProgress) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const user = await this.waitForAuth();
            const userId = user.uid;

            if (!userId || typeof userId !== 'string') {
                throw new Error("Invalid user authentication for random match");
            }

            const now = Date.now();
            const timeoutDuration = 30000;
            const halfMinuteAgo = now - timeoutDuration;

            console.log("Starting random match for user:", userId);

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

            await cleanUserRooms();
            await new Promise(resolve => setTimeout(resolve, 500));

            const startTime = Date.now();

            while (Date.now() - startTime < timeoutDuration) {
                const roomsSnapshot = await get(ref(database, "rooms"));
                const rooms = roomsSnapshot.val() || {};

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
                        room.hostId !== userId
                    );
                });

                if (availableRooms.length > 0) {
                    availableRooms.sort(
                        ([, a], [, b]) => (b.lastActivity || 0) - (a.lastActivity || 0)
                    );

                    const [roomId, roomData] = availableRooms[0];

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

                await new Promise((res) => setTimeout(res, 3000));
            }

            console.log("Creating new matchmaking room for user:", userId);
            const newRoom = await this.createRoom("Quick Battle", maxPlayers);

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
            throw new Error("Failed to find or create match: " + error.message);
        }
    }

    async joinRoom(roomCode) {
        try {
            console.log("[joinRoom] Starting join process for code:", roomCode);

            const user = await this.waitForAuth();
            const userId = user.uid;

            if (!userId || typeof userId !== 'string') {
                throw new Error("Invalid user authentication");
            }

            console.log("[joinRoom] Authenticated user:", userId);

            const userData = await this.getUserData(userId);
            const avatar = userData?.avatar || 0;

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
                    ready: true,
                    lastSeen: serverTimestamp()
                });
            } else {
                let playerName = user.displayName;
                if (!playerName || playerName === null || playerName === undefined) {
                    playerName = user.email?.split('@')[0] || `Player ${currentPlayerCount + 1}`;
                }

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

                this.validateRoomData({ players: { [userId]: playerData } });

                await update(ref(database, `rooms/${roomId}`), {
                    [`players/${userId}`]: playerData,
                    currentPlayerCount: currentPlayerCount + 1,
                    lastActivity: serverTimestamp()
                });
            }

            return { roomId, roomData: { ...roomData, code: roomCode } };

        } catch (error) {
            console.error("[joinRoom] Error:", error);
            throw error;
        }
    }

    listenToRoom(roomId, callback) {
        if (!roomId) {
            console.warn("listenToRoom: No roomId provided");
            return () => { };
        }

        this.removeRoomListener(roomId);

        const roomRef = ref(database, `rooms/${roomId}`);

        const handler = (snapshot) => {
            const roomData = snapshot.val();
            callback(roomData);
        };

        this.listeners.set(roomId, { ref: roomRef, handler });
        onValue(roomRef, handler);

        return () => {
            this.removeRoomListener(roomId);
        };
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
            console.log(`[cleanupRoom] Cleaning up room ${roomId} - Reason: ${reason}`);

            const roomRef = ref(database, `rooms/${roomId}`);
            await remove(roomRef);

            this.removeRoomListener(roomId);
            this.activeRooms.delete(roomId);

            const matchmakingRef = ref(database, `matchmaking/${roomId}`);
            await remove(matchmakingRef).catch(() => { });

        } catch (error) {
            console.error("[cleanupRoom] Error:", error);
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

            const basePoints = currentQuestion.level || 1;
            const pointsToAdd = txResult.committed && txResult.snapshot.val() === userId ? basePoints * 1 : basePoints * 0;
            const newScore = (currentPlayer.score || 0) + pointsToAdd;

            if (txResult.committed && txResult.snapshot.val() === userId) {
                const newConsecutiveCorrect = (currentPlayer.consecutiveCorrect || 0) + 1;

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
                if (newConsecutiveCorrect >= 5) {
                    setTimeout(() => {
                        this.declareWinner(roomId, userId);
                    }, 1000);
                } else {
                    setTimeout(() => {
                        this.startQuestionTransition(roomId, 2000).catch(console.error);
                    }, 1000);
                }

                return true;
            } else {
                await update(ref(database, `rooms/${roomId}/players/${userId}`), {
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

    async declareWinner(roomId, winnerId) {
        try {
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            const roomData = snapshot.val();

            if (!roomData) return;

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

            for (const [playerId, player] of Object.entries(roomData.players || {})) {
                const battleScore = player.score || 0;
                await this.updateUserScore(playerId, battleScore);
            }

        } catch (error) {
            console.error("Declare winner error:", error);
        }
    }

    async startQuestionTransition(roomId, duration = 3000) {
        try {
            const now = Date.now();
            const nextQuestionStartTime = now + duration;

            await update(ref(database, `rooms/${roomId}`), {
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

            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);
            const userData = snapshot.val() || {};

            const currentTotalPoints = userData.totalPoints || 0;
            const currentHighScore = userData.highScore || 0;
            const newTotalPoints = currentTotalPoints + scoreToAdd;
            const newHighScore = Math.max(currentHighScore, scoreToAdd);

            let newStreak;
            const streakResult = await updateUserStreak();
            if (streakResult.increased) {
                newStreak = streakResult.streak;
            }

            await update(userRef, {
                totalPoints: newTotalPoints,
                highScore: newHighScore
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
            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);
            return snapshot.val() || {};
        } catch (error) {
            console.warn("Error getting user data:", error);
            return {};
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

            await update(ref(database, `rooms/${roomId}/players/${userId}`), {
                connected,
                lastSeen: serverTimestamp()
            });

            await update(ref(database, `rooms/${roomId}`), {
                lastActivity: serverTimestamp()
            });
        } catch (error) {
            console.warn("Update player connection error:", error);
        }
    }

    async cancelMatchmaking() {
        if (this.cleanupInProgress) return;

        this.cleanupInProgress = true;

        try {
            const user = await this.waitForAuth();
            const userId = user.uid;

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
            console.warn("Cancel matchmaking error:", error);
        } finally {
            this.cleanupInProgress = false;
        }
    }

    addRoomListener(roomId, callback) {
        return this.listenToRoom(roomId, callback);
    }

    cleanup() {
        this.listeners.forEach((listener, roomId) => {
            off(ref(database, `rooms/${roomId}`), listener.handler);
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

        this.battleEndCleanupCallbacks.clear();
        this.cancelMatchmaking().catch(() => { });
    }
}

export const battleManager = new BattleManager();
