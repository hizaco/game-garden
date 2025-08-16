class QuantumGarden {
    constructor() {
        this.gridSize = 6;
        this.grid = [];
        this.score = 0;
        this.level = 1;
        this.observations = 10;
        this.currentObjective = null;

        this.plantTypes = ['red', 'blue', 'yellow', 'purple'];
        this.plantEmojis = {
            'red': '🌹',
            'blue': '🌿',
            'yellow': '🌻',
            'purple': '🔮',
            'superposition': '🌈',
            'empty': '⚫'
        };

        this.objectives = [
            { description: "Créez 3 fleurs rouges alignées", pattern: this.createPattern(['red', 'red', 'red']) },
            { description: "Formez un carré de 4 fleurs bleues", pattern: this.createSquarePattern('blue') },
            { description: "Alignez 4 fleurs de couleurs différentes", pattern: this.createPattern(['red', 'blue', 'yellow', 'purple']) },
            { description: "Créez une croix avec des fleurs violettes", pattern: this.createCrossPattern('purple') }
        ];

        this.initializeGame();
        this.setupEventListeners();
        this.generateGarden();
        this.setObjective();
    }

    initializeGame() {
        this.updateStats();
        this.createGrid();
    }

    createGrid() {
        const garden = document.getElementById('garden');
        garden.innerHTML = '';

        this.grid = [];
        for (let i = 0; i < this.gridSize * this.gridSize; i++) {
            const plant = document.createElement('div');
            plant.classList.add('plant', 'superposition');
            plant.dataset.index = i;
            plant.textContent = this.plantEmojis.superposition;

            plant.addEventListener('click', () => this.observePlant(i));
            garden.appendChild(plant);

            this.grid.push({
                state: 'superposition',
                probabilities: this.generateQuantumProbabilities(),
                element: plant
            });
        }
    }

    generateQuantumProbabilities() {
        const probabilities = {};
        let remaining = 1.0;

        for (let i = 0; i < this.plantTypes.length - 1; i++) {
            const prob = Math.random() * remaining;
            probabilities[this.plantTypes[i]] = prob;
            remaining -= prob;
        }
        probabilities[this.plantTypes[this.plantTypes.length - 1]] = remaining;

        return probabilities;
    }

    observePlant(index) {
        if (this.observations <= 0) {
            this.showMessage("Plus d'observations disponibles ! Recommencez le niveau.");
            return;
        }

        const plant = this.grid[index];
        if (plant.state !== 'superposition') {
            this.showMessage("Cette plante a déjà été observée !");
            return;
        }

        // Collapse de l'état quantique
        const collapsedState = this.collapseQuantumState(plant.probabilities);
        plant.state = collapsedState;
        plant.element.classList.remove('superposition');
        plant.element.classList.add('collapsed', collapsedState);
        plant.element.textContent = this.plantEmojis[collapsedState];

        this.observations--;
        this.score += 10;

        // Effet quantique sur les voisins
        this.applyQuantumEntanglement(index);

        this.updateStats();
        this.checkObjective();

        setTimeout(() => {
            plant.element.classList.remove('collapsed');
        }, 500);
    }

    collapseQuantumState(probabilities) {
        const random = Math.random();
        let cumulative = 0;

        for (const [state, probability] of Object.entries(probabilities)) {
            cumulative += probability;
            if (random <= cumulative) {
                return state;
            }
        }

        return this.plantTypes[0]; // Fallback
    }

    applyQuantumEntanglement(index) {
        const neighbors = this.getNeighbors(index);

        neighbors.forEach(neighborIndex => {
            const neighbor = this.grid[neighborIndex];
            if (neighbor.state === 'superposition') {
                // Modification des probabilités quantiques
                const randomType = this.plantTypes[Math.floor(Math.random() * this.plantTypes.length)];
                neighbor.probabilities[randomType] = Math.min(1, neighbor.probabilities[randomType] + 0.2);

                // Normalisation des probabilités
                const total = Object.values(neighbor.probabilities).reduce((sum, prob) => sum + prob, 0);
                for (const type in neighbor.probabilities) {
                    neighbor.probabilities[type] /= total;
                }

                // Effet visuel
                neighbor.element.style.animation = 'none';
                setTimeout(() => {
                    neighbor.element.style.animation = 'quantumShimmer 2s ease-in-out infinite';
                }, 100);
            }
        });
    }

    getNeighbors(index) {
        const neighbors = [];
        const row = Math.floor(index / this.gridSize);
        const col = index % this.gridSize;

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;

                const newRow = row + dr;
                const newCol = col + dc;

                if (newRow >= 0 && newRow < this.gridSize &&
                    newCol >= 0 && newCol < this.gridSize) {
                    neighbors.push(newRow * this.gridSize + newCol);
                }
            }
        }

        return neighbors;
    }

    generateGarden() {
        // Regénère les probabilités quantiques pour tous les plants en superposition
        this.grid.forEach(plant => {
            if (plant.state === 'superposition') {
                plant.probabilities = this.generateQuantumProbabilities();
            }
        });
    }

    setObjective() {
        const objective = this.objectives[(this.level - 1) % this.objectives.length];
        this.currentObjective = objective;

        document.getElementById('objective-text').textContent = objective.description;
        this.renderTargetPattern(objective.pattern);
    }

    createPattern(colors) {
        return colors.map(color => ({ type: color }));
    }

    createSquarePattern(color) {
        return [
            { type: color }, { type: color },
            { type: color }, { type: color }
        ];
    }

    createCrossPattern(color) {
        return [
            { type: 'any' }, { type: color }, { type: 'any' },
            { type: color }, { type: color }, { type: color },
            { type: 'any' }, { type: color }, { type: 'any' }
        ];
    }

    renderTargetPattern(pattern) {
        const targetElement = document.getElementById('target-pattern');
        targetElement.innerHTML = '';

        const cols = pattern.length <= 4 ? Math.min(pattern.length, 2) : 3;
        targetElement.style.gridTemplateColumns = `repeat(${cols}, 30px)`;

        pattern.forEach(cell => {
            const cellElement = document.createElement('div');
            cellElement.classList.add('target-cell');
            if (cell.type !== 'any') {
                cellElement.classList.add(cell.type);
                cellElement.textContent = this.plantEmojis[cell.type];
            }
            targetElement.appendChild(cellElement);
        });
    }

    checkObjective() {
        if (this.isObjectiveComplete()) {
            this.score += 100 * this.level;
            this.showVictoryMessage();
            document.getElementById('next-level-btn').style.display = 'block';
        }
    }

    isObjectiveComplete() {
        const pattern = this.currentObjective.pattern;

        // Vérification pour motifs linéaires
        if (pattern.length <= 4) {
            return this.checkLinearPatterns(pattern);
        }

        // Vérification pour motifs 2D (croix, etc.)
        return this.check2DPatterns(pattern);
    }

    checkLinearPatterns(pattern) {
        const patternTypes = pattern.map(p => p.type);

        // Vérification horizontale
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col <= this.gridSize - pattern.length; col++) {
                let match = true;
                for (let i = 0; i < pattern.length; i++) {
                    const index = row * this.gridSize + col + i;
                    if (this.grid[index].state !== patternTypes[i]) {
                        match = false;
                        break;
                    }
                }
                if (match) return true;
            }
        }

        // Vérification verticale
        for (let col = 0; col < this.gridSize; col++) {
            for (let row = 0; row <= this.gridSize - pattern.length; row++) {
                let match = true;
                for (let i = 0; i < pattern.length; i++) {
                    const index = (row + i) * this.gridSize + col;
                    if (this.grid[index].state !== patternTypes[i]) {
                        match = false;
                        break;
                    }
                }
                if (match) return true;
            }
        }

        // Vérification diagonale
        for (let row = 0; row <= this.gridSize - pattern.length; row++) {
            for (let col = 0; col <= this.gridSize - pattern.length; col++) {
                let match1 = true, match2 = true;
                for (let i = 0; i < pattern.length; i++) {
                    const index1 = (row + i) * this.gridSize + col + i;
                    const index2 = (row + i) * this.gridSize + col + pattern.length - 1 - i;

                    if (this.grid[index1].state !== patternTypes[i]) match1 = false;
                    if (this.grid[index2].state !== patternTypes[i]) match2 = false;
                }
                if (match1 || match2) return true;
            }
        }

        return false;
    }

    check2DPatterns(pattern) {
        // Pour les motifs comme la croix (3x3)
        const patternSize = Math.sqrt(pattern.length);

        for (let row = 0; row <= this.gridSize - patternSize; row++) {
            for (let col = 0; col <= this.gridSize - patternSize; col++) {
                let match = true;
                for (let i = 0; i < patternSize; i++) {
                    for (let j = 0; j < patternSize; j++) {
                        const patternIndex = i * patternSize + j;
                        const gridIndex = (row + i) * this.gridSize + col + j;
                        const expectedType = pattern[patternIndex].type;

                        if (expectedType !== 'any' && this.grid[gridIndex].state !== expectedType) {
                            match = false;
                            break;
                        }
                    }
                    if (!match) break;
                }
                if (match) return true;
            }
        }

        return false;
    }

    showVictoryMessage() {
        const message = document.createElement('div');
        message.classList.add('victory-message');
        message.innerHTML = `
            🎉 Niveau ${this.level} Complété ! 🎉<br>
            <small>+${100 * this.level} points bonus</small>
        `;
        document.body.appendChild(message);

        setTimeout(() => {
            message.remove();
        }, 3000);
    }

    showMessage(text) {
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(255,255,255,0.9); color: #333; padding: 15px 25px;
            border-radius: 25px; font-weight: bold; z-index: 1000;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        `;
        message.textContent = text;
        document.body.appendChild(message);

        setTimeout(() => message.remove(), 2000);
    }

    resetGarden() {
        this.observations = 10 + (this.level - 1) * 2;
        this.createGrid();
        this.generateGarden();
        this.updateStats();
        document.getElementById('next-level-btn').style.display = 'none';
    }

    nextLevel() {
        this.level++;
        this.resetGarden();
        this.setObjective();
    }

    showHint() {
        const hint = this.generateHint();
        this.showMessage(hint);
    }

    generateHint() {
        const hints = [
            "💡 Les plantes voisines s'influencent mutuellement !",
            "🎯 Observez d'abord les coins pour avoir plus de contrôle",
            "🌈 Chaque observation change les probabilités des voisins",
            "🎲 Les états quantiques sont aléatoires mais influençables",
            "⚡ Planifiez vos observations pour créer des réactions en chaîne"
        ];
        return hints[Math.floor(Math.random() * hints.length)];
    }

    updateStats() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('level').textContent = this.level;
        document.getElementById('observations').textContent = this.observations;
    }

    setupEventListeners() {
        document.getElementById('reset-btn').addEventListener('click', () => this.resetGarden());
        document.getElementById('hint-btn').addEventListener('click', () => this.showHint());
        document.getElementById('next-level-btn').addEventListener('click', () => this.nextLevel());
    }
}

// Initialisation du jeu
document.addEventListener('DOMContentLoaded', () => {
    new QuantumGarden();
});
