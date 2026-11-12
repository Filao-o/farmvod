'use strict';

/**
 * Banques de copywriting par niche + pioche avec anti-répétition.
 *
 * Principe : CONTENU ≠ USAGE.
 *   - Le contenu vit dans `presets/banques/<niche>.json` (titres, sets de
 *     chapitres, keywords, chacun avec un id stable). Il n'est jamais modifié
 *     par la pioche : une niche peut servir plusieurs chaînes.
 *   - L'usage (ids déjà consommés) vit à part, PAR CHAÎNE, dans
 *     `.cache/usage/<chaine>.json`. Un titre utilisé n'est pas retiré de la
 *     banque, juste marqué consommé pour cette chaîne. Reset = supprimer le
 *     fichier d'usage. Rien ne nous ampute plus tard.
 *
 * La génération de nouveaux items (enrichissement) est faite par Claude
 * hors-ligne (jugement éditorial) — voir presets/banques/README.md. Ici, c'est
 * uniquement de la pioche déterministe-mais-aléatoire.
 */

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const DOSSIER_BANQUES = path.join(RACINE, 'presets', 'banques');
const DOSSIER_USAGE = path.join(RACINE, '.cache', 'usage');

// Ordre des presets Suno dans une session : montée d'énergie.
const ORDRE_PRESETS = ['deep-house-warmup', 'organic-deep-house-engine', 'dark-deep-house-lockin'];
const PISTES_PAR_STYLE_DEFAUT = 4; // 3 styles × 4 = 12 pistes = 12 chapitres.

function lireJson(f) {
    return JSON.parse(fs.readFileSync(f, 'utf-8'));
}

// --- Contenu : banque d'une niche ------------------------------------------
function cheminNiche(niche) {
    return path.join(DOSSIER_BANQUES, `${niche}.json`);
}

function chargerNiche(niche) {
    const f = cheminNiche(niche);
    if (!fs.existsSync(f)) {
        const dispo = fs.existsSync(DOSSIER_BANQUES)
            ? fs.readdirSync(DOSSIER_BANQUES).filter((x) => x.endsWith('.json')).map((x) => x.replace(/\.json$/, ''))
            : [];
        throw new Error(`Niche inconnue : « ${niche} ». Disponibles : ${dispo.join(', ') || '(aucune)'}.`);
    }
    const b = lireJson(f);
    b.titres = b.titres || [];
    b.setsChapitres = b.setsChapitres || [];
    b.keywords = b.keywords || [];
    return b;
}

// --- Usage : état par chaîne -----------------------------------------------
function cheminUsage(chaine) {
    return path.join(DOSSIER_USAGE, `${chaine}.json`);
}

function chargerUsage(chaine) {
    try {
        const u = lireJson(cheminUsage(chaine));
        return { chaine, titres: u.titres || [], sets: u.sets || [] };
    } catch (e) {
        return { chaine, titres: [], sets: [] };
    }
}

function sauverUsage(usage) {
    fs.mkdirSync(DOSSIER_USAGE, { recursive: true });
    fs.writeFileSync(cheminUsage(usage.chaine), JSON.stringify(usage, null, 2), 'utf-8');
}

// Pioche un item hors de ceux déjà consommés ; banque épuisée → on recycle.
// `items` : [{id, ...}]. `utilises` : [id]. Retourne {choix, utilises} à jour.
function piocher(items, utilises) {
    if (!items.length) throw new Error('Banque vide : enrichis-la avant de piocher.');
    let dispo = items.filter((x) => !utilises.includes(x.id));
    let base = utilises;
    if (dispo.length === 0) {         // tout consommé → on repart à zéro
        base = [];
        dispo = items.slice();
    }
    const choix = dispo[Math.floor(Math.random() * dispo.length)];
    return { choix, utilises: [...base, choix.id] };
}

function piocherTitre(banque, usage) {
    const r = piocher(banque.titres, usage.titres);
    usage.titres = r.utilises;
    return r.choix;                    // {id, texte}
}

