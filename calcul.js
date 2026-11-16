// Calcul Japon côté téléphone : même logique que core/scoring.py, core/cartes.py et core/japon.py,
// sur les règles exportées par core.japon.regles_pwa(). Vérifié contre Python par
// tests/test_calcul_js.py (mêmes entrées → même plafond, à 1 € près). Ne pas modifier l'un sans
// l'autre : le test échouerait.
(function (racine) {
  'use strict';
  const arrondi = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const ratio = x => Math.round((x + Number.EPSILON) * 10000) / 10000;

  function bandePour(R, argus) {
    for (const b of R.bandes) {
      const okMin = b.argus_min === null || argus > b.argus_min || (argus === b.argus_min && b.min_inclus);
      const okMax = b.argus_max === null || argus < b.argus_max || (argus === b.argus_max && b.max_inclus);
      if (okMin && okMax) return b;
    }
    throw new Error('aucune tranche d’argus pour ' + argus);
  }

  function canalPour(R, famille, argus) {
    for (const c of R.canaux) {
      if (c.familles.includes(famille) && (c.argus_min === null || argus >= c.argus_min)) return c;
    }
    return R.canaux.find(c => c.nom === R.canal_par_defaut);
  }

  // core.scoring.evaluer_annonce (sans import hors UE : le Japon passe par frais_supplementaires)
  function evaluerAnnonce(R, prix, argus, famille, o) {
    const revente = argus * R.coefficient_etat[o.etat || 'bon'];
    const canal = canalPour(R, famille, argus);
    const frais = revente * canal.pct + canal.fixe;
    const port = o.portInEur;
    const avant = revente - prix - port - frais - (o.fraisSupp || 0);
    const prov = avant > 0 ? avant * R.provision_pct_marge : 0;
    const marge = arrondi(avant - prov);
    const decote = ratio((argus - prix) / argus);
    const pct = revente > 0 ? ratio(marge / revente) : null;
    const b = bandePour(R, argus);
    let eligible = marge >= b.marge_nette_min;
    if (b.decote_min !== null && decote < b.decote_min) eligible = false;
    if (b.marge_min_pct_revente !== null && (pct === null || pct < b.marge_min_pct_revente)) eligible = false;
    const statut = o.scoreFraude >= R.anti_arnaque.seuil_masque ? 'masquee'
      : o.scoreFraude >= R.anti_arnaque.seuil_suspect ? 'suspect' : 'ok';
    return { marge, eligible, push: eligible && statut === 'ok' };
  }

  // core.cartes.evaluer_affaire, cas du calculateur (pas de prix neuf, pas de lieu, pas de niche)
  function evaluerAffaire(R, prix, mediane, p25, n, famille, o) {
    const C = R.cartes;
    if (prix <= 1 || C.familles_sans_carte.includes(famille) || mediane <= 0) return null;
    let cat = o.categoriePort || C.port_par_famille[famille];
    cat = C.alias_port[cat] || cat;
    if (!cat || !(cat in R.port_in)) return null;
    const signaux = prix < mediane / 2 ? ['prix_lt_50pct_argus'] : [];
    const fraude = signaux.reduce((s, x) => s + R.anti_arnaque.points[x], 0);
    const opts = { etat: o.etat, portInEur: o.portInEur, fraisSupp: o.fraisSupp, scoreFraude: fraude };
    const med = evaluerAnnonce(R, prix, mediane, famille, opts);
    const prud = p25 && p25 > 0 ? evaluerAnnonce(R, prix, p25, famille, opts) : null;
    const appuye = n >= C.min_annonces_argus;
    const large = o.p75 != null && p25 && p25 > 0 && o.p75 > p25 * C.dispersion_max;
    const douteux = large || prix < mediane * C.prix_trop_beau_pct;
    let niveau;
    if (prix < mediane * C.prix_absurde_pct) niveau = 'non';
    else if (n < C.min_annonces_credible) niveau = 'non';
    else if (prud && prud.eligible && appuye && !douteux) niveau = 'solide';
    else if (med.eligible) niveau = 'a_voir';
    else niveau = 'non';
    return { niveau, margeMediane: med.marge, margePrudente: prud ? prud.marge : null };
  }

  // core.japon.couts
  function couts(R, mise, cat, f) {
    const exp = f.expeditionEur != null ? f.expeditionEur : R.port_in[cat] * R.import_transport_coef;
    const transport = exp + f.domestiquesYen / f.tauxYen;
    const commission = mise * f.commissionPct + f.commissionFixeYen / f.tauxYen;
    const droits = mise * R.import_droits_pct;
    const tva = (mise + droits + transport) * R.import_tva_pct;
    return { transport, commission, droits, tva };
  }

  function evaluerMise(R, mise, argus, p25, n, famille, cat, f, etat) {
    const c = couts(R, mise, cat, f);
    return evaluerAffaire(R, mise, argus, p25, n, famille, {
      categoriePort: cat, etat, portInEur: c.transport, fraisSupp: c.commission + c.droits + c.tva,
    });
  }

  // core.encheres.plafond : plus haut prix entier qui tient, par dichotomie
  function plafond(tient, bas, haut) {
    bas = Math.floor(bas); haut = Math.floor(haut);
    if (haut < bas || !tient(bas)) return null;
    if (tient(haut)) return haut;
    while (haut - bas > 1) {
      const milieu = Math.floor((bas + haut) / 2);
      if (tient(milieu)) bas = milieu; else haut = milieu;
    }
    return bas;
  }

  // core.japon.calcul
  function calcul(R, p, tauxYen) {
    const num = (v, d) => (v === null || v === undefined || v === '' ? d : Number(v));
    const argus = num(p.argus_med);
    const p25 = num(p.argus_p25, argus * 0.9);
    const n = Math.trunc(num(p.n_annonces, 5)) || 5;
    const cat = p.categorie_port, famille = p.famille, etat = p.etat || null;
    const com = num(p.commission_pct, null);
    const f = {
      tauxYen, expeditionEur: num(p.expedition_eur, null),
      commissionPct: com === null ? R.japon.commission_pct : com / 100,
      commissionFixeYen: num(p.commission_fixe_yen, R.japon.commission_fixe_yen),
      domestiquesYen: num(p.domestiques_yen, R.japon.domestiques_yen),
    };
    const sortie = { taux_yen: tauxYen, plafond: null, mise: null };
    const tient = m => { const a = evaluerMise(R, m, argus, p25, n, famille, cat, f, etat); return !!a && a.niveau === 'solide'; };
    const pl = plafond(tient, Math.round(argus * R.cartes.prix_trop_beau_pct) + 1, argus);
    if (pl !== null) {
      const a = evaluerMise(R, pl, argus, p25, n, famille, cat, f, etat);
      sortie.plafond = { mise_yen: Math.trunc(pl * tauxYen), mise_eur: pl,
        marge_prudente_eur: a.margePrudente, couts: couts(R, pl, cat, f) };
    }
    if (p.mise_yen !== null && p.mise_yen !== undefined && p.mise_yen !== '') {
      const eur = Number(p.mise_yen) / tauxYen;
      const a = evaluerMise(R, eur, argus, p25, n, famille, cat, f, etat);
      if (a) sortie.mise = { mise_eur: eur, niveau: a.niveau, marge_mediane_eur: a.margeMediane,
        marge_prudente_eur: a.margePrudente, tres_bas: eur < argus * R.cartes.prix_trop_beau_pct,
        couts: couts(R, eur, cat, f) };
    }
    return sortie;
  }

  const api = { calcul, evaluerAffaire, couts, plafond };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.SDCalcul = api;
})(typeof window !== 'undefined' ? window : globalThis);
