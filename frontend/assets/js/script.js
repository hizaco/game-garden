// Variables globales
let socket = null;
let currentUser = null;
let gameState = null;
let currentGameId = null;
let authCheckInterval = null;
let isCheckingAuth = false;
let turnTimer = null;
let currentTurnTime = 15;

// Ajouts: sélection du mode et difficulté Solo IA
let selectedMode = 'multiplayer'; // 'multiplayer' | 'solo'
let selectedDifficulty = 'medium'; // 'easy' | 'medium' | 'hard'

// États du jeu
const GAME_STATES = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
};

const CELL_TYPES = {
    EMPTY: 'empty',
    PLAYER1: 'player1',
    PLAYER2: 'player2',
    BONUS: 'bonus'
};

const POWER_TYPES = {
    DOUBLE_PLACEMENT: 'double_placement',
    SHIELD: 'shield',
    EXPANSION_BOOST: 'expansion_boost'
};

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎯 Battle Dots - Initialisation...');

    const isAuthenticated = await checkAuth();

    if (isAuthenticated) {
        console.log('✅ Utilisateur authentifié:', currentUser.username);
        initializeSocket();
        initializeGame();

        authCheckInterval = setInterval(() => {
            if (!isCheckingAuth) {
                checkAuth();
            }
        }, 10 * 60 * 1000);
    } else {
        console.log('❌ Utilisateur non authentifié, redirection...');
        redirectToLogin();
    }

    setupEventListeners();
    registerServiceWorker();
});

// Vérification authentification
async function checkAuth() {
    if (isCheckingAuth) {
        console.log('⏳ Vérification auth déjà en cours...');
        return currentUser !== null;
    }

    isCheckingAuth = true;
    const token = localStorage.getItem('token');

    if (!token) {
        console.log('❌ Aucun token trouvé');
        isCheckingAuth = false;
        return false;
    }

    try {
        const response = await fetch('/api/auth/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            console.log('✅ Auth valide pour:', currentUser.username);
            updateUserInterface();
            isCheckingAuth = false;
            return true;
        } else {
            if (response.status === 401) {
                localStorage.removeItem('token');
                currentUser = null;
            }
            isCheckingAuth = false;
            return false;
        }
    } catch (error) {
        console.error('❌ Erreur vérification auth:', error);
        isCheckingAuth = false;
        return currentUser !== null;
    }
}

// Initialisation Socket.io
function initializeSocket() {
    if (socket) {
        socket.disconnect();
    }

    console.log('🌐 Initialisation Socket.io...');

    socket = io({
        auth: {
            token: localStorage.getItem('token')
        },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log('✅ Socket connecté:', socket.id);
        updateConnectionStatus(true);
    });

    socket.on('disconnect', (reason) => {
        console.log('❌ Socket déconnecté:', reason);
        updateConnectionStatus(false);
    });

    socket.on('connect_error', (error) => {
        console.error('❌ Erreur connexion socket:', error);
        updateConnectionStatus(false);
    });

    // Events Battle Dots
    socket.on('waiting-for-opponent', handleWaitingForOpponent);
    socket.on('game-start', handleGameStart);
    socket.on('dot-placed', handleDotPlaced);
    socket.on('turn-changed', handleTurnChanged);
    socket.on('expansion-occurred', handleExpansionOccurred);
    socket.on('capture-occurred', handleCaptureOccurred);
    socket.on('power-activated', handlePowerActivated);
    socket.on('game-end', handleGameEnd);
    socket.on('player-left', handlePlayerLeft);
    socket.on('player-disconnected', handlePlayerDisconnected);
    socket.on('turn-timer', handleTurnTimer);
}

// Initialisation du jeu
function initializeGame() {
    console.log('🎯 Initialisation Battle Dots...');
    createGameBoard();
    updateUserInterface();
    resetGameUI();
}

// Création du plateau de jeu
function createGameBoard() {
    const gameBoard = document.getElementById('game-board');
    if (!gameBoard) {
        console.error('❌ Élément game-board introuvable');
        return;
    }

    gameBoard.innerHTML = '';

    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell empty';
            cell.dataset.x = i;
            cell.dataset.y = j;

            cell.addEventListener('click', () => placeDot(i, j));

            gameBoard.appendChild(cell);
        }
    }

    console.log('✅ Plateau Battle Dots créé (10x10)');
}

