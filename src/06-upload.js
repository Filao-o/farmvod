'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { log, bytesToMo } = require('./utils');

/**
 * Upload vers YouTube via l'API Data v3.
 *
 * Choix volontaire : la confidentialité est FIGÉE sur "private".
 * Le script dépose la vidéo, remplit titre, description, chapitres,
 * tags et miniature — puis s'arrête là. La publication reste un geste
 * humain.
 *
 * Ce n'est pas de la prudence excessive : une chaîne qui publie en
 * série sans aucun contrôle correspond exactement au profil que
 * YouTube identifie comme contenu de masse à faible valeur ajoutée.
 * Le coût d'une écoute en accéléré est de quelques minutes ; celui
 * d'une démonétisation est votre chaîne entière.
 */

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const PORT = 4567;

function chargerGoogleapis() {
    try {
        return require('googleapis');
    } catch (e) {
        throw new Error(
            'Module "googleapis" absent. Installe-le avec :  npm install googleapis'
        );
    }
}

async function obtenirClient(racine) {
    const { google } = chargerGoogleapis();

    const fichierSecret = path.join(racine, 'credentials', 'client_secret.json');
    const fichierToken = path.join(racine, 'credentials', 'token.json');

    if (!fs.existsSync(fichierSecret)) {
        throw new Error(
            `Identifiants OAuth absents.\n` +
            `   1. Google Cloud Console → nouveau projet → active "YouTube Data API v3"\n` +
            `   2. Identifiants → ID client OAuth → type "Application de bureau"\n` +
            `   3. URI de redirection autorisé : http://localhost:${PORT}\n` +
            `   4. Télécharge le JSON dans : ${fichierSecret}`
        );
    }

    const secret = JSON.parse(fs.readFileSync(fichierSecret, 'utf-8'));
    const conf = secret.installed || secret.web;
    const client = new google.auth.OAuth2(
        conf.client_id, conf.client_secret, `http://localhost:${PORT}`,
    );

    if (fs.existsSync(fichierToken)) {
        client.setCredentials(JSON.parse(fs.readFileSync(fichierToken, 'utf-8')));
        return client;
    }

    // Première connexion : ouverture du navigateur, retour sur localhost.
    const url = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
    log.info('Autorisation requise. Ouvre cette adresse dans ton navigateur :');
    console.log(`\n${url}\n`);

    const code = await new Promise((resolve, reject) => {
        const serveur = http.createServer((req, res) => {
            const params = new URL(req.url, `http://localhost:${PORT}`).searchParams;
            const c = params.get('code');
            res.end(c ? 'Autorisation reçue. Tu peux fermer cet onglet.' : 'Aucun code reçu.');
            serveur.close();
            c ? resolve(c) : reject(new Error('Autorisation refusée.'));
        });
        serveur.listen(PORT);
        setTimeout(() => { serveur.close(); reject(new Error('Délai d\'autorisation dépassé.')); }, 300000);
    });

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    fs.mkdirSync(path.dirname(fichierToken), { recursive: true });
    fs.writeFileSync(fichierToken, JSON.stringify(tokens, null, 2), 'utf-8');
    log.ok('Autorisation enregistrée (token.json) — plus besoin de recommencer.');

    return client;
}

async function televerser(cfg, video, meta) {
    log.step('Étape 6/6 — Envoi vers YouTube (mode privé)');

    const { google } = chargerGoogleapis();
    const auth = await obtenirClient(cfg.racine);
    const youtube = google.youtube({ version: 'v3', auth });

    const taille = fs.statSync(video.fichier).size;
    log.info(`Envoi de ${bytesToMo(taille)} Mo — cela peut prendre un moment.`);

    let dernierPourcentage = 0;
    const reponse = await youtube.videos.insert(
        {
            part: ['snippet', 'status'],
            requestBody: {
                snippet: {
                    title: cfg.metadata.titre.slice(0, 100),
                    description: meta.description.slice(0, 5000),
                    tags: cfg.metadata.tags.slice(0, 30),
                    categoryId: cfg.upload.categorieId,
                },
                status: {
                    privacyStatus: 'private',        // Non configurable, à dessein.
                    selfDeclaredMadeForKids: false,
                },
            },
            media: { body: fs.createReadStream(video.fichier) },
        },
        {
            onUploadProgress: (evt) => {
                const pct = Math.round((evt.bytesRead / taille) * 100);
                if (pct >= dernierPourcentage + 5) {
                    dernierPourcentage = pct;
                    process.stdout.write(`\r   Envoi : ${pct} %      `);
                }
            },
        },
    );
    process.stdout.write('\n');

    const id = reponse.data.id;

    // Miniature (nécessite une chaîne vérifiée).
    const miniature = path.join(cfg.dossierSortie, 'miniature.jpg');
    if (fs.existsSync(miniature)) {
        try {
            await youtube.thumbnails.set({ videoId: id, media: { body: fs.createReadStream(miniature) } });
            log.info('Miniature envoyée.');
        } catch (e) {
            log.warn('Miniature refusée (chaîne non vérifiée ?) — à mettre manuellement.');
        }
    }

    if (cfg.upload.playlistId) {
        try {
            await youtube.playlistItems.insert({
                part: ['snippet'],
                requestBody: {
                    snippet: {
                        playlistId: cfg.upload.playlistId,
                        resourceId: { kind: 'youtube#video', videoId: id },
                    },
                },
            });
            log.info('Ajoutée à la playlist.');
        } catch (e) {
            log.warn(`Ajout playlist échoué : ${e.message}`);
        }
    }

    log.ok('Vidéo déposée en PRIVÉ sur ta chaîne.');
    log.info(`https://studio.youtube.com/video/${id}/edit`);
    log.info('Écoute-la en accéléré, vérifie les jonctions, puis publie à la main.');

    return { id, url: `https://youtu.be/${id}` };
}

module.exports = { televerser };
