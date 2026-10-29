# KEPLER — notes pour les sessions de travail

Jeu incrémental français inspiré d'Universal Paperclips, Plague Inc et Terminator Genisys. L'utilisateur est le game designer : il valide les directions, Claude code, teste et publie. Tout le texte du jeu et les échanges sont en français.

## Architecture
- `engine.js` : moteur pur (aucun DOM), exporté en `window.Kepler` et en module Node. Déterministe (générateur LCG stocké dans l'état). `VERSION` = format de sauvegarde : ne l'augmenter que si l'état change de forme.
- `ui.js` : interface. Lit l'état, appelle les actions du moteur. Point d'accès de test : `window.__kepler` (`state`, `meta`, `fast(s)`, `theme(t)`, `drawer(tab)`, `snapshot()`, `loadSave(run, meta, ui)`).
- `cloud.js` : sauvegarde en ligne sans bibliothèque (appels HTTP directs à Supabase). Le localStorage reste la source principale.
- `index.html` : styles et 3 thèmes via `data-theme` sur `<html>` (`papier`, `terminal`, `labo`). Couleurs = variables CSS ; les canvas les relisent avec `refreshVars()`.
- Ordinateur : 3 colonnes (`#c1`, `#c2`, `#c3`). Mobile (≤ 900 px) : 4 vues (`agir`, `projets`, `monde`, `journal`) choisies par l'attribut `data-m` de chaque carte. Héritage et Options sont dans un tiroir (`#drawer`).

## Supabase (projet « Kepler », eu-west-1)
- Tables `saves`, `save_members`, `recovery_codes`, `recovery_attempts` : RLS activée sans politique, aucun accès direct.
- Fonctions `kepler_pull`, `kepler_push` (refuse d'écraser une partie plus avancée de 120 s sauf `p_force`), `kepler_create_code`, `kepler_claim_code` ; exécutables par `authenticated` seulement.
- Comptes anonymes (« Allow anonymous sign-ins » dans le tableau de bord). Clés publiques dans `cloud.js`.
- Les migrations contenant `DELETE` ou `REVOKE` demandent une approbation de l'utilisateur.

## Vérifier avant d'envoyer
- `node tools/sim_meta.js` : 3 univers, les 7 fins, défi, hors-ligne, audit des ressources mortes (doit afficher « aucune »).
- `python3 -I tools/uitest5.py all <dossier>` : parcours des 5 phases sur ordinateur, tablette et mobile, les 3 thèmes, et la sauvegarde contre un faux Supabase. Doit finir sur « ERREURS : 0 ».
- L'espace de travail ne joint pas `*.supabase.co` ni `*.vercel.app` : tester le vrai serveur via les connecteurs (SQL) ou l'aperçu Vercel.

## Mise en ligne
- Dépôt GitHub `Gatsby4444/kepler`, projet Vercel `kepler` (production : `kepler-alpha.vercel.app`).
- Travailler sur une branche : Vercel publie un aperçu ; l'utilisateur fusionne dans `main` pour la production.
- `.vercelignore` exclut `tools/` et ce fichier.