// Placement d'un dot
function placeDot(x, y) {
    console.log(`🎯 Tentative placement dot [${x}, ${y}]`);

    if (!currentGameId) {
        console.log('❌ Pas de partie en cours');
        showModal('Erreur', 'Aucune partie en cours!');
        return;
    }

    if (!socket || !currentUser) {
        console.log('❌ Socket ou utilisateur manquant');
        showModal('Erreur', 'Connexion requise!');
        return;
    }

    if (!gameState) {
        console.log('❌ État du jeu manquant');
        showModal('Erreur', 'État du jeu non disponible!');
        return;
    }

    // Vérification que le jeu est en cours
    if (gameState.state === GAME_STATES.FINISHED) {
        console.log('❌ Partie déjà terminée');
        showModal('Info', 'La partie est terminée!');
        return;
    }

    if (gameState.currentPlayer !== currentUser.id) {
        console.log('❌ Ce n\'est pas votre tour, tour actuel:', gameState.currentPlayer, 'user:', currentUser.id);
        showModal('Info', 'Ce n\'est pas votre tour!');
        return;
    }

    const cell = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    if (!cell || !cell.classList.contains('empty')) {
        console.log(`❌ Cellule [${x}, ${y}] non disponible`);
        showModal('Info', 'Cette case n\'est pas disponible!');
        return;
    }

    // Debug: Compter les dots avant placement
    const player1Dots = document.querySelectorAll('.cell.player1').length;
    const player2Dots = document.querySelectorAll('.cell.player2').length;
    console.log(`🔍 AVANT placement - Player1: ${player1Dots} dots, Player2: ${player2Dots} dots`);

    // Animation de placement immédiate
    cell.style.transform = 'scale(0.8)';
    cell.style.opacity = '0.7';

    setTimeout(() => {
        cell.style.transform = '';
        cell.style.opacity = '';
    }, 200);

    console.log(`✅ Envoi placement dot [${x}, ${y}]`);
    socket.emit('place-dot', {
        gameId: currentGameId,
        x: x,
        y: y,
        playerId: currentUser.id
    });
}

// Handlers des événements Socket.io
function handleWaitingForOpponent(data) {
    console.log('⏳ En attente d\'adversaire:', data);

    // En solo, pas d'attente d'adversaire
    if (selectedMode === 'solo') {
        return;
    }

    const queuePosition = document.getElementById('queue-position');
    if (queuePosition) {
        queuePosition.textContent = data.queuePosition;
    }
    const waitingModal = document.getElementById('waiting-modal');
    if (waitingModal) {
        waitingModal.style.display = 'block';
    }
}

function handleGameStart(data) {
    console.log('🎯 Partie Battle Dots commencée!', data);
    console.log('🔍 État initial du jeu:', data.gameState);

    currentGameId = data.gameId;
    gameState = data.gameState || {};
    // Stocker le mode depuis le serveur si fourni, sinon conserver la sélection locale
    gameState.mode = data.mode || gameState.mode || selectedMode;

    closeModal();
    createGameBoardFromState(gameState);
    updateGameInterface(gameState);
    addGameLog('🎮 Partie Battle Dots commencée!');

    const startMsg = gameState.mode === 'solo'
        ? 'Mode Solo IA — bonne chance!'
        : 'La bataille pour le territoire commence!';
    showModal('Battle Dots!', startMsg);
    setTimeout(() => {
        closeModal();
    }, 2000);
}

