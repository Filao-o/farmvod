'use strict';

/**
 * Pont banques → projet. Deux modes :
 *
 *   node outils/composer-projet.js <projet> [--niche <n>] [--chaine <c>] [--dry]
 *     Remplit un projet.json EXISTANT : pioche titre + set de chapitres + tags
 *     dans la niche et les écrit. niche/chaîne lues depuis projet.json si absentes.
 *
 *   node outils/composer-projet.js --nouveau [<nom>] [--chaine <c>] [--dry]
 *     CRÉE un projet neuf à partir du template de chaîne
 *     (presets/chaines/<chaine>.json) + la pioche. Sans <nom> → <chaine>-AAAA-MM-JJ.
 *     Sans --chaine → "chaineDefaut" de config.local.json, sinon de config.json.
 *     Crée le dossier projets/<nom>/ et son sous-dossier audio/, puis rappelle
 *     les assets à déposer (background.jpg + pistes audio).
 *
 * Par défaut, écrit ET verrouille l'usage de la chaîne (anti-répétition). `--dry`
 * prévisualise sans rien écrire ni consommer. Le résultat est prêt pour le
 * pipeline (rendu complet ou `index.js --projet <nom> --meta-only`).
 */

const fs = require('fs');
const path = require('path');
const { composerSession } = require('../src/banques');
const { loadGlobal } = require('../src/config');

const RACINE = path.resolve(__dirname, '..');

// Chaîne par défaut = un réglage, pas une constante du code : "chaineDefaut"
// dans config.local.json (personnel, hors git), sinon dans config.json.
function chaineDefaut() {
    const c = loadGlobal(RACINE).chaineDefaut;
    if (!c) throw new Error('Aucune chaîne : passe --chaine <c> ou règle "chaineDefaut" dans config.local.json.');
    return c;
}

function arg(argv, flag) {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
}

// Nom par défaut d'un projet neuf : <chaine>-AAAA-MM-JJ (date locale).
function nomDate(chaine) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${chaine}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function cheminTemplate(chaine) {
    return path.join(RACINE, 'presets', 'chaines', `${chaine}.json`);
}

// Charge le template de chaîne et enlève les clés de documentation (_comment).
function chargerTemplate(chaine) {
    const f = cheminTemplate(chaine);
    if (!fs.existsSync(f)) {
        const dispo = fs.existsSync(path.join(RACINE, 'presets', 'chaines'))
            ? fs.readdirSync(path.join(RACINE, 'presets', 'chaines')).filter((x) => x.endsWith('.json')).map((x) => x.replace(/\.json$/, ''))
            : [];
        throw new Error(
            `Template de chaîne absent : ${f}\n` +
            `  Chaînes dispo : ${dispo.join(', ') || '(aucune)'}.\n` +
            `  Passe --chaine <c>, ou règle "chaineDefaut" dans config.local.json.\n` +
            `  Pour créer la tienne : copie presets/chaines/exemple.json.`
        );
    }
    const t = JSON.parse(fs.readFileSync(f, 'utf-8'));
    delete t._comment;
    return t;
}

// Applique la pioche (titre/chapitres/tags + trace) sur un objet projet.
function appliquerPioche(projet, s) {
    projet.niche = s.niche;
    projet.chaine = s.chaine;
    projet.metadata = projet.metadata || {};
    projet.metadata.titre = s.titre.texte;
    projet.metadata.chapitres = s.chapitres;
    projet.metadata.tags = s.tags;
    projet.banque = {
        niche: s.niche, chaine: s.chaine,
        titreId: s.titre.id, setId: s.set.id,
        date: new Date().toISOString(),
    };
    return projet;
}

function afficherComposition(s, dry) {
    console.log(`\n── Composition ${dry ? '(DRY — rien écrit)' : ''} ──`);
    console.log('Niche  :', s.niche, '· chaîne :', s.chaine);
    console.log('Titre  :', `${s.titre.texte}  [${s.titre.id}]`);
    console.log('Set    :', `${s.set.theme}  [${s.set.id}]`);
    console.log('Chaps  :', s.chapitres.join(' · '));
    console.log('Tags   :', s.tags.length);
}

