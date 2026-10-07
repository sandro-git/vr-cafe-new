#!/bin/zsh
# Enregistre le jeton personnel Netlify utilisé pour lire la consommation du site
# (/admin/consommation et alertes usage-alert). La valeur est saisie au clavier et ne s'affiche pas.
# Jeton à créer dans Netlify : User settings → Applications → Personal access tokens.
# Lancer depuis vr-cafe-new : zsh scripts/set-netlify-usage-token.sh
set -e
cd "$(dirname "$0")/.."

read -rs "TOKEN?Jeton personnel Netlify : "; echo

# Vérifie le jeton avant de l'enregistrer
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
  https://api.netlify.com/api/v1/sites/beb5ddd1-e665-4e27-a696-9282d704dfd6/usage)
if [[ "$CODE" != 200 ]]; then
  echo "Jeton refusé par Netlify (HTTP $CODE), rien n'a été modifié." >&2
  exit 1
fi

# Secrète : production uniquement (Netlify refuse une variable secrète sur tous les contextes)
netlify env:set NETLIFY_API_TOKEN "$TOKEN" --secret --context production --force >/dev/null
unset TOKEN

echo "OK : NETLIFY_API_TOKEN enregistré (secret, production)."
echo "Redéployer le site pour qu'il soit pris en compte."
