# GCS — purge RGPD des photos sources

## Application de la règle

```bash
gcloud storage buckets update gs://$GCS_BUCKET --lifecycle-file=infra/gcs/lifecycle.json
```

Vérification :

```bash
gcloud storage buckets describe gs://$GCS_BUCKET --format="json(lifecycle_config)"
```

## Ce que fait la règle (`lifecycle.json`)

Supprime automatiquement, **30 jours** après leur création, tous les objets
sous le préfixe `sources/` — c'est-à-dire les **photos sources** envoyées par
les boutiques (`sources/{authUserId}/{uuid}.jpg`). Les autres préfixes ne sont
**pas** touchés :

| Préfixe | Contenu | Rétention |
|---|---|---|
| `sources/` | Photos brutes du vêtement (prises en boutique) | **Purgé à 30 jours** |
| `results/` | Rendus IA (`results/{authUserId}/{generationId}.png`) | Conservé |
| `backgrounds/` | Fonds personnalisés réutilisables | Conservé |

> Le layout du bucket met le **type d'objet en tête de chemin**
> (`sources/{authUserId}/…` et non `shops/{authUserId}/sources/…`) parce que
> la condition `matchesPrefix` du lifecycle GCS est un préfixe **littéral**,
> sans wildcard : `shops/*/sources/` ne serait pas exprimable. Le chemin est
> construit dans `apps/api/src/services/storage.ts`.

## Pourquoi (RGPD)

- Les **photos sources** peuvent contenir des données personnelles
  incidentes (intérieur de la boutique, mains, reflets, métadonnées de prise
  de vue). Elles ne servent qu'à produire le rendu : les conserver au-delà de
  la fenêtre utile (régénération/variantes) serait contraire au principe de
  **minimisation** (art. 5.1.c RGPD). 30 jours couvrent largement le cycle
  « générer → régénérer → variantes ».
- Les **rendus IA** (`results/`) n'exposent que des **mannequins
  synthétiques** et le vêtement : pas de données personnelles réelles. Ils
  constituent le produit acheté par la boutique (1 crédit = 1 visuel) et sont
  conservés pour la galerie et l'export.
- Les **fonds personnalisés** (`backgrounds/`) sont des décors uploadés
  volontairement par la boutique pour être **réutilisés** — conservés tant que
  le compte existe.

Effet de bord assumé : après 30 jours, « Régénérer » / « Variantes » sur une
ancienne génération échoue (source purgée) — la boutique reprend simplement
une photo. Le comparateur AVANT/APRÈS de vieux rendus perd son image AVANT.