function piocherSet(banque, usage) {
    const r = piocher(banque.setsChapitres, usage.sets);
    usage.sets = r.utilises;
    return r.choix;                    // {id, theme, chapitres}
}

// Tags SEO : on veut un set stable (pas de rotation), donc pas d'anti-répétition.
function keywords(banque, max = 30) {
    return banque.keywords.map((k) => k.texte).slice(0, max);
}

// Construit le plan de génération Suno : 12 entrées {preset, style, chapitre, fichier}.
function planSession(set, { parStyle = PISTES_PAR_STYLE_DEFAUT } = {}) {
    const { presets } = lireJson(path.join(RACINE, 'presets', 'musique.json'));
    const total = ORDRE_PRESETS.length * parStyle;
    const chapitres = set && set.chapitres;
    if (!Array.isArray(chapitres) || chapitres.length < total) {
        throw new Error(`Le set « ${set && set.theme} » doit avoir ≥ ${total} chapitres (a ${chapitres && chapitres.length}).`);
    }

    const plan = [];
    let i = 0;
    for (const cle of ORDRE_PRESETS) {
        const p = presets[cle];
        if (!p) throw new Error(`Preset absent de musique.json : ${cle}`);
        for (let n = 0; n < parStyle; n++) {
            const chapitre = chapitres[i];
            plan.push({
                index: i + 1,
                preset: cle,
                style: p.style,
                bpm: p.bpm,
                duree: p.duree,
                variety: p.variety,
                instrumental: p.instrumental,
                chapitre,
                fichier: `${String(i + 1).padStart(2, '0')}-${chapitre}.mp3`,
            });
            i++;
        }
    }
    return plan;
}

/**
 * Compose une session pour une chaîne : pioche titre + set (+ tags) dans la
 * niche, en respectant l'anti-répétition propre à la chaîne.
 *   commit=false → aperçu, rien écrit (répétable).
 *   commit=true  → verrouille les tirages dans l'usage de la chaîne.
 */
function composerSession({ niche, chaine, commit = false, parStyle = PISTES_PAR_STYLE_DEFAUT } = {}) {
    if (!niche) throw new Error('niche requise.');
    const banque = chargerNiche(niche);
    const chaineFinale = chaine || (banque.chaines && banque.chaines[0]) || niche;
    const usage = chargerUsage(chaineFinale);

    const titre = piocherTitre(banque, usage);
    const set = piocherSet(banque, usage);
    const tags = keywords(banque);
    const chapitres = set.chapitres;   // ordre pass-1 pour projet.json

    if (commit) sauverUsage(usage);

    return { niche, chaine: chaineFinale, titre, set, chapitres, tags, commit };
}

module.exports = {
    chargerNiche,
    chargerUsage,
    sauverUsage,
    piocher,
    piocherTitre,
    piocherSet,
    keywords,
    planSession,
    composerSession,
    ORDRE_PRESETS,
};

// CLI : aperçu d'une pioche.
//   node src/banques.js --niche focus-productivite [--chaine lucidityfm] [--commit]
if (require.main === module) {
    const argv = process.argv.slice(2);
    const val = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
    const niche = val('--niche') || 'focus-productivite';
    const chaine = val('--chaine');
    const commit = argv.includes('--commit');

    const s = composerSession({ niche, chaine, commit });
    console.log('Niche  :', s.niche, '· chaîne :', s.chaine);
    console.log('Titre  :', `${s.titre.texte}  [${s.titre.id}]`);
    console.log('Set    :', `${s.set.theme}  [${s.set.id}]`);
    console.log('Chaps  :', s.chapitres.join(' · '));
    console.log('Tags   :', s.tags.length, 'tags');
    console.log(commit ? '(usage verrouillé dans .cache/usage/' + s.chaine + '.json)' : '(aperçu — rien écrit ; --commit pour verrouiller)');
}
