# Guide Netlify Forms - Formulaire de Contact VR Café

Ce guide explique comment fonctionne le formulaire de contact configuré avec Netlify Forms et comment configurer les notifications par email.

## 🎯 Ce qui a été configuré

### 1. Formulaire de contact (`/src/components/ContactForm.astro`)

Le formulaire a été configuré avec les attributs Netlify Forms :

```html
<form
  name="contact"
  method="POST"
  data-netlify="true"
  data-netlify-honeypot="bot-field"
  action="/contact-success"
>
  <!-- Champ caché pour identifier le formulaire -->
  <input type="hidden" name="form-name" value="contact" />

  <!-- Honeypot anti-spam (caché aux utilisateurs) -->
  <div class="hidden" aria-hidden="true">
    <label>Ne remplissez pas ce champ si vous êtes humain : <input name="bot-field" /></label>
  </div>

  <!-- Vos champs de formulaire -->
  ...
</form>
```

**Attributs importants :**
- `name="contact"` : Identifiant unique du formulaire
- `data-netlify="true"` : Active Netlify Forms
- `data-netlify-honeypot="bot-field"` : Protection anti-spam
- `action="/contact-success"` : Page de redirection après soumission
- `method="POST"` : Méthode d'envoi

### 2. Page de succès (`/src/pages/contact-success.astro`)

Page affichée après l'envoi réussi du formulaire avec :
- Message de confirmation
- Informations sur le délai de réponse
- Liens de retour vers le site
- Coordonnées pour contact urgent

### 3. Champs du formulaire

Tous les champs ont un attribut `name` requis par Netlify Forms :

- `name` (Nom) - **obligatoire**
- `email` (Email) - **obligatoire**
- `phone` (Téléphone) - optionnel
- `subject` (Sujet) - optionnel
- `message` (Message) - **obligatoire**

## 🚀 Comment ça fonctionne

### Avec JavaScript activé
1. L'utilisateur remplit le formulaire
2. Le formulaire est soumis à Netlify
3. Netlify enregistre la soumission
4. L'utilisateur est redirigé vers `/contact-success`
5. Vous recevez une notification email (si configurée)

### Sans JavaScript (Progressive Enhancement)
Le formulaire fonctionne de la même manière ! Netlify Forms ne nécessite pas JavaScript.

### Protection anti-spam
- **Honeypot** : Champ caché `bot-field` que les bots remplissent automatiquement
- **reCAPTCHA** : Peut être ajouté facilement si nécessaire

## 📧 Configuration des notifications email

### Étape 1 : Accéder aux paramètres Netlify Forms

