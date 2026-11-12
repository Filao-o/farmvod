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

// Deux scopes, les mêmes que outils/auth-youtube.js : "upload" pour déposer la
// vidéo, "youtube" pour lire le statut de la chaîne (garde-fou vidéo longue),
// ajouter à une playlist et éditer une vidéo déjà en ligne (--update).
const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
];
const PORT_DEFAUT = 4567;
const SEUIL_UPLOAD_LONG = 15 * 60;   // >15 min ⇒ chaîne vérifiée par téléphone requise.

// L'app OAuth est en mode "Test" : le refresh token expire ~7 jours. Quand
// c'est le cas, l'API renvoie "invalid_grant". On le détecte pour afficher
// une consigne claire plutôt qu'une stack obscure.
function estTokenExpire(e) {
    const m = (e && e.message) || '';
    return /invalid_grant|Token has been expired or revoked|invalid_request/i.test(m);
}

function estScopeInsuffisant(e) {
    const m = (e && e.message) || '';
    return /insufficient (permission|authentication scopes)/i.test(m);
}

function erreurScope() {
    return new Error(
        "L'autorisation YouTube enregistrée n'a pas tous les droits nécessaires\n" +
        "   (lecture du statut de la chaîne, playlist, édition).\n" +
        "   Relance :  node outils/auth-youtube.js  puis recommence."
    );
}

function erreurReauth() {
    return new Error(
        "Autorisation YouTube expirée (app OAuth en mode Test → token ~7 jours).\n" +
        "   Relance :  node outils/auth-youtube.js  (ré-autorise, puis relance l'upload).\n" +
        "   Définitif : publier l'app en Production supprime cette limite des 7 jours."
    );
}

// Garde-fou vidéo longue : YouTube "abandonne le traitement" d'une vidéo >15 min
// si la chaîne n'est pas vérifiée par téléphone. On vérifie AVANT d'envoyer
// 500 Mo pour rien. Au passage, cet appel révèle un token expiré.
async function verifierUploadLong(youtube, dureeSecondes) {
    let statut;
    try {
        const r = await youtube.channels.list({ part: ['status'], mine: true });
        statut = r.data.items && r.data.items[0] && r.data.items[0].status;
    } catch (e) {
        if (estTokenExpire(e)) throw erreurReauth();
        // Sans le droit de lecture, impossible de savoir si la chaîne accepte
        // les vidéos longues : on refuse d'envoyer à l'aveugle plutôt que de
        // risquer une vidéo "traitement abandonné".
        if (estScopeInsuffisant(e) && dureeSecondes > SEUIL_UPLOAD_LONG) throw erreurScope();
        log.warn(`Statut de chaîne non vérifiable (${e.message.split('\n')[0]}) — on tente quand même.`);
        return;
    }
    if (!dureeSecondes || dureeSecondes <= SEUIL_UPLOAD_LONG) return;   // court : rien à vérifier.

    const lu = statut && statut.longUploadsStatus;
    if (lu !== 'allowed') {
        throw new Error(
            `Upload long bloqué : vidéo de ${Math.round(dureeSecondes / 60)} min (>15 min), ` +
            `mais longUploadsStatus = "${lu || 'inconnu'}" (requis : "allowed").\n` +
            `   YouTube abandonnerait le traitement et la vidéo serait morte.\n` +
            `   Vérifie ta chaîne par téléphone : https://www.youtube.com/verify , puis réessaie.`
        );
    }
    log.ok('Chaîne vérifiée (longUploadsStatus = allowed) — upload long autorisé.');
}

// Trace locale de l'ID de la vidéo publiée, pour pouvoir la ré-éditer en place
// plus tard (--meta-only --update) sans avoir à retrouver l'ID à la main.
function ecrireYoutubeJson(cfg, id) {
    try {
        fs.writeFileSync(
            path.join(cfg.dossierSortie, 'youtube.json'),
            JSON.stringify({ videoId: id, url: `https://youtu.be/${id}`, maj: new Date().toISOString() }, null, 2),
            'utf-8',
        );
    } catch (e) { /* non bloquant : simple trace */ }
}

