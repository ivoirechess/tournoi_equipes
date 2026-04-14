# Cahier de charge — Plateforme Tournoi d'Échecs par Équipes

## 1) Objectif
Créer une plateforme **moderne, fluide et fiable** pour gérer un tournoi d’échecs par équipes, avec :
- une **vue publique** attractive (classements, poules, forces, profils),
- une **console admin** ergonomique (auth, gestion équipes/joueurs, imports),
- une **intégration Chess.com** robuste (ratings, peaks, avatars, parties).

---

## 2) Problèmes remontés à corriger

### 2.1 Blocages techniques
- Corriger les erreurs de type **permission denied** (notamment sur le chargement du classement/poules).
- Garantir qu’un échec partiel de chargement n’empêche pas l’interface de rester utilisable.

### 2.2 Données tournoi manquantes / incomplètes
- Afficher clairement les **groupes/poules** et leurs informations.
- Afficher les **forces d’équipes** de manière fiable et compréhensible.

### 2.3 Gestion joueurs insuffisante
- Rendre l’**ajout de joueurs** fonctionnel sans friction côté admin.
- Charger correctement les **vrais peaks** (rapid/blitz/bullet/global) pour les joueurs déjà saisis au démarrage.
- Afficher les **photos de profil** des joueurs (avatars) quand disponibles.

### 2.4 UX admin jugée faible
- Refaire la zone de **connexion admin** pour un rendu plus propre, moderne, lisible.
- Après connexion, la zone login doit se **réduire/se compacter** automatiquement.

### 2.5 Expérience globale
- Sortir du rendu « archaïque » : interface plus **moderne, optimisée, claire**.
- Prévoir un **pool de joueurs** (joueurs non affectés) depuis lequel on peut faire du **drag & drop** vers les équipes.

---

## 3) Fonctionnalités attendues (version cible)

## 3.1 Espace public
- Classement des poules A/B avec tri cohérent.
- Visualisation de la phase finale.
- Résultats/planning lisibles.
- Cartes d’équipes avec force, moyennes, indicateurs.
- Profils joueurs avec : nom, équipe, ratings, peaks, avatar, titre éventuel.

### 3.2 Espace admin
- Authentification + état de session explicite.
- Gestion équipes (création/suppression).
- Gestion joueurs (création/suppression, capitaine).
- Réaffectation des joueurs par **glisser-déposer**.
- Zone « pool joueurs disponibles » pour les non-affectés.
- Outils de tirage des poules, génération playoffs, overrides score.

### 3.3 Données Chess.com
- Synchronisation des stats joueurs (rapid/blitz/bullet + peaks).
- Récupération des avatars et métadonnées utiles.
- Import des parties liées aux boards/matchs.

### 3.4 Résilience / qualité
- Fallbacks en cas de permissions manquantes sur certaines vues.
- Messages d’erreur compréhensibles et actionnables.
- Rafraîchissement régulier des données sans casser l’UI.

---

## 4) Exigences UX/UI
- Design moderne (lisibilité, cohérence visuelle, hiérarchie claire).
- Navigation simple entre public/admin.
- Composants responsives (desktop/mobile).
- Feedback utilisateur immédiat (toasts, états de chargement).

---

## 5) Critères d’acceptation
- L’utilisateur peut consulter **classements/poules/forces** sans erreur bloquante.
- L’admin peut **ajouter un joueur** et l’affecter à une équipe.
- Les joueurs affichent leurs **peaks réels** (ou fallback explicite).
- Les avatars apparaissent si disponibles.
- La zone login admin est propre et se compacte après connexion.
- Le drag & drop depuis un **pool de joueurs** vers les équipes fonctionne.
- L’ensemble est perçu comme plus moderne, plus rapide et plus robuste.

---

## 6) Priorisation recommandée
1. Corriger permissions + chargements critiques.
2. Débloquer ajout joueur + pool DnD.
3. Finaliser enrichissement peaks/avatars.
4. Polir UI admin et modernisation globale.
5. Optimiser performances et finitions responsive.
