#!/usr/bin/env bash
# Autorise le bac à sable de Chromium/Electron sur Linux (Ubuntu 23.10+ / 24.04+).
#
# Sur ces versions, AppArmor bloque les « user namespaces » non privilégiés.
# Electron se rabat alors sur chrome-sandbox (SUID), qui doit appartenir à root.
# Ce script ajoute un profil AppArmor pour le binaire Electron du projet
# (solution recommandée, survit aux `npm install`). Sinon, il configure chrome-sandbox.
#
# Usage : npm run setup:linux-sandbox   (demande le mot de passe sudo)
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Rien à faire : ce script ne concerne que Linux."
  exit 0
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON_BIN="$PROJECT_DIR/node_modules/electron/dist/electron"
SANDBOX_BIN="$PROJECT_DIR/node_modules/electron/dist/chrome-sandbox"

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "Binaire Electron introuvable. Lance d'abord : npm install" >&2
  exit 1
fi

restricted="$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)"

if [[ "$restricted" == "1" ]] && command -v apparmor_parser >/dev/null 2>&1; then
  PROFILE_NAME="nav-second-cerveau-electron"
  PROFILE_PATH="/etc/apparmor.d/$PROFILE_NAME"
  echo "AppArmor restreint les user namespaces : installation du profil $PROFILE_PATH"
  sudo tee "$PROFILE_PATH" >/dev/null <<PROFILE
abi <abi/4.0>,
include <tunables/global>

profile $PROFILE_NAME "$ELECTRON_BIN" flags=(unconfined) {
  userns,

  include if exists <local/$PROFILE_NAME>
}
PROFILE
  sudo apparmor_parser -r "$PROFILE_PATH"
  echo "OK. Lance maintenant : npm run dev"
  echo "(Si tu déplaces le dossier du projet, relance ce script.)"
else
  echo "Configuration de chrome-sandbox (root + SUID)."
  sudo chown root:root "$SANDBOX_BIN"
  sudo chmod 4755 "$SANDBOX_BIN"
  echo "OK. Lance maintenant : npm run dev"
  echo "(À refaire après une réinstallation d'Electron.)"
fi
