# Analyse ciblée — Saisie des résultats des matchs

Cette analyse se concentre uniquement sur le module **"Saisie des résultats"** (admin) du site `https://ivoirechess.github.io/tournoi_equipes/`.

## Diagnostic global
La fonctionnalité existe, mais la gestion actuelle est **fragile à trois niveaux** :
1. **Fiabilité technique** (pas de transaction, peu de gestion d’erreurs, enregistrements séquentiels multiples).
2. **Qualité métier** (règles de validation insuffisantes, états incohérents possibles).
3. **UX admin** (peu de garde-fous, feedback incomplet, risque d’erreur humaine).

---

## Problèmes critiques observés

### 1) Sauvegarde non atomique (risque d’état partiel)
Le bouton Enregistrer effectue une suite d’`update` séparés sur `match_boards`, puis un `update` sur `matches`, puis un RPC de recalcul. Si une étape échoue au milieu, on peut conserver un état incohérent (certaines lignes mises à jour, d’autres non).  

**Impact :** données de match partiellement enregistrées, score global possiblement incorrect jusqu’au prochain recalcul.

### 2) Absence de gestion d’erreurs robuste
Les appels Supabase dans la sauvegarde ne vérifient pas explicitement les `error` retour pour chaque opération. Le toast de succès peut s’afficher même dans des scénarios d’échec partiel non traités.

**Impact :** faux sentiment de succès côté admin, difficulté de support.

### 3) Validation métier incomplète des points saisis
Les inputs acceptent des nombres `0..4` par pas de `0.5`, mais il manque des validations métier au moment du save (ex. cohérence avec le format attendu, complétude avant passage en `validated`, contraintes spécifiques échiquier capitaine).

**Impact :** résultats techniquement acceptés mais métier discutables.

### 4) Couplage fort UI + logique métier
Le module calcule/affiche/sauvegarde dans un bloc très compact, ce qui rend les bugs plus probables et la maintenance coûteuse.

**Impact :** difficulté à faire évoluer les règles (nouveau barème, nouvelles cadences, contraintes de tournoi).

### 5) Requêtes de mise à jour inefficaces
La sauvegarde itère et fait plusieurs round-trips réseau (update pairings puis update scores board par board).

**Impact :** latence plus élevée, surface d’échec multipliée.

---

## Pourquoi c’est “mal géré” pour un site de ce niveau
- Le site présente une UI premium, mais la **chaîne de persistance** ne respecte pas les standards attendus pour une fonctionnalité cœur (résultats de match).
- L’absence d’atomicité et de validations fortes est un anti-pattern classique sur un module critique.
- Le module devrait être au minimum “safe-by-default” : soit tout passe, soit rien ne passe.

---

## Plan de correction priorisé (recommandé)

### Priorité P0 — Fiabiliser immédiatement
1. **Créer une RPC unique `save_match_results(...)`** côté Postgres/Supabase qui :
   - valide les données,
   - upsert les 5 échiquiers,
   - met à jour `matches` (status/date),
   - recalcule le score,
   - exécute le tout dans **une transaction unique**.
2. **Faire échouer explicitement** toute la sauvegarde si une règle est violée.
3. **Retourner un payload clair** (`ok`, `errors[]`, `warnings[]`, `computed_score`).

### Priorité P1 — Renforcer la validation métier
1. Interdire le statut `validated` tant que toutes les parties requises ne sont pas cohérentes.
2. Vérifier les bornes et incréments autorisés au niveau backend (pas seulement HTML).
3. Vérifier la cohérence pairing (joueurs appartenant aux bonnes équipes, doublons interdits).

### Priorité P2 — Améliorer l’UX admin
1. Ajouter un mode brouillon + indicateur “modifications non enregistrées”.
2. Désactiver le bouton Save pendant la requête + spinner + détail d’erreur par échiquier.
3. Ajouter un “Dernière sauvegarde à HH:MM:SS” + auteur.

### Priorité P3 — Maintenabilité
1. Extraire le module en sous-fichiers (`results-service`, `results-validators`, `results-view`).
2. Ajouter tests unitaires des règles (validation + calcul).
3. Ajouter logs structurés sur les opérations de save.

---

## Résultat attendu après refonte
- **0 état partiel** en base.
- **Erreurs explicites** et actionnables pour l’admin.
- **Temps de support réduit** (moins de corrections manuelles).
- **Confiance produit** alignée avec le positionnement premium du site.
