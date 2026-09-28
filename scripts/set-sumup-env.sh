#!/bin/zsh
# Enregistre les identifiants SumUp du compte PRINCIPAL (pas le sandbox) sur Netlify.
# Les valeurs sont saisies au clavier et ne s'affichent pas.
# Lancer depuis vr-cafe-new : zsh scripts/set-sumup-env.sh
set -e
cd "$(dirname "$0")/.."

read -rs "KEY?Clé API SumUp du compte principal (sup_sk_…) : "; echo
read -r "CODE?Code marchand SumUp du compte principal : "

if [[ "$KEY" != sup_sk_* || -z "$CODE" ]]; then
  echo "Clé ou code marchand invalide, rien n'a été modifié." >&2
  exit 1
fi

# Clé secrète : production uniquement (Netlify refuse une variable secrète sur tous les contextes)
netlify env:set SUMUP_API_KEY "$KEY" --secret --context production --force >/dev/null
netlify env:set SUMUP_MERCHANT_CODE "$CODE" --force >/dev/null
unset KEY

echo "OK : SUMUP_API_KEY (secrète, production) et SUMUP_MERCHANT_CODE enregistrés."
echo "Redéployer le site pour qu'ils soient pris en compte."