function handleDotPlaced(data) {
    console.log('🎯 Dot placé reçu:', data);
    console.log('🔍 Nouvel état du jeu:', data.gameState);

    const { x, y, playerId, gameState: newGameState } = data;

    // Vérifier si le jeu se termine anormalement
    if (newGameState.state === GAME_STATES.FINISHED) {
        console.warn('⚠️ ATTENTION: Le jeu se termine immédiatement après un placement de dot!');
        console.log('🔍 Raison de fin:', newGameState.endReason);
        console.log('🔍 État de la grille à la fin:', newGameState.grid);
    }

    // Mise à jour de l'état AVANT modifications visuelles
    gameState = newGameState;

    const cell = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);

    if (!cell) {
        console.error(`❌ Cellule [${x}, ${y}] introuvable`);
        return;
    }

    let playerClass;
    if (gameState && gameState.players && gameState.players.length >= 2) {
        playerClass = playerId === gameState.players[0].id ? 'player1' : 'player2';
    } else {
        console.error('❌ Informations des joueurs manquantes');
        return;
    }

    const playerName = gameState.players.find(p => p.id === playerId)?.playerName || 'Joueur';

    cell.classList.remove('empty', 'bonus');
    cell.classList.add(playerClass);
    cell.textContent = '●';

    // Debug: Compter les dots après placement
    setTimeout(() => {
        const player1DotsAfter = document.querySelectorAll('.cell.player1').length;
        const player2DotsAfter = document.querySelectorAll('.cell.player2').length;
        console.log(`🔍 APRÈS placement - Player1: ${player1DotsAfter} dots, Player2: ${player2DotsAfter} dots`);
    }, 100);

    // Animation de placement
    cell.style.animation = 'expand-pulse 0.6s ease-out';
    setTimeout(() => {
        cell.style.animation = '';
    }, 600);

    updateGameInterface(gameState);
    addGameLog(`${playerName} a placé un dot en [${x+1}, ${y+1}]`, playerClass);
}

function handleTurnChanged(data) {
    console.log('🔄 Changement de tour:', data);
    console.log('🔍 État du jeu au changement de tour:', data.gameState);

    gameState = data.gameState;

    // Vérifier que le jeu n'est pas terminé
    if (gameState.state === GAME_STATES.FINISHED) {
        console.log('❌ Tentative de changement de tour sur jeu terminé');
        return;
    }

    updateGameInterface(gameState);
    startTurnTimer();

    const currentPlayerName = gameState.players.find(p => p.id === gameState.currentPlayer)?.playerName || 'Joueur';
    const isMyTurn = gameState.currentPlayer === currentUser.id;

    const currentTurnText = document.getElementById('current-turn-text');
    if (currentTurnText) {
        currentTurnText.textContent = isMyTurn ? 'À votre tour!' : `Tour de ${currentPlayerName}`;
    }

    addGameLog(`Tour de ${currentPlayerName}`);
}

function handleExpansionOccurred(data) {
    console.log('💥 Expansion détectée:', data);
    const { expansions, gameState: newGameState } = data;

    gameState = newGameState;

    expansions.forEach(expansion => {
        const { x, y, playerId } = expansion;
        const cell = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);

        if (cell) {
            const playerClass = playerId === gameState.players[0].id ? 'player1' : 'player2';

            cell.classList.remove('empty', 'bonus');
            cell.classList.add(playerClass, 'expanding');
            cell.textContent = '●';

            setTimeout(() => {
                cell.classList.remove('expanding');
            }, 800);
        }
    });

    updateGameInterface(gameState);
    addGameLog(`💥 ${expansions.length} dots ont expansé!`);
}

function handleCaptureOccurred(data) {
    console.log('🏆 Capture détectée:', data);
    const { captures, gameState: newGameState } = data;

    gameState = newGameState;

    captures.forEach(capture => {
        const { x, y, newPlayerId } = capture;
        const cell = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);

        if (cell) {
            const playerClass = newPlayerId === gameState.players[0].id ? 'player1' : 'player2';

            cell.classList.add('captured');
            setTimeout(() => {
                cell.className = `cell ${playerClass}`;
                cell.textContent = '●';
            }, 300);
        }
    });

    updateGameInterface(gameState);
    addGameLog(`🏆 ${captures.length} dots capturés!`);
}

function handlePowerActivated(data) {
    console.log('⚡ Pouvoir activé:', data);
    const { playerId, powerType, gameState: newGameState } = data;

    gameState = newGameState;
    updateGameInterface(gameState);
    updatePowersDisplay();

    const playerName = gameState.players.find(p => p.id === playerId)?.playerName || 'Joueur';
    const powerName = getPowerName(powerType);
    addGameLog(`⚡ ${playerName} utilise ${powerName}!`);
}