function chargerGoogleapis() {
    try {
        return require('googleapis');
    } catch (e) {
        throw new Error(
            'Module "googleapis" absent : les dépendances ne sont pas installées.\n' +
            '   Lance  npm install  dans le dossier du projet, puis recommence.'
        );
    }
}

function portOAuth(cfg) {
    const p = parseInt(cfg && cfg.upload && cfg.upload.oauthPort, 10);
    return Number.isInteger(p) && p > 0 && p < 65536 ? p : PORT_DEFAUT;
}

function cheminsCredentials(racine) {
    return {
        fichierSecret: path.join(racine, 'credentials', 'client_secret.json'),
        fichierToken: path.join(racine, 'credentials', 'token.json'),
    };
}

// Lit credentials/client_secret.json. Absent ou illisible → message qui dit
// quoi faire (chacun crée SES identifiants Google Cloud, rien n'est fourni).
function chargerSecretOAuth(racine, port = PORT_DEFAUT) {
    const { fichierSecret } = cheminsCredentials(racine);
    if (!fs.existsSync(fichierSecret)) {
        throw new Error(
            `Identifiants Google absents : il faut créer les tiens (gratuit, une seule fois).\n` +
            `   1. https://console.cloud.google.com → nouveau projet → active "YouTube Data API v3"\n` +
            `   2. Écran de consentement OAuth : type "Externe", ajoute ton compte Google en utilisateur test\n` +
            `   3. Identifiants → Créer → ID client OAuth → type "Application de bureau"\n` +
            `      (type "Application Web" : ajoute l'URI de redirection http://localhost:${port})\n` +
            `   4. Télécharge le JSON et enregistre-le ici : ${fichierSecret}\n` +
            `   Détail pas à pas : README.md, section « Upload YouTube ».`
        );
    }
    let secret;
    try {
        secret = JSON.parse(fs.readFileSync(fichierSecret, 'utf-8'));
    } catch (e) {
        throw new Error(`${fichierSecret} n'est pas un JSON valide — re-télécharge-le depuis Google Cloud Console.`);
    }
    const conf = secret.installed || secret.web;
    if (!conf || !conf.client_id || !conf.client_secret) {
        throw new Error(
            `${fichierSecret} n'est pas un fichier "ID client OAuth" (client_id / client_secret absents).\n` +
            `   Dans Google Cloud Console → Identifiants, télécharge le JSON de l'ID client OAuth\n` +
            `   (pas une clé API, pas un compte de service).`
        );
    }
    return conf;
}

