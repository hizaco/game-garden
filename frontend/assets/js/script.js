// Variables globales
let socket = null;
let currentUser = null;
let gameState = null;
let currentGameId = null;
let authCheckInterval = null;
let isCheckingAuth = false; // AJOUTÉ: Empêche les vérifications multiples

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🌌 Quantum Garden - Initialisation...');

    // Vérifier l'authentification UNE SEULE FOIS
    const isAuthenticated = await checkAuth();

    if (isAuthenticated) {
        console.log('✅ Utilisateur authentifié:', currentUser.username);

        // Initialiser Socket.io et le jeu
        initializeSocket();
        initializeGame();

        // Vérifier périodiquement l'auth SEULEMENT toutes les 10 minutes (pas 5!)
        authCheckInterval = setInterval(() => {
            if (!isCheckingAuth) {
                checkAuth();
            }
        }, 10 * 60 * 1000); // 10 minutes au lieu de 5
    } else {
        console.log('❌ Utilisateur non authentifié, redirection...');
        redirectToLogin();
    }

    // Event listeners
    setupEventListeners();
});

// Vérification authentification CORRIGÉE
async function checkAuth() {
    // AJOUTÉ: Empêche les appels multiples simultanés
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
        console.log('🔍 Vérification du token...');

        const response = await fetch('/api/auth/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('📡 Réponse auth:', response.status);

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            console.log('✅ Auth valide pour:', currentUser.username);
            updateUserInterface();
            isCheckingAuth = false;
            return true;
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.log('❌ Auth échouée:', response.status, errorData.message);

            // SEULEMENT supprimer le token si c'est vraiment une erreur d'auth
            if (response.status === 401) {
                localStorage.removeItem('token');
                currentUser = null;
            }

            isCheckingAuth = false;
            return false;
        }
    } catch (error) {
        console.error('❌ Erreur vérification auth:', error);

        // Ne PAS supprimer le token en cas d'erreur réseau
        isCheckingAuth = false;

        // Si on a déjà un currentUser, on reste connecté
        return currentUser !== null;
    }
}

// Initialisation Socket.io CORRIGÉE
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

    // Events de jeu
    socket.on('waiting-for-opponent', handleWaitingForOpponent);
    socket.on('game-start', handleGameStart);
    socket.on('cell-observed', handleCellObserved);
    socket.on('game-end', handleGameEnd);
    socket.on('player-left', handlePlayerLeft);
    socket.on('player-disconnected', handlePlayerDisconnected);
}

// Le reste du code reste identique...
function initializeGame() {
    console.log('🎮 Initialisation du jeu...');
    createGameBoard();
    updateUserInterface();
}

function createGameBoard() {
    const gameBoard = document.getElementById('game-board');
    if (!gameBoard) {
        console.error('❌ Élément game-board introuvable');
        return;
    }

    gameBoard.innerHTML = '';

    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell superposition';
            cell.dataset.x = i;
            cell.dataset.y = j;

            cell.addEventListener('click', () => observeCell(i, j));

            gameBoard.appendChild(cell);
        }
    }

    console.log('✅ Grille de jeu créée (8x8)');
}

// Fonction observeCell AMÉLIORÉE avec plus de logs
function observeCell(x, y) {
    console.log(`🔍 Tentative observation cellule [${x}, ${y}]`);

    if (!currentGameId) {
        console.log('❌ Pas de gameId actuel');
        showModal('Erreur', 'Aucune partie en cours!');
        return;
    }

    if (!socket) {
        console.log('❌ Socket non connecté');
        showModal('Erreur', 'Connexion requise!');
        return;
    }

    if (!currentUser) {
        console.log('❌ Utilisateur non connecté');
        showModal('Erreur', 'Utilisateur non connecté!');
        return;
    }

    const cell = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    if (!cell) {
        console.log(`❌ Cellule [${x}, ${y}] introuvable dans le DOM`);
        return;
    }

    if (cell.classList.contains('collapsed')) {
        console.log(`❌ Cellule [${x}, ${y}] déjà effondrée`);
        showModal('Info', 'Cette cellule a déjà été observée!');
        return;
    }

    console.log(`✅ Envoi observation [${x}, ${y}] vers serveur`);
    console.log('📡 GameID:', currentGameId);
    console.log('👤 PlayerID:', currentUser.id);

    // Animation visuelle immédiate pour feedback
    cell.style.border = '2px solid #00ff88';
    cell.style.transform = 'scale(0.95)';

    setTimeout(() => {
        cell.style.border = '';
        cell.style.transform = '';
    }, 300);

    socket.emit('observe-cell', {
        gameId: currentGameId,
        x: x,
        y: y,
        playerId: currentUser.id
    });
}

