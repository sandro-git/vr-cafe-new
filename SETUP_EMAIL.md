# Configuration de l'envoi d'emails via Netlify Functions et Resend

Ce guide vous explique comment configurer le système d'envoi d'emails pour le formulaire de contact de votre site VR Café.

## 📋 Prérequis

- Un compte Netlify (déjà configuré)
- Un compte Resend (gratuit jusqu'à 3000 emails/mois)
- Node.js et pnpm installés

## 🚀 Étapes d'installation

### 1. Installer la dépendance Resend

Dans votre terminal, à la racine du projet, exécutez :

```bash
pnpm add resend
```

### 2. Créer un compte Resend et obtenir la clé API

#### 2.1. Créer un compte
1. Allez sur [resend.com](https://resend.com)
2. Cliquez sur "Sign Up" (Inscription)
3. Créez votre compte avec votre email professionnel

#### 2.2. Obtenir votre clé API
1. Une fois connecté, allez dans **Settings** (Paramètres) → **API Keys**
2. Cliquez sur **Create API Key**
3. Donnez un nom à votre clé (par exemple : "VR Cafe Contact Form")
4. Sélectionnez les permissions : **"Sending access"** (accès envoi)
5. Cliquez sur **Create**
6. **IMPORTANT** : Copiez immédiatement la clé qui commence par `re_...` et sauvegardez-la dans un endroit sûr (vous ne pourrez plus la voir après)

### 3. Configurer les variables d'environnement

#### 3.1. En local (développement)

Créez ou modifiez le fichier `.env` à la racine de votre projet :

```env
# Clé API Resend
RESEND_API_KEY=re_votre_cle_api_ici

# Email de destination (optionnel, par défaut: contact@vr-cafe.fr)
CONTACT_EMAIL=contact@vr-cafe.fr
```

**ATTENTION** : Ne commitez JAMAIS ce fichier `.env` sur Git ! Il doit être dans votre `.gitignore`.

#### 3.2. Sur Netlify (production)

1. Allez sur votre dashboard Netlify
2. Sélectionnez votre site VR Café
3. Allez dans **Site configuration** → **Environment variables**
4. Cliquez sur **Add a variable**
5. Ajoutez les variables suivantes :

| Key | Value | Scopes |
|-----|-------|--------|
| `RESEND_API_KEY` | `re_votre_cle_api_ici` | All |
| `CONTACT_EMAIL` | `contact@vr-cafe.fr` | All |

6. Cliquez sur **Save**

### 4. (Optionnel) Configurer un domaine personnalisé pour l'envoi

Par défaut, les emails seront envoyés depuis `onboarding@resend.dev`. Pour utiliser votre propre domaine (recommandé pour la production) :

#### 4.1. Ajouter votre domaine dans Resend
1. Dans votre dashboard Resend, allez dans **Domains**
2. Cliquez sur **Add Domain**
3. Entrez votre domaine : `vr-cafe.fr`
4. Suivez les instructions pour ajouter les enregistrements DNS (DKIM, SPF, etc.)

#### 4.2. Mettre à jour la fonction Netlify
Une fois votre domaine vérifié, modifiez le fichier `/netlify/functions/send-contact.js` ligne 108 :

Remplacez :
```javascript
from: 'VR Café Contact <onboarding@resend.dev>',
```

Par :
```javascript
from: 'VR Café Contact <noreply@vr-cafe.fr>',
```

### 5. Tester en local

#### 5.1. Installer Netlify CLI (si ce n'est pas déjà fait)
```bash
pnpm add -D netlify-cli
```

#### 5.2. Lancer le serveur de développement Netlify
```bash
pnpm exec netlify dev
```

Cette commande lance votre site Astro ET les fonctions Netlify en même temps.

#### 5.3. Tester le formulaire
1. Ouvrez votre navigateur à l'adresse indiquée (généralement `http://localhost:8888`)
2. Allez sur la page de contact
3. Remplissez le formulaire et envoyez un message de test
4. Vérifiez que vous recevez bien l'email

### 6. Déployer sur Netlify

```bash
git add .
git commit -m "feat: ajout du système d'envoi d'emails via Resend"
git push
```

Netlify va automatiquement déployer votre site avec la nouvelle fonctionnalité.

## 🧪 Tests

### Test en développement local

Avec Netlify CLI :
```bash
pnpm exec netlify dev
```

### Test de la fonction directement (debug)

Vous pouvez tester la fonction directement avec curl :

```bash
curl -X POST http://localhost:8888/.netlify/functions/send-contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "06 12 34 56 78",
    "subject": "Test",
    "message": "Ceci est un message de test"
  }'
```

## 📊 Quota et limites Resend (plan gratuit)

- **3 000 emails par mois**
- **100 emails par jour**
- Largement suffisant pour un formulaire de contact

Si vous dépassez ces limites, Resend propose des plans payants très abordables.

## 🔍 Dépannage

### Erreur : "RESEND_API_KEY is not defined"
- Vérifiez que vous avez bien ajouté la variable d'environnement
- En local : vérifiez votre fichier `.env`
- Sur Netlify : vérifiez les variables d'environnement dans le dashboard

### Les emails n'arrivent pas
1. Vérifiez vos spams
2. Vérifiez la clé API dans Resend (est-elle valide ?)
3. Consultez les logs Netlify : **Site configuration** → **Functions** → Cliquez sur votre fonction
4. Consultez les logs Resend : dashboard Resend → **Logs**

### Erreur 500 lors de l'envoi
- Consultez les logs de la fonction dans Netlify
- Vérifiez que la dépendance `resend` est bien installée dans `package.json`

## 📝 Structure des fichiers créés

```
vr-cafe-new/
├── netlify/
│   └── functions/
│       └── send-contact.js          # Fonction Netlify pour l'envoi d'emails
├── src/
│   └── components/
│       └── ContactForm.astro        # Formulaire modifié
├── .env                             # Variables d'environnement (local, .gitignore)
├── package.json                     # Dépendance resend ajoutée
└── SETUP_EMAIL.md                   # Ce fichier
```

## 🎨 Personnalisation

### Modifier le design de l'email
Modifiez la variable `htmlContent` dans `/netlify/functions/send-contact.js` (lignes 31-90).

### Changer l'email de destination
Modifiez la variable d'environnement `CONTACT_EMAIL` ou modifiez directement la ligne 109 du fichier.

### Ajouter des champs au formulaire
1. Ajoutez le champ dans `ContactForm.astro`
2. Récupérez la valeur dans le script JavaScript (ligne 374)
3. Ajoutez le champ dans le contenu de l'email (ligne 31)

## ✅ Checklist finale

- [ ] Dépendance `resend` installée (`pnpm add resend`)
- [ ] Compte Resend créé
- [ ] Clé API Resend obtenue
- [ ] Variables d'environnement configurées localement (`.env`)
- [ ] Variables d'environnement configurées sur Netlify
- [ ] Test en local avec `netlify dev` réussi
- [ ] Déploiement sur Netlify effectué
- [ ] Test en production réussi
- [ ] (Optionnel) Domaine personnalisé configuré

## 📞 Support

Si vous rencontrez des problèmes :
- Documentation Resend : [resend.com/docs](https://resend.com/docs)
- Documentation Netlify Functions : [docs.netlify.com/functions](https://docs.netlify.com/functions/overview/)
- Support Resend : support@resend.com

---

**Bon courage et bon développement !** 🚀
