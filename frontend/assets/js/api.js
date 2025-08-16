// Configuration API
const API_BASE_URL = window.location.origin + '/api';

class QuantumGardenAPI {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.token = localStorage.getItem('token');
    }

    // Méthodes utilitaires
    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        return headers;
    }

    async handleResponse(response) {
        if (response.status === 401) {
            // Token expiré ou invalide
            localStorage.removeItem('token');
            window.location.href = '/login';
            throw new Error('Session expirée');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erreur API');
        }

        return data;
    }

    // Authentification
    async login(email, password) {
        const response = await fetch(`${this.baseURL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await this.handleResponse(response);

        if (data.token) {
            this.token = data.token;
            localStorage.setItem('token', data.token);
        }

        return data;
    }

    async register(username, email, password) {
        const response = await fetch(`${this.baseURL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await this.handleResponse(response);

        if (data.token) {
            this.token = data.token;
            localStorage.setItem('token', data.token);
        }

        return data;
    }

    async verifyToken() {
        const response = await fetch(`${this.baseURL}/auth/verify`, {
            headers: this.getAuthHeaders()
        });

        return await this.handleResponse(response);
    }

    // Gestion des utilisateurs
    async getUserProfile() {
        const response = await fetch(`${this.baseURL}/user/profile`, {
            headers: this.getAuthHeaders()
        });

        return await this.handleResponse(response);
    }

    async updateUserProfile(username) {
        const response = await fetch(`${this.baseURL}/user/profile`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ username })
        });

        return await this.handleResponse(response);
    }

    async deleteAccount() {
        const response = await fetch(`${this.baseURL}/user/account`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });

        return await this.handleResponse(response);
    }

    // Gestion des jeux
    async saveGame(gameData) {
        const response = await fetch(`${this.baseURL}/game/save`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ gameData })
        });

        return await this.handleResponse(response);
    }

    async loadGame() {
        const response = await fetch(`${this.baseURL}/game/load`, {
            headers: this.getAuthHeaders()
        });

        return await this.handleResponse(response);
    }

    async getGameStats() {
        const response = await fetch(`${this.baseURL}/game/stats`, {
            headers: this.getAuthHeaders()
        });

        return await this.handleResponse(response);
    }

    async recordWin() {
        const response = await fetch(`${this.baseURL}/game/win`, {
            method: 'POST',
            headers: this.getAuthHeaders()
        });

        return await this.handleResponse(response);
    }

    async recordLoss() {
        const response = await fetch(`${this.baseURL}/game/loss`, {
            method: 'POST',
            headers: this.getAuthHeaders()
        });

        return await this.handleResponse(response);
    }

    async getLeaderboard() {
        const response = await fetch(`${this.baseURL}/game/leaderboard`, {
            headers: this.getAuthHeaders()
        });

        return await this.handleResponse(response);
    }

    // Utilities
    logout() {
        this.token = null;
        localStorage.removeItem('token');
        window.location.href = '/login';
    }
}

// Instance globale
const api = new QuantumGardenAPI();

// Export pour utilisation dans d'autres fichiers
window.QuantumGardenAPI = QuantumGardenAPI;
window.api = api;

console.log('🔌 API client initialisé');