1. Connectez-vous à [app.netlify.com](https://app.netlify.com)
2. Sélectionnez votre site **VR Café**
3. Allez dans **Site configuration** → **Forms**

### Étape 2 : Configurer les notifications

Dans la section **Form notifications** :

1. Cliquez sur **Add notification**
2. Choisissez **Email notification**
3. Configurez :
   - **Event to listen for** : `New form submission`
   - **Form** : Sélectionnez `contact`
   - **Email to notify** : Entrez `contact@vr-cafe.fr` (ou votre email)
   - **Custom email subject** (optionnel) : `[VR Café] Nouveau message de contact`

4. Cliquez sur **Save**

### Étape 3 : Tester le formulaire

1. Allez sur votre site déployé : `https://vr-cafe.fr/contact`
2. Remplissez et envoyez le formulaire de test
3. Vérifiez :
   - La redirection vers `/contact-success` fonctionne
   - Vous recevez l'email de notification
   - La soumission apparaît dans le dashboard Netlify

## 📊 Consulter les soumissions

### Dans le dashboard Netlify

1. Allez dans **Site configuration** → **Forms**
2. Cliquez sur le formulaire **contact**
3. Vous verrez toutes les soumissions avec :
   - Date et heure
   - Toutes les données du formulaire
   - Adresse IP de l'expéditeur
   - Option d'export en CSV

### Filtres et recherche

Vous pouvez :
- Filtrer par date
- Rechercher dans les soumissions
- Supprimer les spams
- Exporter en CSV

## 🎨 Personnalisation

### Modifier le message de la page de succès

Éditez `/src/pages/contact-success.astro` et modifiez le texte selon vos besoins.

### Changer la redirection

Dans `/src/components/ContactForm.astro`, modifiez l'attribut `action` :

```html
<form action="/votre-page-de-succes">
```

### Ajouter reCAPTCHA

Pour une protection supplémentaire contre le spam :

1. Ajoutez l'attribut `data-netlify-recaptcha="true"` au formulaire
2. Ajoutez ce div avant le bouton submit :
```html
<div data-netlify-recaptcha="true"></div>
```

Netlify gère automatiquement reCAPTCHA v2 !

### Notification Slack (optionnel)

Au lieu d'emails, vous pouvez recevoir les notifications sur Slack :

1. Dans **Form notifications**, choisissez **Slack notification**
2. Autorisez Netlify à accéder à votre workspace Slack
3. Sélectionnez le canal de notification

### Webhook (optionnel)

Pour envoyer les données à une API externe :

1. Dans **Form notifications**, choisissez **Outgoing webhook**
2. Entrez l'URL de votre API
3. Netlify enverra un POST avec les données du formulaire

## 🔍 Débogage

### Le formulaire n'apparaît pas dans Netlify

**Solution :** Netlify détecte les formulaires lors du build. Assurez-vous de :
1. Avoir déployé le site APRÈS avoir ajouté les attributs Netlify Forms
2. Le formulaire doit être présent dans le HTML généré (pas uniquement via JavaScript)

### Je ne reçois pas les emails

Vérifiez :
1. La notification email est bien configurée dans le dashboard
2. L'email n'est pas dans vos spams
3. L'adresse email est correcte
4. Les soumissions apparaissent bien dans le dashboard Netlify

### Le formulaire redirige mais les données ne sont pas enregistrées

Vérifiez que :
- Le champ caché `<input type="hidden" name="form-name" value="contact" />` est présent
- Tous les champs ont un attribut `name`
- L'attribut `data-netlify="true"` est bien présent

## 📋 Limites du plan gratuit Netlify

- **100 soumissions par mois** (plan gratuit)
- Au-delà : 19$/mois pour 1 000 soumissions

Pour un formulaire de contact, 100/mois est généralement suffisant.

## 🆚 Avantages par rapport à Resend/Netlify Functions

| Critère | Netlify Forms | Resend/Functions |
|---------|---------------|------------------|
| Configuration | ✅ Simple (attributs HTML) | ⚠️ Complexe (code + API) |
| Coût | ✅ Inclus dans Netlify | 💰 Service externe |
| Spam protection | ✅ Honeypot + reCAPTCHA | ⚠️ À implémenter |
| Dashboard | ✅ Interface web complète | ❌ Logs uniquement |
| Export données | ✅ CSV | ❌ Aucun |
| JavaScript requis | ❌ Non (fonctionne sans JS) | ⚠️ Oui |
| Personnalisation email | ⚠️ Limitée | ✅ Totale (HTML) |

## ✅ Checklist finale

- [x] Attributs Netlify Forms ajoutés au formulaire
- [x] Champ caché `form-name` présent
- [x] Honeypot anti-spam configuré
- [x] Tous les champs ont un attribut `name`
- [x] Page de succès créée (`/contact-success`)
- [ ] Site déployé sur Netlify
- [ ] Notification email configurée dans le dashboard
- [ ] Formulaire testé en production
- [ ] Email de notification reçu

## 📞 Support

Si vous rencontrez des problèmes :
- Documentation Netlify Forms : [docs.netlify.com/forms](https://docs.netlify.com/forms/setup/)
- Support Netlify : [answers.netlify.com](https://answers.netlify.com)

---

**Le formulaire est maintenant prêt à être déployé !** 🚀

Après le déploiement, n'oubliez pas de configurer les notifications email dans le dashboard Netlify.