async function obtenirClient(racine, port = PORT_DEFAUT) {
    const { google } = chargerGoogleapis();
    const { fichierToken } = cheminsCredentials(racine);

    const conf = chargerSecretOAuth(racine, port);
    const client = new google.auth.OAuth2(
        conf.client_id, conf.client_secret, `http://localhost:${port}`,
    );

    if (fs.existsSync(fichierToken)) {
        try {
            client.setCredentials(JSON.parse(fs.readFileSync(fichierToken, 'utf-8')));
        } catch (e) {
            throw new Error(`${fichierToken} est illisible — supprime-le puis relance  node outils/auth-youtube.js`);
        }
        return client;
    }

    // Première connexion : ouverture du navigateur, retour sur localhost.
    const url = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
    log.info('Autorisation requise. Ouvre cette adresse dans ton navigateur :');
    console.log(`\n${url}\n`);

    const code = await new Promise((resolve, reject) => {
        const serveur = http.createServer((req, res) => {
            const params = new URL(req.url, `http://localhost:${port}`).searchParams;
            const c = params.get('code');
            res.end(c ? 'Autorisation reçue. Tu peux fermer cet onglet.' : 'Aucun code reçu.');
            serveur.close();
            c ? resolve(c) : reject(new Error('Autorisation refusée.'));
        });
        serveur.on('error', (e) => reject(new Error(
            e.code === 'EADDRINUSE'
                ? `Le port ${port} est déjà utilisé sur cette machine. Ferme le programme qui l'occupe, ` +
                  `ou choisis-en un autre avec "upload": { "oauthPort": 4568 } dans config.local.json.`
                : `Serveur local d'autorisation : ${e.message}`
        )));
        serveur.listen(port);
        setTimeout(() => { serveur.close(); reject(new Error('Délai d\'autorisation dépassé.')); }, 300000).unref();
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
    const auth = await obtenirClient(cfg.racine, portOAuth(cfg));
    const youtube = google.youtube({ version: 'v3', auth });

    // Garde-fou AVANT d'envoyer le fichier (et détecte un token expiré).
    await verifierUploadLong(youtube, video.duree);

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
                    defaultLanguage: cfg.metadata.langue || 'en',
                    defaultAudioLanguage: cfg.metadata.langue || 'en',
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
    ecrireYoutubeJson(cfg, id);

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

/**
 * Met à jour les métadonnées d'une vidéo DÉJÀ publiée (titre, description,
 * chapitres, tags, langue) sans la ré-uploader. Utile pour corriger un
 * libellé de chapitre ou une description après coup : on ne touche ni au
 * fichier, ni à la confidentialité, ni aux vues. videos.update réanalyse
 * aussi les chapitres dans la foulée.
 *
 * ⚠️ Action sortante : modifie une vidéo en ligne. L'appelant (index.js)
 * ne déclenche cette fonction que sur demande explicite (--update).
 */
async function mettreAJourMeta(cfg, videoId, meta) {
    log.step(`Étape 6/6 — Mise à jour de la vidéo publiée (${videoId})`);

    const { google } = chargerGoogleapis();
    const auth = await obtenirClient(cfg.racine, portOAuth(cfg));
    const youtube = google.youtube({ version: 'v3', auth });

    // On lit le snippet courant pour ne rien écraser qu'on ne gère pas.
    let actuel;
    try {
        actuel = await youtube.videos.list({ part: ['snippet'], id: [videoId] });
    } catch (e) {
        if (estTokenExpire(e)) throw erreurReauth();
        if (estScopeInsuffisant(e)) throw erreurScope();
        throw e;
    }
    if (!actuel.data.items || actuel.data.items.length === 0) {
        throw new Error(
            `Vidéo introuvable ou non accessible avec ce compte : ${videoId}. ` +
            `Vérifie l'ID (et que c'est bien ta chaîne).`
        );
    }
    const s = actuel.data.items[0].snippet;
    const tags = (cfg.metadata.tags && cfg.metadata.tags.length ? cfg.metadata.tags : (s.tags || []));

    await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
            id: videoId,
            snippet: {
                title: (cfg.metadata.titre || s.title).slice(0, 100),
                description: meta.description.slice(0, 5000),
                tags: tags.slice(0, 30),
                categoryId: cfg.upload.categorieId || s.categoryId,   // requis par l'API
                defaultLanguage: cfg.metadata.langue || s.defaultLanguage || 'en',
                defaultAudioLanguage: cfg.metadata.langue || s.defaultAudioLanguage || 'en',
            },
        },
    });

    ecrireYoutubeJson(cfg, videoId);
    log.ok('Vidéo en ligne mise à jour (titre, description, chapitres, tags) — fichier et vues intacts.');
    log.info(`https://studio.youtube.com/video/${videoId}/edit`);
    return { id: videoId, url: `https://youtu.be/${videoId}` };
}

module.exports = {
    televerser, mettreAJourMeta,
    // Partagés avec outils/auth-youtube.js (une seule définition des droits,
    // des chemins et des messages d'erreur).
    SCOPES, PORT_DEFAUT, portOAuth, cheminsCredentials, chargerSecretOAuth, chargerGoogleapis,
};
