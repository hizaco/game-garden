const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'quantum_garden_secret_key_2025';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
      return res.status(401).json({
        message: 'Accès refusé. Token manquant.'
      });
    }

    // Extraire le token (format: "Bearer TOKEN")
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return res.status(401).json({
        message: 'Accès refusé. Token invalide.'
      });
    }

    // Vérifier le token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Vérifier que l'utilisateur existe encore
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        message: 'Utilisateur introuvable.'
      });
    }

    req.user = decoded;
    req.userData = user; // Ajouter les données complètes de l'utilisateur
    next();
  } catch (error) {
    console.error('Erreur auth middleware:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Token invalide.' });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expiré.' });
    }

    return res.status(500).json({ message: 'Erreur serveur.' });
  }
};

module.exports = authMiddleware;
