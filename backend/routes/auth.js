const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// JWT Secret (à mettre dans .env)
const JWT_SECRET = process.env.JWT_SECRET || 'quantum_garden_secret_key_2025';

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    console.log('📝 Tentative inscription:', { username, email });

    // Vérifier si l'utilisateur existe
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      console.log('❌ Utilisateur déjà existant');
      return res.status(400).json({
        message: 'Utilisateur déjà existant'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Créer utilisateur
    const user = new User({
      username,
      email,
      password: hashedPassword
    });

    await user.save();
    console.log('✅ Utilisateur créé:', user.username);

    // Générer JWT
    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon
      }
    });
  } catch (error) {
    console.error('❌ Erreur register:', error);
    res.status(500).json({ message: 'Erreur serveur: ' + error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Tentative connexion:', email);

    // Trouver utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ Utilisateur introuvable:', email);
      return res.status(400).json({
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Mot de passe incorrect pour:', email);
      return res.status(400).json({
        message: 'Email ou mot de passe incorrect'
      });
    }

    console.log('✅ Connexion réussie pour:', user.username);

    // Générer JWT
    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon
      }
    });
  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ message: 'Erreur serveur: ' + error.message });
  }
});

// Vérifier token AMÉLIORÉ
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
      console.log('❌ Token manquant');
      return res.status(401).json({ message: 'Token manquant' });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      console.log('❌ Token invalide');
      return res.status(401).json({ message: 'Token invalide' });
    }

    console.log('🔍 Vérification token...');
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      console.log('❌ Utilisateur introuvable pour token');
      return res.status(401).json({ message: 'Utilisateur introuvable' });
    }

    console.log('✅ Token valide pour:', user.username);

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Erreur vérification token:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Token invalide' });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expiré' });
    }

    res.status(401).json({ message: 'Erreur token: ' + error.message });
  }
});

module.exports = router;
