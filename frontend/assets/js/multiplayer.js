// Gestion du multijoueur avec Socket.io
class MultiplayerManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentGameId = null;
        this.playerId = null;
        this.playerName = null;
        this.gameState = null;
        this.callbacks = {};
    }

    // Initialisation
    initialize(user) {
        this.playerId = user.id;
        this.playerName = user.username;

        this.socket = io();
        this.setupSocketEvents();

        console.log('🌐 Multijoueur initialisé pour:', this.playerName);
    }

    // Configuration des événements Socket.io
    setupSocketEvents() {
        // Connexion
        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log('✅ Connecté au serveur multijoueur');
            this.emit('connection-status', { connected: true });
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log('❌ Déconnecté du serveur multijoueur');
            this.emit('connection-status', { connected: false });
        });

        // Événements de jeu
        this.socket.on('waiting-for-opponent', (data) => {
            console.log('⏳ En attente d\'adversaire:', data);
            this.emit('waiting-for-opponent', data);
        });

        this.socket.on('game-start', (data) => {
            console.log('🎮 Partie commencée:', data);
            this.currentGameId = data.gameId;
            this.gameState = data.gameState;
            this.emit('game-start', data);
        });

        this.socket.on('cell-observed', (data) => {
            console.log('👁️ Cellule observée:', data);
            this.gameState = data.gameState;
            this.emit('cell-observed', data);
        });

        this.socket.on('game-end', (data) => {
            console.log('🏆 Fin de partie:', data);
            this.emit('game-end', data);
            this.resetGame();
        });

        this.socket.on('player-left', (data) => {
            console.log('👋 Joueur parti:', data);
            this.emit('player-left', data);
            this.resetGame();
        });

        this.socket.on('player-disconnected', (data) => {
            console.log('🔌 Joueur déconnecté:', data);
            this.emit('player-disconnected', data);
        });

        this.socket.on('game-state-update', (data) => {
            console.log('📊 Mise à jour état de jeu:', data);
            this.gameState = data;
            this.emit('game-state-update', data);
        });
    }

    // Rejoindre une partie
    joinGame() {
        if (!this.socket || !this.isConnected) {
            console.error('❌ Socket non connecté');
            return false;
        }

        this.socket.emit('join-game', {
            playerId: this.playerId,
            playerName: this.playerName
        });

        return true;
    }

    // Observer une cellule
    observeCell(x, y) {
        if (!this.currentGameId || !this.socket) {
            console.error('❌ Pas de partie en cours');
            return false;
        }

        this.socket.emit('observe-cell', {
            gameId: this.currentGameId,
            x: x,
            y: y,
            playerId: this.playerId
        });

        return true;
    }

    // Quitter la partie
    leaveGame() {
        if (this.currentGameId && this.socket) {
            this.socket.emit('leave-game', {
                gameId: this.currentGameId
            });
        }

        this.resetGame();
    }

    // Obtenir l'état actuel du jeu
    getGameState() {
        if (this.currentGameId && this.socket) {
            this.socket.emit('get-game-state', {
                gameId: this.currentGameId
            });
        }
    }

    // Réinitialiser la partie
    resetGame() {
        this.currentGameId = null;
        this.gameState = null;
    }

    // Déconnexion
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.resetGame();
    }

    // Système d'événements
    on(event, callback) {
        if (!this.callbacks[event]) {
            this.callbacks[event] = [];
        }
        this.callbacks[event].push(callback);
    }

    off(event, callback) {
        if (this.callbacks[event]) {
            const index = this.callbacks[event].indexOf(callback);
            if (index > -1) {
                this.callbacks[event].splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Erreur dans callback ${event}:`, error);
                }
            });
        }
    }

    // Getters
    isInGame() {
        return this.currentGameId !== null;
    }

    getConnectionStatus() {
        return this.isConnected;
    }

    getCurrentGameId() {
        return this.currentGameId;
    }

    getCurrentGameState() {
        return this.gameState;
    }
}

// Instance globale
const multiplayer = new MultiplayerManager();

// Export pour utilisation dans d'autres fichiers
window.MultiplayerManager = MultiplayerManager;
window.multiplayer = multiplayer;

console.log('🎮 Gestionnaire multijoueur chargé');