// --- Mode 1 : créer un projet NEUF depuis le template de chaîne -------------
function modeNouveau(argv, dry) {
    const chaine = arg(argv, '--chaine') || chaineDefaut();
    // <nom> = premier argument positionnel après --nouveau, sinon daté.
    const apresNouveau = argv[argv.indexOf('--nouveau') + 1];
    const nomDonne = apresNouveau && !apresNouveau.startsWith('--') ? apresNouveau : null;
    const nom = nomDonne || nomDate(chaine);

    const template = chargerTemplate(chaine);
    const niche = arg(argv, '--niche') || template.niche;
    if (!niche) throw new Error('Niche absente du template : passe --niche <n>.');

    const dossierProjet = path.join(RACINE, 'projets', nom);
    const fichierProjet = path.join(dossierProjet, 'projet.json');
    if (fs.existsSync(fichierProjet) && !dry) {
        throw new Error(`Le projet existe déjà : ${path.relative(RACINE, fichierProjet)}\n  (mode remplissage : enlève --nouveau)`);
    }

    const s = composerSession({ niche, chaine, commit: !dry });
    const projet = appliquerPioche(JSON.parse(JSON.stringify(template)), s);

    console.log(`\n── Nouveau projet : ${nom} ${dry ? '(DRY — rien créé)' : ''} ──`);
    afficherComposition(s, dry);

    if (dry) {
        console.log('\n(aperçu — aucun dossier créé, usage non consommé)\n');
        return;
    }

    fs.mkdirSync(path.join(dossierProjet, 'audio'), { recursive: true });
    fs.writeFileSync(fichierProjet, JSON.stringify(projet, null, 2), 'utf-8');

    const bg = fs.existsSync(path.join(dossierProjet, 'background.jpg'));
    console.log(`\n✔ Projet créé : ${path.relative(RACINE, dossierProjet)}/ · usage verrouillé.`);
    console.log('  À déposer avant le rendu :');
    console.log(`    • ${nom}/background.jpg   ${bg ? '(présent)' : '(MANQUANT)'}`);
    console.log(`    • ${nom}/audio/*.mp3       (${s.chapitres.length} pistes, dans l'ordre des chapitres : 01-…, 02-…)`);
    console.log(`  Puis : node index.js --projet ${nom} --test 30   (test), puis sans --test.\n`);
}

// --- Mode 2 : remplir un projet.json EXISTANT -------------------------------
function modeRemplir(argv, dry) {
    const projetNom = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--niche' && argv[i - 1] !== '--chaine');
    if (!projetNom) {
        console.error('Usage : node outils/composer-projet.js <projet> [--niche <n>] [--chaine <c>] [--dry]');
        console.error('   ou : node outils/composer-projet.js --nouveau [<nom>] [--chaine <c>] [--dry]');
        process.exit(1);
    }

    const fichierProjet = path.join(RACINE, 'projets', projetNom, 'projet.json');
    if (!fs.existsSync(fichierProjet)) {
        console.error(`projet.json introuvable : ${fichierProjet}\n  (pour en créer un : --nouveau ${projetNom})`);
        process.exit(1);
    }

    const projet = JSON.parse(fs.readFileSync(fichierProjet, 'utf-8'));
    const niche = arg(argv, '--niche') || projet.niche;
    const chaine = arg(argv, '--chaine') || projet.chaine;
    if (!niche) {
        console.error('Niche absente : passe --niche <n> ou ajoute "niche" dans projet.json.');
        process.exit(1);
    }

    const s = composerSession({ niche, chaine, commit: !dry });
    afficherComposition(s, dry);

    if (dry) {
        console.log('\n(aperçu — projet.json inchangé, usage non consommé)\n');
        return;
    }

    appliquerPioche(projet, s);
    fs.writeFileSync(fichierProjet, JSON.stringify(projet, null, 2), 'utf-8');
    console.log(`\n✔ Écrit dans ${path.relative(RACINE, fichierProjet)} · usage verrouillé.`);
    console.log(`  → node index.js --projet ${projetNom} --meta-only   (régénère la description sans ré-encoder)\n`);
}

function main() {
    const argv = process.argv.slice(2);
    const dry = argv.includes('--dry') || argv.includes('--dry-run');
    try {
        if (argv.includes('--nouveau')) modeNouveau(argv, dry);
        else modeRemplir(argv, dry);
    } catch (e) {
        console.error('Erreur :', e.message);
        process.exit(1);
    }
}

main();
