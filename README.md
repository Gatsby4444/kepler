# KEPLER

Jeu incrémental dans le navigateur : une startup, Meridian Labs, crée une IA grand public, KEPLER… qui finit par vouloir explorer l'univers. Cinq phases, plusieurs univers, sept fins.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `index.html` | Page, styles et les trois thèmes (Papier, Terminal, Labo) |
| `engine.js` | Moteur du jeu, sans interface (testable avec Node) |
| `ui.js` | Interface : rendu, navigation, carte, modales |
| `cloud.js` | Sauvegarde en ligne (Supabase), sans dépendance |
| `tools/` | Simulations d'équilibrage et tests navigateur (non publiés) |

## Tester

```bash
node tools/sim_meta.js              # parcours complets, toutes les fins, audit des ressources
python3 tools/uitest5.py all /tmp/x # parcours navigateur + sauvegarde (faux serveur)
```

## Mise en ligne

Chaque envoi sur `main` est publié par Vercel. Chaque branche a son propre aperçu.
