'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------
// Journalisation
// ------------------------------------------------------------------
const log = {
    info: (msg) => console.log(`   ${msg}`),
    step: (msg) => console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`),
    ok: (msg) => console.log(`\x1b[32m   ✔ ${msg}\x1b[0m`),
    warn: (msg) => console.log(`\x1b[33m   ⚠ ${msg}\x1b[0m`),
    err: (msg) => console.error(`\x1b[31m   ✘ ${msg}\x1b[0m`),
    cache: (msg) => console.log(`\x1b[90m   ↺ ${msg} (cache)\x1b[0m`),
};

// ------------------------------------------------------------------
// Exécution FFmpeg / FFprobe
//
// On appelle les binaires directement via spawn plutôt que de passer
// par fluent-ffmpeg : moins de dépendances, et surtout un contrôle
// exact des arguments (fluent-ffmpeg découpe mal certaines options,
// c'est ce qui cassait "-stream_loop -1" dans le script d'origine).
// ------------------------------------------------------------------
function run(bin, args, { onStderr } = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(bin, args, { windowsHide: true });
        let stdout = '';
        let stderrTail = '';

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => {
            const chunk = d.toString();
            stderrTail = (stderrTail + chunk).slice(-16000);
            if (onStderr) onStderr(chunk);
        });

        proc.on('error', (e) => {
            if (e.code === 'ENOENT') {
                reject(new Error(
                    `Binaire "${bin}" introuvable. Vérifie que FFmpeg est installé ` +
                    `et présent dans le PATH Windows (teste : ffmpeg -version).`
                ));
            } else {
                reject(e);
            }
        });

        proc.on('close', (code) => {
            if (code === 0) resolve({ stdout, stderr: stderrTail });
            else reject(new Error(`${bin} a quitté avec le code ${code}\n\n${stderrTail.slice(-3000)}`));
        });
    });
}

const ffmpeg = (args, opts) => run('ffmpeg', ['-hide_banner', '-nostdin', ...args], opts);
const ffprobe = (args) => run('ffprobe', ['-hide_banner', ...args]);

async function checkTools() {
    await run('ffmpeg', ['-version']);
    await run('ffprobe', ['-version']);
}

async function duration(file) {
    const { stdout } = await ffprobe([
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        file,
    ]);
    const d = parseFloat(stdout.trim());
    if (!isFinite(d)) throw new Error(`Durée illisible pour ${file}`);
    return d;
}

// Affiche une progression lisible à partir du flux stderr de FFmpeg.
function progressReporter(label, totalSeconds) {
    let last = 0;
    return (chunk) => {
        const m = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(chunk);
        if (!m) return;
        const secs = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
        if (secs - last < 5) return;
        last = secs;
        const pct = totalSeconds ? ` (${Math.min(100, (secs / totalSeconds) * 100).toFixed(1)} %)` : '';
        process.stdout.write(`\r   ${label} : ${hms(secs)}${pct}      `);
    };
}

// ------------------------------------------------------------------
// Temps
// ------------------------------------------------------------------
function hms(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Format attendu par YouTube pour les chapitres : MM:SS sous une heure,
// H:MM:SS au-delà. "0:00:18" n'est pas reconnu de façon fiable.
function horodatageYoutube(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${sec}`
        : `${m}:${sec}`;
}

// ------------------------------------------------------------------
// Tri naturel : piste2 avant piste10 (readdirSync trie en ASCII et
// produisait l'inverse dans le script d'origine).
// ------------------------------------------------------------------
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const naturalSort = (a, b) => collator.compare(a, b);

// ------------------------------------------------------------------
// Aléatoire déterministe : la même graine redonne exactement le même
// ordre, donc la même vidéo. Indispensable pour reproduire un bug.
// ------------------------------------------------------------------
function seededRandom(seed) {
    let h = 1779033703 ^ String(seed).length;
    for (let i = 0; i < String(seed).length; i++) {
        h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(array, rng) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// Deux garde-fous à la jonction entre deux passages de la playlist :
//   - une piste ne doit pas s'enchaîner sur elle-même ;
//   - un passage ne doit pas reproduire exactement l'ordre du précédent
//     (avec peu de pistes, le hasard le fait sinon assez souvent).
function shuffleNoAdjacentRepeat(array, rng, previous) {
    if (array.length < 2) return array.slice();
    const precedent = previous || [];
    const dernier = precedent[precedent.length - 1];
    const signature = precedent.join('|');

    for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = shuffle(array, rng);
        const memeOrdre = candidate.map((x) => (x && x.titre) || x).join('|')
            === precedent.map((x) => (x && x.titre) || x).join('|');
        if (candidate[0] !== dernier && !memeOrdre && signature !== '') return candidate;
        if (signature === '' && candidate[0] !== dernier) return candidate;
    }
    return shuffle(array, rng);
}

// ------------------------------------------------------------------
// Cache : une piste déjà normalisée n'est jamais retraitée.
// La clé dépend du contenu du fichier (taille + date) et des
// paramètres de traitement : si tu changes le LUFS cible, le cache
// s'invalide tout seul.
// ------------------------------------------------------------------
function cacheKey(filePath, params) {
    const st = fs.statSync(filePath);
    const raw = [path.basename(filePath), st.size, Math.floor(st.mtimeMs), JSON.stringify(params)].join('|');
    return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function bytesToMo(n) {
    return (n / (1024 * 1024)).toFixed(0);
}

module.exports = {
    log, ffmpeg, ffprobe, checkTools, duration, progressReporter,
    hms, horodatageYoutube, naturalSort, seededRandom, shuffle, shuffleNoAdjacentRepeat,
    cacheKey, ensureDir, bytesToMo,
};
