// Calculs de l'onglet Immo côté téléphone. Copie de domains/viager/tri.py (fonction trier) et,
// à l'étape 5, de domains/viager/portefeuille.py. Vérifié contre Python par
// tests/test_viager_tri.py et tests/test_viager_portefeuille.py : ne pas modifier l'un sans
// l'autre.
(function (racine) {
  'use strict';
  const PILES = ['prioritaires', 'a_trancher', 'a_discuter', 'ecartees'];
  const DOM = ['971', '972', '973', '974', '975', '976', '977', '978', '98'];
  const euros = x => Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' €';
  const pct = x => (x >= 0 ? '+' : '') + Math.round(x * 100) + ' %';

  function centile(valeurs, p) {
    const s = [...valeurs].sort((a, b) => a - b);
    if (!s.length) return null;
    const k = (s.length - 1) * p / 100, bas = Math.floor(k), haut = Math.min(bas + 1, s.length - 1);
    return s[bas] + (s[haut] - s[bas]) * (k - bas);
  }

  function criteresStricts(m, c) {
    const rates = [];
    if (m.statut === 'vendu') rates.push(['statut', 'déjà vendu']);
    if (!c.types_vente.includes(m.type_vente)) rates.push(['type_vente', 'type de vente : ' + (m.type_vente || 'inconnu')]);
    if (!c.types_bien.includes(m.type_bien)) rates.push(['type_bien', 'type de bien : ' + (m.type_bien || 'inconnu')]);
    const cp = m.code_postal || '';
    if (DOM.some(d => cp.startsWith(d))) rates.push(['zone', 'hors France métropolitaine']);
    const ages = (m.tetes || []).map(t => t.age).filter(Boolean);
    if (ages.length) {
      const mini = Math.min(...ages);
      if (mini < c.age_min_exclusion) rates.push(['age', `tête de ${mini} ans (moins de ${c.age_min_exclusion})`]);
      else if (ages.length === 1 && ages[0] < c.age_min_une_tete) rates.push(['age', `${ages[0]} ans (moins de ${c.age_min_une_tete})`]);
      else if (ages.length >= 2 && !c.deux_tetes_acceptees) rates.push(['age', 'deux têtes non acceptées']);
      else if (ages.length >= 2 && mini < c.age_min_deux_tetes_chacune) rates.push(['age', `deux têtes : ${mini} ans (moins de ${c.age_min_deux_tetes_chacune} chacune)`]);
    }
    return rates;
  }

  // R = règles (criteres, tri) ; liste = métriques des annonces. Même résultat que tri.trier.
  function trier(R, liste) {
    const c = R.criteres, t = R.tri, d = t.a_discuter;
    const seuil = centile(liste.map(m => m.score).filter(s => s !== null && s !== undefined), d.score_min_centile);
    const elimine = { statut: 0, type_vente: 0, type_bien: 0, zone: 0, age: 0, bouquet: 0, rente: 0, ecart: 0 };
    const piles = liste.map(m => {
      const rates = criteresStricts(m, c);
      if (rates.length) { rates.forEach(([k]) => elimine[k]++); return ['ecartees', rates.map(r => r[1])]; }
      const e = m.ecart;
      if (e !== null && e !== undefined && e > t.ecart_a_trancher_max) {
        elimine.ecart++;
        return ['ecartees', [`valeur annoncée ${pct(e)} au-dessus du marché (farfelue)`]];
      }
      const at = [];
      if (m.retiree) at.push('annonce retirée du site');
      if (m.statut === 'sous_compromis') at.push("sous compromis : à vérifier auprès de l'agence");
      if (!m.tetes || !m.tetes.length) at.push('âge inconnu');
      else if (m.tetes.some(x => !x.sexe)) at.push("sexe d'une tête inconnu (calcul fait avec la table femmes, prudente)");
      (m.manquants || []).forEach(x => at.push('donnée manquante : ' + x));
      (m.incoherences || []).forEach(x => at.push(x));
      if (!m.confiance || m.confiance === 'basse') at.push(m.confiance ? 'estimation de marché peu fiable' : 'valeur de marché inconnue' + (m.marche_raison ? ` (${m.marche_raison})` : ''));
      if (e !== null && e !== undefined && e < t.ecart_plancher_a_trancher) at.push(`valeur annoncée ${pct(e)} sous le marché estimé : vérifier commune, surface et type de bien`);
      if (e !== null && e !== undefined && e > t.ecart_prioritaire_max) at.push(`valeur annoncée ${pct(e)} : fourchette haute`);
      if (m.niveau === 'N3' && (e === null || e === undefined || e > t.n3_prioritaire_seulement_si_ecart_max)) at.push('estimation sur annonces et valeur annoncée au-dessus');
      const depasse = [];
      const b = m.bouquet, r = m.rente_mois;
      if (b !== null && b !== undefined && b > c.bouquet_max_eur)
        depasse.push(['bouquet', b / c.bouquet_max_eur, d.bouquet_jusqu_a_fois_le_plafond, `bouquet ${euros(b)} (plafond ${euros(c.bouquet_max_eur)})`]);
      if (r !== null && r !== undefined && r > c.rente_max_eur_mois)
        depasse.push(['rente', r / c.rente_max_eur_mois, d.rente_jusqu_a_fois_le_plafond, `rente ${euros(r)}/mois (plafond ${euros(c.rente_max_eur_mois)})`]);
      if (depasse.length) {
        const haut = m.score !== null && m.score !== undefined && seuil !== null && m.score >= seuil;
        const marge = depasse.every(x => x[1] <= x[2]);
        if (haut && marge) return ['a_discuter', [...depasse.map(x => x[3]), `score ${Math.round(m.score)}, dans les ${100 - d.score_min_centile} % meilleurs`, ...at.map(x => 'à vérifier : ' + x)]];
        depasse.forEach(x => elimine[x[0]]++);
        return ['ecartees', depasse.map(x => x[3])];
      }
      if (at.length) return ['a_trancher', at];
      return ['prioritaires', ['critères respectés, ' + (e !== null && e !== undefined ? 'dans le marché' : 'valeur reconstituée')]];
    });
    const compte = Object.fromEntries(PILES.map(p => [p, piles.filter(x => x[0] === p).length]));
    return { piles, compte, elimine_par: elimine, seuil_score_a_discuter: seuil };
  }

  // --- Portefeuille : copie de domains/viager/portefeuille.py (même générateur, même ordre)
  function mulberry32(graine) {
    let etat = graine >>> 0;
    return function () {
      etat = (etat + 0x6D2B79F5) >>> 0;
      let t = etat;
      t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
      t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function tirerDuree(survie, u) {
    for (let k = 0; k < survie.length - 1; k++) {
      const a = survie[k], b = survie[k + 1];
      if (b <= u) return a !== b ? k + (a - u) / (a - b) : k;
    }
    return survie.length - 1;
  }
  function simuler(viagers, o) {
    const alea = mulberry32(o.graine ?? 1), annees = o.annees ?? 20, hMax = Math.max(...o.horizons);
    const manque = Object.fromEntries(o.horizons.map(h => [h, 0]));
    const minima = [], premieres = [];
    const tresorParAn = Array.from({ length: annees + 1 }, () => []), nombreParAn = Array.from({ length: annees + 1 }, () => []);
    for (let n = 0; n < o.tirages; n++) {
      const actifs = viagers.map(v => [v, 0, tirerDuree(v.survie, alea()), false]);
      let tresor = o.coussin - viagers.reduce((s, v) => s + v.entree, 0);
      let cagnotte = 0, prochain = 0, mini = tresor, aManque = tresor < 0;
      let premier = actifs.length ? Math.min(...actifs.map(a => a[2])) : Infinity;
      tresorParAn[0].push(tresor); nombreParAn[0].push(actifs.length);
      for (let annee = 1; annee <= annees; annee++) {
        const debut = annee - 1, fin = annee;
        tresor += 12 * o.capacite_mensuelle;
        for (const a of actifs) {
          const [v, achat, duree, vendu] = a;
          const lib = achat + duree;
          if (vendu) continue;
          const occupe = Math.max(0, Math.min(fin, lib) - debut);
          const ageContrat = debut - achat;
          tresor -= occupe * (v.rente_an * Math.pow(1 + o.indexation, Math.max(ageContrat, 0)) + v.frais_an);
          const vente = lib + v.delai_ans;
          tresor -= Math.max(0, Math.min(fin, vente) - Math.max(debut, lib)) * v.frais_an;
          if (debut < vente && vente <= fin) {
            a[3] = true;
            tresor += v.produit_net * (1 - o.part_reinvestie);
            cagnotte += v.produit_net * o.part_reinvestie;
          }
        }
        while (viagers.length && actifs.length < (o.max_viagers ?? 200) && tresor >= 0 && cagnotte >= viagers[prochain % viagers.length].entree) {
          const v = viagers[prochain % viagers.length];
          cagnotte -= v.entree;
          actifs.push([v, fin, tirerDuree(v.survie, alea()), false]);
          premier = Math.min(premier, fin + actifs[actifs.length - 1][2]);
          prochain++;
        }
        if (annee <= hMax) { mini = Math.min(mini, tresor); if (tresor < 0) aManque = true; }
        for (const h of o.horizons) if (annee === h && aManque) manque[h]++;
        tresorParAn[annee].push(tresor + cagnotte);
        nombreParAn[annee].push(actifs.filter(a => !a[3]).length);
      }
      minima.push(mini); premieres.push(premier);
    }
    const eventail = l => l.map((x, a) => ({ annee: a, bas: centile(x, 10), median: centile(x, 50), haut: centile(x, 90) }));
    return {
      probabilite_manque: Object.fromEntries(o.horizons.map(h => [String(h), manque[h] / o.tirages])),
      tresorerie_min_defavorable: centile(minima, 5),
      premiere_liberation_mediane: centile(premieres, 50),
      premiere_liberation_defavorable: centile(premieres, 90),
      eventail_tresorerie: eventail(tresorParAn), eventail_viagers: eventail(nombreParAn),
    };
  }
  function tenables(type, o, surete, nMax = 40) {
    const h = String(Math.max(...o.horizons));
    const tient = n => n === 0 || 1 - simuler(Array(n).fill(type), o).probabilite_manque[h] >= surete;
    let bas = 0, haut = nMax;
    if (tient(haut)) return haut;
    while (haut - bas > 1) { const m = Math.floor((bas + haut) / 2); if (tient(m)) bas = m; else haut = m; }
    return bas;
  }

  const API = { trier, centile, PILES, mulberry32, tirerDuree, simuler, tenables };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else racine.Immo = Object.assign(racine.Immo || {}, API);
})(typeof self !== 'undefined' ? self : this);
