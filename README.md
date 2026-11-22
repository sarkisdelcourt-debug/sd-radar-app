# app/ — PWA SD Radar (téléphone)

Page unique `index.html` (+ `japon.html`/`calcul.js` pour le calcul Japon, `sw.js` pour l'ouverture
hors réseau, `manifest.json`). Publiée telle quelle sur GitHub Pages depuis le dépôt public
`sd-radar-app` (copie à l'identique, sans secret : `cp app/* ../sd-radar-app/`).

- **Données** : en local, `scripts/swipe_serveur.py` (port 8765, `SD_RADAR_PORT` pour en changer)
  sert `/api/*` depuis `data/state/` ; sur le téléphone, fonctions Supabase `radar_*` à jeton
  (lien de configuration `cfg=` collé une fois, gardé en `localStorage`).
- **Onglets** : À trier (pile de cartes, filtres Tous / Solides / À vérifier / Enchères),
  Chasseur (une fiche = un bloc : sous plafond / proches / manches), Mes prises (étapes),
  Argus ; menu « ··· » : calcul Japon, réglages.
- **Carte** : photo fixe, verdict (écart à l'argus, marge prudente), prix posé sur la fourchette
  p25–p75 (position, pas couleur), titre, pastilles, détails repliés, carte suivante derrière.
- **Gestes** : droite = garder, gauche = passer, haut (depuis la photo) = plus tard ; distance
  (30 % de l'écran) ou geste vif ; appui long sur « Passer » = motif ; ↶ et « Annuler » reviennent
  en arrière ; flèches du clavier sur PC, Échap ferme.
- **Dashboard matériel** (lecture seule, `core/dashboard_materiel.py`, depuis la dernière
  synchronisation dans `SD HQ V2/raw/dashboard-materiel-<date>/`) : pastille « Tu en as déjà N »
  sur la carte (étape Cartes) ; bloc « Depuis ta liste à surveiller » dans le Chasseur (objets
  `surveiller` sans fiche, à valider) ; dans Mes prises à l'étape Acheté, « Fiche pour le Dashboard
  matériel » à copier et donner à Claude. Le radar n'écrit jamais dans le dashboard.
- **Calcul Japon** (`japon.html`, menu « ··· ») : plafond de mise en yens tous frais compris. On
  y colle le lien d'une annonce (FromJapan, Yahoo, Buyee, ZenMarket, Mercari, ou le texte partagé
  par l'appli : le titre est repris) : la page ne lit pas l'annonce (ces sites refusent les
  lecteurs automatiques), elle reconnaît l'objet et « Garder dans Mes prises » en fait une prise
  suivie (source Yahoo Japon / Mercari Japon, mise ou plafond, argus, marge).
- Les décisions prises hors ligne attendent dans une file (`sdradar_file`) et partent au retour du
  réseau ; elles sont réappliquées sur l'état reçu du serveur pour ne pas revenir dans la pile.
