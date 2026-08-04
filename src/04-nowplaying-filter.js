'use strict';

// -----------------------------------------------------------------
// Génère le filter graph FFmpeg — design "vignette + citation".
//
// Un seul background (la vignette YouTube), pas de pochettes par piste.
// Éléments : fond fixe, citation rotative, barre arrondie globale,
// temps écoulé / restant.
// -----------------------------------------------------------------

function escapeDrawtext(s) {
    return String(s || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "’")
        .replace(/:/g, '\\:')
        .replace(/%/g, '\\%')
        .replace(/\n/g, ' ');
}

function construireFiltreNowPlaying(cfg, dureeTotale, citations) {
    const W = cfg.video.upscaleTo4k ? 3840 : 1920;
    const H = cfg.video.upscaleTo4k ? 2160 : 1080;
    const fps = cfg.video.fps;
    const echelle = W / 1920;

    const np = cfg.nowplaying;
    const typo = np.typographie;
    const parts = [];

    const tailleCite = Math.round(typo.taille_citation * echelle);
    const tailleAuteur = Math.round(typo.taille_auteur * echelle);
    const tailleTemps = Math.max(12, Math.round(typo.taille_temps * echelle));
    const epaisseurBarre = Math.max(3, Math.round(typo.epaisseur_barre_px * echelle));

    const couleurTexte = np.couleurs.texte;
    // FFmpeg drawtext : backslashes → forward slashes, colons échappés.
    const escFont = (f) => f.replace(/\\/g, '/').replace(/:/g, '\\:');
    const fontRegular = escFont(np.police.regular);
    const fontBold = escFont(np.police.bold || np.police.regular);

    // Positions verticales (depuis le bas)
    const margeBasPct = np.positions.marge_bas_pct || 12;
    const margeBas = Math.round(H * margeBasPct / 100);
    const barY = H - margeBas;
    const yTemps = barY + epaisseurBarre + Math.round(10 * echelle);
    const yAuteur = barY - Math.round(typo.espace_auteur_barre * echelle);
    const yCite = yAuteur - tailleAuteur - Math.round(typo.espace_citation_auteur * echelle);

    // Positions horizontales
    const margeLat = Math.round(W * (np.positions.marge_laterale_pct || 8) / 100);
    const largeurBarre = W - margeLat * 2;
    const barX = margeLat;

    // -- INPUTS --
    // 0: audio, 1: background, 2: bar_bg.png, 3: bar_fill.png
    const dur = dureeTotale.toFixed(2);
    const inputs = [
        '-i', cfg._masterAudio,
        '-framerate', String(fps), '-loop', '1', '-t', dur, '-i', cfg._backgroundImage,
        '-framerate', String(fps), '-loop', '1', '-t', dur, '-i', cfg._barBg,
        '-framerate', String(fps), '-loop', '1', '-t', dur, '-i', cfg._barFill,
    ];

    // 1. FOND — image unique scalée
    parts.push(`[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[bg]`);

    // 2. CITATIONS — changent selon l'intervalle configuré, avec fade-in/fade-out
    const fadeSec = np.citation_fade_sec || 1;
    let couche = '[bg]';
    if (citations.length > 0) {
        citations.forEach((c, i) => {
            const debut = c.debut.toFixed(2);
            const fin = c.fin.toFixed(2);
            const texte = escapeDrawtext(`”${c.citation}”`);
            const auteur = escapeDrawtext(c.auteur);

            const alphaExpr = `if(lt(t-${debut},${fadeSec}),(t-${debut})/${fadeSec},if(gt(t,${fin}-${fadeSec}),(${fin}-t)/${fadeSec},1))`;

            const c1 = `[c${i}a]`;
            const sortie = (i === citations.length - 1) ? '[avecTextes]' : `[c${i}b]`;

            parts.push(
                `${couche}drawtext=text='${texte}':fontfile='${fontBold}':fontsize=${tailleCite}:` +
                `fontcolor=${couleurTexte}:alpha='${alphaExpr}':x=(w-text_w)/2:y=${yCite}:` +
                `enable='between(t,${debut},${fin})'${c1}`
            );
            parts.push(
                `${c1}drawtext=text='${auteur}':fontfile='${fontRegular}':fontsize=${tailleAuteur}:` +
                `fontcolor=${couleurTexte}:alpha='${alphaExpr}':x=(w-text_w)/2:y=${yAuteur}:` +
                `enable='between(t,${debut},${fin})'${sortie}`
            );
            couche = sortie;
        });
    } else {
        parts.push(`${couche}copy[avecTextes]`);
    }

    // 3. BARRE DE PROGRESSION ARRONDIE (pré-rendues en PNG)
    // Fond de barre (arrondi, semi-transparent)
    parts.push(`[avecTextes][2:v]overlay=${barX}:${barY}[barreVide]`);

    // Remplissage animé : scale du PNG arrondi pleine largeur
    parts.push(
        `[3:v]scale=w='max(${epaisseurBarre},${largeurBarre}*t/${dur})':h=${epaisseurBarre}:eval=frame[fill]`
    );
    parts.push(`[barreVide][fill]overlay=x=${barX}:y=${barY}[avecBarre]`);

    // 4. TEMPS — écoulé à gauche, restant à droite (sans tiret)
    let exprCur, exprRem;
    if (dureeTotale >= 3600) {
        exprCur = `%{eif\\:trunc(t/3600)\\:d}\\:%{eif\\:trunc(mod(t/60\\,60))\\:d\\:2}\\:%{eif\\:trunc(mod(t\\,60))\\:d\\:2}`;
        exprRem = `%{eif\\:trunc((${dur}-t)/3600)\\:d}\\:%{eif\\:trunc(mod((${dur}-t)/60\\,60))\\:d\\:2}\\:%{eif\\:trunc(mod(${dur}-t\\,60))\\:d\\:2}`;
    } else {
        exprCur = `%{eif\\:trunc(t/60)\\:d}\\:%{eif\\:trunc(mod(t\\,60))\\:d\\:2}`;
        exprRem = `%{eif\\:trunc((${dur}-t)/60)\\:d}\\:%{eif\\:trunc(mod(${dur}-t\\,60))\\:d\\:2}`;
    }

    parts.push(
        `[avecBarre]drawtext=text='${exprCur}':fontfile='${fontRegular}':fontsize=${tailleTemps}:` +
        `fontcolor=${couleurTexte}@0.72:x=${barX}:y=${yTemps}[avecTempsA]`
    );
    parts.push(
        `[avecTempsA]drawtext=text='${exprRem}':fontfile='${fontRegular}':fontsize=${tailleTemps}:` +
        `fontcolor=${couleurTexte}@0.72:x=${barX + largeurBarre}-text_w:y=${yTemps}[avecTemps]`
    );

    parts.push(`[avecTemps]format=yuv420p[out]`);

    return {
        filter: parts.join(';\n'),
        inputs,
        mapVideo: '[out]',
    };
}

module.exports = { construireFiltreNowPlaying };