function handleGameEnd(data) {
    console.log('🏆 Partie terminée!', data);
    console.log('🔍 DEBUG - Données de fin de partie complètes:', JSON.stringify(data, null, 2));

    // Debug: Compter les dots au moment de la fin
    const player1DotsEnd = document.querySelectorAll('.cell.player1').length;
    const player2DotsEnd = document.querySelectorAll('.cell.player2').length;
    console.log(`🔍 FINS DE PARTIE - Player1: ${player1DotsEnd} dots, Player2: ${player2DotsEnd} dots`);
    console.log(`🔍 Raison de fin: ${data.reason}`);

    // Marquer explicitement le jeu comme terminé
    if (gameState) {
        gameState.state = GAME_STATES.FINISHED;
    }

    const isWinner = data.winner === currentUser.id;
    const winnerName = gameState?.players?.find(p => p.id === data.winner)?.playerName || 'Joueur';

    let message;
    if (data.reason === 'territory') {
        message = isWinner ?
            `🎉 Victoire! Vous contrôlez ${data.territoryPercentage}% du territoire!` :
            `😞 Défaite. ${winnerName} contrôle ${data.territoryPercentage}% du territoire.`;
    } else if (data.reason === 'elimination') {
        // Ajouter des informations de debug dans le message
        message = isWinner ?
            `🎉 Victoire! Vous avez éliminé tous les dots adverses!\n\nDEBUG: P1=${player1DotsEnd}, P2=${player2DotsEnd}` :
            `😞 Défaite. Tous vos dots ont été éliminés.\n\nDEBUG: P1=${player1DotsEnd}, P2=${player2DotsEnd}`;
    } else {
        message = isWinner ? '🎉 Victoire!' : '😞 Défaite.';
    }

    showModal('Fin de partie', message);
    stopTurnTimer();
    addGameLog(`🏆 ${winnerName} remporte la victoire! (${data.reason})`);

    // Afficher les récompenses/stats mises à jour si dispo
    showPostMatchRewards(data).catch(err => console.warn('Rewards fetch failed:', err));

    // Attendre plus longtemps avant de réinitialiser pour permettre l'analyse
    setTimeout(() => {
        console.log('🔄 Réinitialisation après fin de partie');
        currentGameId = null;
        gameState = null;
    }, 10000); // 10 secondes au lieu de 5
}

function handlePlayerLeft(data) {
    console.log('👋 Joueur parti:', data);

    if (gameState) {
        gameState.state = GAME_STATES.FINISHED;
    }

    showModal('Joueur parti', 'Votre adversaire a quitté la partie. Vous gagnez par forfait!');
    stopTurnTimer();
    addGameLog('👋 L\'adversaire a quitté la partie');

    setTimeout(() => {
        currentGameId = null;
        gameState = null;
    }, 3000);
}

function handlePlayerDisconnected(data) {
    console.log('🔌 Joueur déconnecté:', data);
    addGameLog(`🔌 ${data.playerName} s'est déconnecté`);
}

function handleTurnTimer(data) {
    currentTurnTime = data.timeLeft;
    updateTimerDisplay();
}

// Interface utilisateur
function updateUserInterface() {
    if (currentUser) {
        const playerNameEl = document.getElementById('player-name');
        if (playerNameEl) {
            playerNameEl.textContent = currentUser.username;
        }
    }
}

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');

    if (indicator && text) {
        if (connected) {
            indicator.className = 'status-indicator online';
            text.textContent = 'Connecté';
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = 'Déconnecté';
        }
    }
}

function updateGameInterface(gameState) {
    if (!gameState) return;

    updateTerritoryDisplay(gameState);
    updatePlayersDisplay(gameState.players);
    updateTurnDisplay(gameState);
    updatePowersDisplay();
}