function updateUserInterface() {
    if (currentUser) {
        const playerNameEl = document.getElementById('player-name');
        if (playerNameEl) {
            playerNameEl.textContent = currentUser.username;
        }
        console.log('🔄 Interface mise à jour pour:', currentUser.username);
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

function setupEventListeners() {
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', startNewGame);
    }

    const saveGameBtn = document.getElementById('save-game-btn');
    if (saveGameBtn) {
        saveGameBtn.addEventListener('click', saveGame);
    }

    const loadGameBtn = document.getElementById('load-game-btn');
    if (loadGameBtn) {
        loadGameBtn.addEventListener('click', loadGame);
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

    const modalClose = document.getElementById('modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    const cancelSearch = document.getElementById('cancel-search');
    if (cancelSearch) {
        cancelSearch.addEventListener('click', cancelSearchGame);
    }

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal();
        }
    });

    console.log('✅ Event listeners configurés');
}

function startNewGame() {
    if (!socket || !currentUser) {
        showModal('Erreur', 'Connexion requise pour jouer!');
        return;
    }

    console.log('🎮 Démarrage nouvelle partie...');

    socket.emit('join-game', {
        playerId: currentUser.id,
        playerName: currentUser.username
    });
}

// Handlers des événements Socket.io
function handleWaitingForOpponent(data) {
    console.log('⏳ En attente d\'adversaire:', data);
    const queuePosition = document.getElementById('queue-position');
    if (queuePosition) {
        queuePosition.textContent = data.queuePosition;
    }
    const waitingModal = document.getElementById('waiting-modal');
    if (waitingModal) {
        waitingModal.style.display = 'block';
    }
}

// Handler amélioré pour le début de partie
function handleGameStart(data) {
    console.log('🎮 Partie commencée!', data);
    currentGameId = data.gameId;
    gameState = data.gameState;

    // Fermer toutes les modals
    closeModal();

    // IMPORTANT: Recréer la grille de jeu avec les données du serveur
    createGameBoardFromState(gameState);

    // Mettre à jour l'interface
    updateObjectives(gameState.objectives);
    updatePlayersList(gameState.players);

    // Afficher le message de début brièvement
    showModal('Partie commencée!', 'La partie Quantum Garden a commencé!');

    // Fermer automatiquement le modal après 2 secondes
    setTimeout(() => {
        closeModal();
    }, 2000);
}

// NOUVELLE FONCTION: Créer la grille basée sur l'état du serveur
function createGameBoardFromState(gameState) {
    console.log('🎮 Création grille depuis état serveur...');

    const gameBoard = document.getElementById('game-board');
    if (!gameBoard) {
        console.error('❌ Élément game-board introuvable');
        return;
    }

    // Nettoyer la grille existante
    gameBoard.innerHTML = '';

    // Vérifier que nous avons les données de grille
    if (!gameState || !gameState.grid) {
        console.error('❌ Données de grille manquantes');
        // Créer une grille par défaut
        createGameBoard();
        return;
    }

    console.log('📊 Grille serveur:', gameState.grid.length, 'x', gameState.grid[0]?.length);

    // Créer les cellules basées sur l'état du serveur
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = i;
            cell.dataset.y = j;

            // Récupérer les données de la cellule du serveur
            const cellData = gameState.grid[i] && gameState.grid[i][j] ? gameState.grid[i][j] : null;

            if (cellData) {
                if (cellData.collapsed) {
                    cell.classList.add('collapsed', cellData.type);
                    console.log(`📍 Cellule [${i},${j}] effondrée: ${cellData.type}`);
                } else {
                    cell.classList.add('superposition');
                }
            } else {
                // État par défaut si pas de données
                cell.classList.add('superposition');
            }

            // IMPORTANT: Ajouter l'event listener pour chaque cellule
            cell.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                console.log(`👆 Clic sur cellule [${i},${j}]`);
                observeCell(i, j);
            });

            // Ajouter la cellule au plateau
            gameBoard.appendChild(cell);
        }
    }

    console.log('✅ Grille créée avec', gameBoard.children.length, 'cellules interactives');
}

// Handler amélioré pour les cellules observées
function handleCellObserved(data) {
    console.log('👁️ Cellule observée reçue du serveur:', data);

    if (!data.position || data.position.x === undefined || data.position.y === undefined) {
        console.error('❌ Position manquante dans les données');
        return;
    }

    const { x, y } = data.position;
    const cell = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);

    if (!cell) {
        console.error(`❌ Cellule [${x}, ${y}] introuvable pour mise à jour`);
        return;
    }

    console.log(`✨ Mise à jour cellule [${x}, ${y}] -> ${data.newState}`);

    // Retirer l'état de superposition
    cell.classList.remove('superposition');

    // Ajouter l'état effondré
    cell.classList.add('collapsed', data.newState);

    // Animation quantique
    cell.style.animation = 'quantum-collapse 0.5s ease-out';

    setTimeout(() => {
        cell.style.animation = '';
    }, 500);

    // Mettre à jour l'état du jeu
    if (data.gameState) {
        gameState = data.gameState;
        console.log('🔄 État de jeu mis à jour');

        // Vérifier s'il y a des objectifs atteints
        updateObjectives(gameState.objectives);
    }
}

