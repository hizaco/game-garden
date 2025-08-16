// Variables globales
let isLoginMode = true;

// Initialisation SEULEMENT pour la page de login
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier si on est sur la page de login
    if (window.location.pathname === '/login' || window.location.pathname.includes('login')) {
        initializeAuth();
    }
});

function initializeAuth() {
    // Vérifier si déjà connecté SEULEMENT sur la page login
    checkExistingAuth();

    // Event listeners
    setupAuthEventListeners();

    console.log('🔐 Auth système initialisé (page login)');
}

// Vérifier l'authentification existante SEULEMENT pour redirection
async function checkExistingAuth() {
    const token = localStorage.getItem('token');

    if (token) {
        try {
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                // Utilisateur déjà connecté, rediriger vers le jeu
                console.log('✅ Déjà connecté, redirection vers le jeu');
                window.location.href = '/';
                return;
            } else {
                // Token invalide, le supprimer
                console.log('❌ Token invalide, suppression');
                localStorage.removeItem('token');
            }
        } catch (error) {
            console.error('Erreur vérification token:', error);
            localStorage.removeItem('token');
        }
    }
}

// Configuration des event listeners
function setupAuthEventListeners() {
    // Toggle entre login et register
    document.getElementById('toggle-form')?.addEventListener('click', toggleAuthMode);

    // Formulaires
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('register-form')?.addEventListener('submit', handleRegister);

    // Google OAuth
    document.getElementById('google-login')?.addEventListener('click', handleGoogleLogin);

    // Validation en temps réel
    setupRealTimeValidation();
}

// Le reste du code auth.js reste identique...
function toggleAuthMode() {
    isLoginMode = !isLoginMode;

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toggleText = document.getElementById('toggle-text');
    const toggleButton = document.getElementById('toggle-form');

    if (isLoginMode) {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        toggleText.textContent = "Pas encore de compte ?";
        toggleButton.textContent = "S'inscrire";
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        toggleText.textContent = "Déjà un compte ?";
        toggleButton.textContent = "Se connecter";
    }

    hideMessages();
}

async function handleLogin(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    const email = formData.get('email');
    const password = formData.get('password');

    if (!validateEmail(email)) {
        showErrorMessage('Email invalide');
        return;
    }

    if (password.length < 6) {
        showErrorMessage('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }

    setLoadingState(submitBtn, true);
    hideMessages();

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            showSuccessMessage('Connexion réussie ! Redirection...');

            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            showErrorMessage(data.message || 'Erreur de connexion');
        }
    } catch (error) {
        console.error('Erreur login:', error);
        showErrorMessage('Erreur de connexion. Vérifiez votre réseau.');
    } finally {
        setLoadingState(submitBtn, false);
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    const username = formData.get('username');
    const email = formData.get('email');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');

    if (!validateUsername(username)) {
        showErrorMessage('Le nom d\'utilisateur doit contenir 3-20 caractères alphanumériques');
        return;
    }

    if (!validateEmail(email)) {
        showErrorMessage('Email invalide');
        return;
    }

    if (password.length < 6) {
        showErrorMessage('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }

    if (password !== confirmPassword) {
        showErrorMessage('Les mots de passe ne correspondent pas');
        return;
    }

    setLoadingState(submitBtn, true);
    hideMessages();

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            showSuccessMessage('Inscription réussie ! Redirection...');

            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            showErrorMessage(data.message || 'Erreur d\'inscription');
        }
    } catch (error) {
        console.error('Erreur register:', error);
        showErrorMessage('Erreur d\'inscription. Vérifiez votre réseau.');
    } finally {
        setLoadingState(submitBtn, false);
    }
}

async function handleGoogleLogin() {
    showErrorMessage('Google OAuth sera implémenté prochainement');
}

function setupRealTimeValidation() {
    const emailInputs = document.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        input.addEventListener('blur', () => {
            if (input.value && !validateEmail(input.value)) {
                input.style.borderColor = 'rgba(255, 107, 107, 0.7)';
            } else {
                input.style.borderColor = '';
            }
        });
    });

    const confirmPasswordInput = document.getElementById('reg-confirm-password');
    const passwordInput = document.getElementById('reg-password');

    if (confirmPasswordInput && passwordInput) {
        confirmPasswordInput.addEventListener('input', () => {
            if (confirmPasswordInput.value &&
                confirmPasswordInput.value !== passwordInput.value) {
                confirmPasswordInput.style.borderColor = 'rgba(255, 107, 107, 0.7)';
            } else {
                confirmPasswordInput.style.borderColor = '';
            }
        });
    }

    const usernameInput = document.getElementById('reg-username');
    if (usernameInput) {
        usernameInput.addEventListener('blur', () => {
            if (usernameInput.value && !validateUsername(usernameInput.value)) {
                usernameInput.style.borderColor = 'rgba(255, 107, 107, 0.7)';
            } else {
                usernameInput.style.borderColor = '';
            }
        });
    }
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    return usernameRegex.test(username);
}

function setLoadingState(button, loading) {
    const btnText = button.querySelector('.btn-text');
    const spinner = button.querySelector('.loading-spinner');

    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
        if (btnText) btnText.style.opacity = '0';
        if (spinner) spinner.style.display = 'block';
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        if (btnText) btnText.style.opacity = '1';
        if (spinner) spinner.style.display = 'none';
    }
}

function showErrorMessage(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.style.animation = 'fadeIn 0.3s ease-out';

        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function showSuccessMessage(message) {
    const successDiv = document.getElementById('success-message');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        successDiv.style.animation = 'fadeIn 0.3s ease-out';
    }
}

function hideMessages() {
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');

    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
}

console.log('🔐 Auth JavaScript chargé (login uniquement)!');