function updateTerritoryDisplay(gameState) {
    if (!gameState || !gameState.territoryCount) return;

    const totalCells = 100;
    const player1Territory = gameState.territoryCount.player1 || 0;
    const player2Territory = gameState.territoryCount.player2 || 0;

    const player1Percentage = Math.round((player1Territory / totalCells) * 100);
    const player2Percentage = Math.round((player2Territory / totalCells) * 100);

    const player1Bar = document.getElementById('player1-territory');
    const player2Bar = document.getElementById('player2-territory');
    const player1Text = document.getElementById('player1-percentage');
    const player2Text = document.getElementById('player2-percentage');

    if (player1Bar && player2Bar && player1Text && player2Text) {
        player1Bar.style.width = `${player1Percentage}%`;
        player2Bar.style.width = `${player2Percentage}%`;
        player1Text.textContent = `${player1Percentage}%`;
        player2Text.textContent = `${player2Percentage}%`;
    }
}

function updatePlayersDisplay(players) {
    if (!players || players.length < 2) return;

    const playersList = document.getElementById('players-list');
    const player1Name = document.getElementById('player1-name');
    const player2Name = document.getElementById('player2-name');

    if (player1Name) player1Name.textContent = players[0].playerName;
    if (player2Name) player2Name.textContent = players[1].playerName;

    if (playersList) {
        playersList.innerHTML = players.map(player => `
            <div class="player-item">
                <span class="player-name">${player.playerName}</span>
                <span class="player-status">En ligne</span>
            </div>
        `).join('');
    }
}

function updateTurnDisplay(gameState) {
    const currentTurnText = document.getElementById('current-turn-text');
    if (!currentTurnText || !gameState || !gameState.players) return;

    const currentPlayerName = gameState.players.find(p => p.id === gameState.currentPlayer)?.playerName;
    const isMyTurn = gameState.currentPlayer === currentUser.id;

    currentTurnText.textContent = isMyTurn ?
        'À votre tour!' :
        `Tour de ${currentPlayerName}`;
}

function updatePowersDisplay() {
    const powerItems = document.querySelectorAll('.power-item');
    powerItems.forEach(item => {
        item.classList.remove('active');
        item.classList.add('disabled');
    });
}

function startTurnTimer() {
    stopTurnTimer();
    currentTurnTime = 15;

    turnTimer = setInterval(() => {
        currentTurnTime--;
        updateTimerDisplay();

        if (currentTurnTime <= 0) {
            stopTurnTimer();
        }
    }, 1000);
}

function stopTurnTimer() {
    if (turnTimer) {
        clearInterval(turnTimer);
        turnTimer = null;
    }
}

function updateTimerDisplay() {
    const timerText = document.getElementById('timer-text');
    const timerBar = document.getElementById('timer-bar');

    if (timerText) {
        timerText.textContent = currentTurnTime;
    }

    if (timerBar) {
        const percentage = (currentTurnTime / 15) * 100;
        timerBar.style.setProperty('--timer-width', `${percentage}%`);

        if (currentTurnTime <= 5) {
            timerBar.classList.add('danger');
        } else if (currentTurnTime <= 10) {
            timerBar.classList.add('warning');
        } else {
            timerBar.classList.remove('warning', 'danger');
        }
    }
}

function addGameLog(message, playerClass = '') {
    const logContent = document.getElementById('game-log-content');
    if (!logContent) return;

    const logEntry = document.createElement('p');
    logEntry.className = `log-entry ${playerClass}`.trim();
    logEntry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;

    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;

    while (logContent.children.length > 50) {
        logContent.removeChild(logContent.firstChild);
    }
}

function resetGameUI() {
    const currentTurnText = document.getElementById('current-turn-text');
    const player1Percentage = document.getElementById('player1-percentage');
    const player2Percentage = document.getElementById('player2-percentage');
    const timerText = document.getElementById('timer-text');

    if (currentTurnText) currentTurnText.textContent = 'En attente...';
    if (player1Percentage) player1Percentage.textContent = '0%';
    if (player2Percentage) player2Percentage.textContent = '0%';
    if (timerText) timerText.textContent = '15';

    const player1Bar = document.getElementById('player1-territory');
    const player2Bar = document.getElementById('player2-territory');
    if (player1Bar) player1Bar.style.width = '0%';
    if (player2Bar) player2Bar.style.width = '0%';

    const logContent = document.getElementById('game-log-content');
    if (logContent) {
        logContent.innerHTML = '<p class="log-entry">🎮 En attente d\'une partie...</p>';
    }
}

