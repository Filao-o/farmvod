'use strict';

/**
 * Autorisation YouTube isolée (sans relancer tout le pipeline).
 * Génère l'URL de consentement, attend le retour sur http://localhost:<port>
 * (4567 par défaut, réglable via "upload.oauthPort"), et enregistre
 * credentials/token.json. Réutilisable pour re-consentir (utile tant que l'app
 * OAuth reste en mode "Test" : le token expire au bout de ~7 jours).
 *
 *   node outils/auth-youtube.js
 *
 * Prérequis : credentials/client_secret.json (tes propres identifiants Google
 * Cloud — voir README.md, section « Upload YouTube »).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { loadGlobal } = require('../src/config');
const {
    SCOPES, portOAuth, cheminsCredentials, chargerSecretOAuth, chargerGoogleapis,
} = require('../src/06-upload');

const RACINE = path.join(__dirname, '..');

function echec(message) {
    console.error('AUTH_ERROR ' + message);
    process.exit(1);
}

let google, conf, port;
try {
    port = portOAuth(loadGlobal(RACINE));
    ({ google } = chargerGoogleapis());
    conf = chargerSecretOAuth(RACINE, port);
} catch (e) {
    echec(e.message);
}

const { fichierToken } = cheminsCredentials(RACINE);
const client = new google.auth.OAuth2(conf.client_id, conf.client_secret, `http://localhost:${port}`);

const url = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
console.log('Ouvre cette adresse dans ton navigateur, connecte-toi au compte de TA chaîne et autorise :\n');
console.log('AUTH_URL ' + url + '\n');

const serveur = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const params = new URL(req.url, `http://localhost:${port}`).searchParams;
    const err = params.get('error');
    const code = params.get('code');
    if (err) {
        res.end('Erreur d\'autorisation : ' + err);
        serveur.close();
        echec(err);
    }
    if (!code) { res.end('Aucun code reçu.'); return; }
    try {
        const { tokens } = await client.getToken(code);
        fs.mkdirSync(path.dirname(fichierToken), { recursive: true });
        fs.writeFileSync(fichierToken, JSON.stringify(tokens, null, 2), 'utf-8');
        res.end('Autorisation reçue. Tu peux fermer cet onglet et revenir au terminal.');
        console.log('TOKEN_SAVED refresh=' + (!!tokens.refresh_token));
        serveur.close();
        process.exit(0);
    } catch (e) {
        res.end('Échec : ' + e.message);
        serveur.close();
        echec(e.message);
    }
});
serveur.on('error', (e) => echec(
    e.code === 'EADDRINUSE'
        ? `Le port ${port} est déjà utilisé. Ferme le programme qui l'occupe, ou choisis-en un autre ` +
          `avec "upload": { "oauthPort": 4568 } dans config.local.json.`
        : e.message
));
serveur.listen(port, () => console.error(`En attente de l'autorisation sur http://localhost:${port} (10 min max)…`));
setTimeout(() => { serveur.close(); echec('AUTH_TIMEOUT — délai de 10 minutes dépassé, relance la commande.'); }, 600000);