function handleGameEnd(data) {
    console.log('🏆 Partie terminée!', data);

    const isWinner = data.winner === currentUser.id;
    const message = isWinner ?
        '🎉 Félicitations! Vous avez gagné!' :
        '😞 Partie terminée. Votre adversaire a gagné.';

    showModal('Fin de partie', message);

    recordGameResult(isWinner);

    currentGameId = null;
    gameState = null;
}

function handlePlayerLeft(data) {
    console.log('👋 Joueur parti:', data);
    showModal('Joueur parti', 'Votre adversaire a quitté la partie.');
    currentGameId = null;
    gameState = null;
}

function handlePlayerDisconnected(data) {
    console.log('🔌 Joueur déconnecté:', data);
    showModal('Déconnexion', `${data.playerId} s'est déconnecté.`);
}

// Déconnexion CORRIGÉE
function logout() {
    console.log('👋 Déconnexion...');

    // IMPORTANT: Nettoyer l'interval AVANT de supprimer le token
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
        authCheckInterval = null;
    }

    // Marquer qu'on ne vérifie plus l'auth
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

    // S'assurer qu'on nettoie tout avant la redirection
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
        authCheckInterval = null;
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

// Correction de la fonction updateGameBoard
function updateGameBoard(gameState) {
    if (!gameState || !gameState.grid) {
        console.log('❌ Pas de données de grille à mettre à jour');
        return;
    }

    console.log('🔄 Mise à jour complète du plateau');

    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const cell = document.querySelector(`[data-x="${i}"][data-y="${j}"]`);
            const cellData = gameState.grid[i] && gameState.grid[i][j] ? gameState.grid[i][j] : null;

            if (cell && cellData) {
                // Nettoyer toutes les classes
                cell.className = 'cell';

                if (cellData.collapsed) {
                    cell.classList.add('collapsed', cellData.type);
                } else {
                    cell.classList.add('superposition');
                }
            }
        }
    }
}

function updateObjectives(objectives) {
    if (!objectives) return;

    const flowersEl = document.getElementById('flowers-needed');
    const treesEl = document.getElementById('trees-needed');
    const crystalsEl = document.getElementById('crystals-needed');

    if (flowersEl) flowersEl.textContent = objectives.flowers;
    if (treesEl) treesEl.textContent = objectives.trees;
    if (crystalsEl) crystalsEl.textContent = objectives.crystals;
}

// Fonction pour débugger l'état actuel
function debugGameState() {
    console.log('🔍 DEBUG - État du jeu:');
    console.log('GameID actuel:', currentGameId);
    console.log('Socket connecté:', socket ? socket.connected : 'Non');
    console.log('Utilisateur:', currentUser);
    console.log('État de jeu:', gameState);

    const cells = document.querySelectorAll('.cell');
    console.log('Cellules dans le DOM:', cells.length);

    cells.forEach((cell, index) => {
        if (index < 5) { // Log seulement les 5 premières
            console.log(`Cellule [${cell.dataset.x}, ${cell.dataset.y}]:`, cell.className);
        }
    });
}

// Ajouter un raccourci clavier pour debug
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'd') {
        event.preventDefault();
        debugGameState();
    }
});


function updatePlayersList(players) {
    const playersList = document.getElementById('players-list');
    if (!players || !playersList) return;

    playersList.innerHTML = players.map(player =>
        `<div class="player-item">
            <span class="player-name">${player.playerName}</span>
            <span class="player-status">En ligne</span>
        </div>`
    ).join('');
}

async function saveGame() {
    if (!gameState) {
        showModal('Erreur', 'Aucune partie en cours à sauvegarder!');
        return;
    }

    try {
        const response = await fetch('/api/game/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ gameData: gameState })
        });

        const data = await response.json();

        if (response.ok) {
            showModal('Succès', 'Partie sauvegardée avec succès!');
        } else {
            showModal('Erreur', data.message || 'Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur sauvegarde:', error);
        showModal('Erreur', 'Erreur lors de la sauvegarde');
    }
}

async function loadGame() {
    try {
        const response = await fetch('/api/game/load', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            gameState = data.gameData;
            updateGameBoard(gameState);
            showModal('Succès', 'Partie chargée avec succès!');
        } else {
            showModal('Erreur', data.message || 'Aucune sauvegarde trouvée');
        }
    } catch (error) {
        console.error('Erreur chargement:', error);
        showModal('Erreur', 'Erreur lors du chargement');
    }
}



function showHelp() {
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
        helpModal.style.display = 'block';
    }
}

async function recordGameResult(isWinner) {
    try {
        const endpoint = isWinner ? '/api/game/win' : '/api/game/loss';
        await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
    } catch (error) {
        console.error('Erreur enregistrement résultat:', error);
    }
}

// Nettoyage à la fermeture de la page
window.addEventListener('beforeunload', () => {
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
    }
    if (socket) {
        socket.disconnect();
    }
});

console.log('🌌 Quantum Garden - Script principal chargé!');