function createGameBoardFromState(gameState) {
    console.log('🎯 Création plateau depuis état serveur...');
    console.log('🔍 État de la grille:', gameState.grid);

    if (!gameState || !gameState.grid) {
        console.error('❌ Données de grille manquantes');
        createGameBoard();
        return;
    }

    const gameBoard = document.getElementById('game-board');
    if (!gameBoard) return;

    gameBoard.innerHTML = '';

    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = i;
            cell.dataset.y = j;

            const cellData = gameState.grid[i] && gameState.grid[i][j] ? gameState.grid[i][j] : null;

            if (cellData && cellData.owner) {
                const playerClass = cellData.owner === gameState.players[0].id ? 'player1' : 'player2';
                cell.classList.add(playerClass);
                cell.textContent = '●';

                if (cellData.mature) {
                    cell.classList.add('mature');
                }
            } else if (cellData && cellData.type === 'bonus') {
                cell.classList.add('bonus');
                cell.textContent = '⚡';
            } else {
                cell.classList.add('empty');
            }

            cell.addEventListener('click', () => placeDot(i, j));
            gameBoard.appendChild(cell);
        }
    }

    console.log('✅ Plateau créé avec état du serveur');
}

// Event listeners
function setupEventListeners() {
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', async () => {
            try {
                const choice = await chooseGameMode();
                selectedMode = choice.mode;
                selectedDifficulty = choice.difficulty;
                startNewGame(selectedMode, selectedDifficulty);
            } catch (e) {
                console.log('Annulé ou échec sélection du mode:', e);
            }
        });
    }

    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', showHelp);
    }

    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            window.location.href = '/profile';
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    const modalClose = document.querySelectorAll('.modal-close');
    modalClose.forEach(close => {
        close.addEventListener('click', closeModal);
    });

    const cancelSearch = document.getElementById('cancel-search');
    if (cancelSearch) {
        cancelSearch.addEventListener('click', cancelSearchGame);
    }

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal();
        }
    });

    console.log('✅ Event listeners Battle Dots configurés');
}

// Sélection mode/difficulté (utilise un modal si présent, sinon prompts)
function chooseGameMode() {
    return new Promise((resolve, reject) => {
        const modeModal = document.getElementById('mode-modal');
        const mpRadio = document.getElementById('mode-multiplayer');
        const soloRadio = document.getElementById('mode-solo');
        const difficultySelect = document.getElementById('difficulty-select');
        const startConfirm = document.getElementById('start-game-confirm');

        // Si UI présente, l'utiliser
        if (modeModal && mpRadio && soloRadio && difficultySelect && startConfirm) {
            modeModal.style.display = 'block';

            const onConfirm = () => {
                const mode = soloRadio.checked ? 'solo' : 'multiplayer';
                const difficulty = difficultySelect.value || 'medium';
                modeModal.style.display = 'none';
                startConfirm.removeEventListener('click', onConfirm);
                resolve({ mode, difficulty });
            };

            startConfirm.addEventListener('click', onConfirm);
        } else {
            // Fallback prompt
            const mode = window.confirm('Voulez-vous jouer en Solo contre l’IA ? OK = Solo, Annuler = Multijoueur')
                ? 'solo'
                : 'multiplayer';
            let difficulty = 'medium';
            if (mode === 'solo') {
                const d = window.prompt('Choisissez la difficulté (easy|medium|hard):', 'medium');
                if (['easy', 'medium', 'hard'].includes((d || '').toLowerCase())) {
                    difficulty = d.toLowerCase();
                }
            }
            resolve({ mode, difficulty });
        }
    });
}

// Fonctions d'action
function startNewGame(mode = 'multiplayer', difficulty = 'medium') {
    if (!socket || !currentUser) {
        showModal('Erreur', 'Connexion requise pour jouer!');
        return;
    }

    console.log(`🎯 Démarrage nouvelle partie Battle Dots... (mode=${mode}, difficulty=${difficulty})`);
    resetGameUI();

    const payload = {
        playerId: currentUser.id,
        playerName: currentUser.username,
        mode,
        difficulty
    };

    socket.emit('join-game', payload);
}

