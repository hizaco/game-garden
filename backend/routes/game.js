const express = require('express');
const GameSave = require('../models/GameSave');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Sauvegarder une partie
router.post('/save', authMiddleware, async (req, res) => {
  try {
    const { gameData } = req.body;
    const userId = req.user.userId;

    // Supprimer ancienne sauvegarde
    await GameSave.findOneAndDelete({ userId });

    // Créer nouvelle sauvegarde
    const gameSave = new GameSave({
      userId,
      gameData: {
        ...gameData,
        savedAt: new Date()
      }
    });

    await gameSave.save();

    res.json({
      message: 'Partie sauvegardée avec succès',
      saveId: gameSave._id
    });
  } catch (error) {
    console.error('Erreur sauvegarde:', error);
    res.status(500).json({ message: 'Erreur lors de la sauvegarde' });
  }
});

// Charger une partie
router.get('/load', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const gameSave = await GameSave.findOne({ userId });

    if (!gameSave) {
      return res.status(404).json({
        message: 'Aucune sauvegarde trouvée'
      });
    }

    res.json({
      message: 'Partie chargée avec succès',
      gameData: gameSave.gameData
    });
  } catch (error) {
    console.error('Erreur chargement:', error);
    res.status(500).json({ message: 'Erreur lors du chargement' });
  }
});

// Obtenir les statistiques de jeu
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('gamesPlayed gamesWon username');

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const winRate = user.gamesPlayed > 0 ?
      ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1) : 0;

    res.json({
      username: user.username,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      winRate: `${winRate}%`
    });
  } catch (error) {
    console.error('Erreur stats:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des stats' });
  }
});

// Enregistrer une victoire
router.post('/win', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    await User.findByIdAndUpdate(userId, {
      $inc: {
        gamesPlayed: 1,
        gamesWon: 1
      }
    });

    res.json({ message: 'Victoire enregistrée !' });
  } catch (error) {
    console.error('Erreur victoire:', error);
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement' });
  }
});

// Enregistrer une défaite
router.post('/loss', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    await User.findByIdAndUpdate(userId, {
      $inc: { gamesPlayed: 1 }
    });

    res.json({ message: 'Partie enregistrée' });
  } catch (error) {
    console.error('Erreur défaite:', error);
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement' });
  }
});

// Classement des joueurs
router.get('/leaderboard', async (req, res) => {
  try {
    const topPlayers = await User.find({})
      .select('username gamesPlayed gamesWon')
      .sort({ gamesWon: -1 })
      .limit(10);

    const leaderboard = topPlayers.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      gamesPlayed: player.gamesPlayed,
      gamesWon: player.gamesWon,
      winRate: player.gamesPlayed > 0 ?
        ((player.gamesWon / player.gamesPlayed) * 100).toFixed(1) : 0
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('Erreur classement:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du classement' });
  }
});

module.exports = router;