function logout() {
    console.log('👋 Déconnexion...');

    if (authCheckInterval) {
        clearInterval(authCheckInterval);
        authCheckInterval = null;
    }

    if (turnTimer) {
        clearInterval(turnTimer);
        turnTimer = null;
    }

    isCheckingAuth = false;

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    localStorage.removeItem('token');
    currentUser = null;
    redirectToLogin();
}

function redirectToLogin() {
    console.log('🔄 Redirection vers login...');

    if (authCheckInterval) {
        clearInterval(authCheckInterval);
        authCheckInterval = null;
    }

    if (turnTimer) {
        clearInterval(turnTimer);
        turnTimer = null;
    }

    isCheckingAuth = false;
    window.location.href = '/login';
}

// Fonctions utilitaires
function showModal(title, message) {
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const gameModal = document.getElementById('game-modal');

    if (modalTitle && modalMessage && gameModal) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        gameModal.style.display = 'block';
    } else {
        alert(`${title}\n\n${message}`);
    }
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

function cancelSearchGame() {
    if (socket) {
        socket.emit('cancel-search');
    }
    closeModal();
}

function showHelp() {
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
        helpModal.style.display = 'block';
    } else {
        alert('Battle Dots - Placez des points pour étendre votre territoire. Contrôlez la majorité pour gagner.');
    }
}

function getPowerName(powerType) {
    switch (powerType) {
        case POWER_TYPES.DOUBLE_PLACEMENT: return 'Double Placement';
        case POWER_TYPES.SHIELD: return 'Bouclier';
        case POWER_TYPES.EXPANSION_BOOST: return 'Boost d\'Expansion';
        default: return 'Pouvoir';
    }
}

// Récompenses / Stats post-match
async function showPostMatchRewards(gameEndData) {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // On tente de récupérer des rewards/stats à jour
        const res = await fetch('/api/users/me/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;

        const stats = await res.json();
        console.log('🏅 Stats mises à jour:', stats);

        // Si un modal dédié existe, l'afficher joliment
        const rewardModal = document.getElementById('reward-modal');
        const rewardBody = document.getElementById('reward-body');
        if (rewardModal && rewardBody) {
            const winRate = stats.winRate != null ? Math.round(stats.winRate * 100) : null;
            rewardBody.innerHTML = `
                <div class="rewards-summary">
                    <div class="line"><strong>Parties jouées:</strong> ${stats.totalGames ?? '-'}</div>
                    <div class="line"><strong>Victoires:</strong> ${stats.wins ?? '-'} | <strong>Défaites:</strong> ${stats.losses ?? '-'}</div>
                    <div class="line"><strong>Win rate:</strong> ${winRate !== null ? winRate + '%' : '-'}</div>
                    <div class="line"><strong>Série:</strong> ${stats.currentStreak ?? 0} (meilleure: ${stats.bestStreak ?? 0})</div>
                    <div class="line"><strong>Niveau:</strong> ${stats.level ?? 1} — XP: ${stats.xp ?? 0} ${stats.nextLevelXp ? `/ ${stats.nextLevelXp}` : ''}</div>
                    <div class="line"><strong>Coins:</strong> ${stats.coins ?? 0}</div>
                </div>
            `;
            rewardModal.style.display = 'block';
        } else {
            // Fallback: simple info dans le log
            addGameLog('🏅 Stats mises à jour après la partie.');
        }
    } catch (e) {
        console.warn('Impossible d’afficher les récompenses:', e);
    }
}

// PWA
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => console.log('✅ Service Worker enregistré:', reg.scope))
                .catch(err => console.warn('⚠️ Service Worker échec:', err));
        });
    }
}

// Nettoyage à la fermeture
window.addEventListener('beforeunload', () => {
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
    }
    if (turnTimer) {
        clearInterval(turnTimer);
    }
    if (socket) {
        socket.disconnect();
    }
});

console.log('🎯 Battle Dots - Script principal chargé!');
