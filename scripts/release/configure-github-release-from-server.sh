#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REPO="ahmedshahboon-sys/3AKSA"
BRANCH="release/1.0.1-public-beta"
ROOT="/opt/3aksa"
SSH_KEY="/root/.ssh/3aksa_github_actions"
FORCED_COMMAND="/usr/local/sbin/3aksa-github-deploy"
SIGNING_DIR="/root/3aksa-signing-backup"
KEYSTORE="$SIGNING_DIR/3aksa-release.jks"
CREDS="$SIGNING_DIR/signing-credentials.txt"
SSH_PORT="${SSH_PORT:-22}"
PUBLIC_HOST="${PUBLIC_HOST:-}"

die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this script as root."
command -v git >/dev/null || die "git is required."
command -v ssh-keygen >/dev/null || die "openssh-client is required."
command -v sshd >/dev/null || die "openssh-server is required."
command -v openssl >/dev/null || die "openssl is required."

if ! command -v gh >/dev/null; then
  echo "Installing GitHub CLI..."
  apt-get update
  apt-get install -y gh
fi

if ! gh auth status >/dev/null 2>&1; then
  echo
  echo "GitHub CLI is not authenticated."
  echo "Complete the GitHub device login below using the repository owner account."
  gh auth login --hostname github.com --git-protocol https --web
fi

gh repo view "$REPO" >/dev/null 2>&1 || die "GitHub CLI cannot access $REPO."

if [ -z "$PUBLIC_HOST" ]; then
  if command -v curl >/dev/null; then
    PUBLIC_HOST="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
  fi
fi
if [ -z "$PUBLIC_HOST" ]; then
  read -r -p "Public SSH IP/hostname for this server: " PUBLIC_HOST
fi
[ -n "$PUBLIC_HOST" ] || die "PUBLIC_HOST is required."

install -d -m 700 /root/.ssh

if [ ! -f "$SSH_KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "3aksa-github-actions" -f "$SSH_KEY"
fi
chmod 600 "$SSH_KEY"
chmod 644 "$SSH_KEY.pub"

cat > "$FORCED_COMMAND" <<'FORCED'
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=/opt/3aksa
BRANCH=release/1.0.1-public-beta
ORIGINAL="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$ORIGINAL" =~ ^3aksa-github-deploy[[:space:]]([0-9a-f]{40})$ ]]; then
  EXPECTED_SHA="${BASH_REMATCH[1]}"
else
  echo "Denied: invalid deploy command." >&2
  exit 126
fi

[ -d "$ROOT/.git" ] || { echo "Missing repository at $ROOT" >&2; exit 20; }

cd "$ROOT"
git fetch --prune origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"

ACTUAL_SHA="$(git rev-parse HEAD)"
[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || {
  echo "Release SHA mismatch: expected=$EXPECTED_SHA actual=$ACTUAL_SHA" >&2
  exit 21
}

if [ -s /etc/3aksa/3aksa.env ] && [ -x "$ROOT/scripts/ops/backup.sh" ]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/3aksa/3aksa.env
  set +a
  bash "$ROOT/scripts/ops/backup.sh"
else
  echo "No existing production env/backup script; treating as first deployment."
fi

bash "$ROOT/infra/server/deploy-trial.sh"
bash "$ROOT/infra/server/verify-production.sh"

echo "DEPLOYED_SHA=$ACTUAL_SHA"
FORCED
chmod 750 "$FORCED_COMMAND"
chown root:root "$FORCED_COMMAND"

AUTHORIZED="/root/.ssh/authorized_keys"
touch "$AUTHORIZED"
chmod 600 "$AUTHORIZED"

PUB="$(cat "$SSH_KEY.pub")"
TMP="$(mktemp)"
grep -v '3aksa-github-actions' "$AUTHORIZED" > "$TMP" || true
printf 'command="%s",no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty %s\n' "$FORCED_COMMAND" "$PUB" >> "$TMP"
cat "$TMP" > "$AUTHORIZED"
rm -f "$TMP"

HOSTKEY_PUB="/etc/ssh/ssh_host_ed25519_key.pub"
[ -f "$HOSTKEY_PUB" ] || die "Missing $HOSTKEY_PUB"
KNOWN_HOSTS="$(mktemp)"
HOST_LABEL="$PUBLIC_HOST"
if [ "$SSH_PORT" != "22" ]; then
  HOST_LABEL="[$PUBLIC_HOST]:$SSH_PORT"
fi
awk -v h="$HOST_LABEL" '{print h" "$1" "$2}' "$HOSTKEY_PUB" > "$KNOWN_HOSTS"

echo "Uploading production SSH secrets..."
printf '%s' "$PUBLIC_HOST" | gh secret set PRODUCTION_SSH_HOST -R "$REPO"
printf '%s' "root" | gh secret set PRODUCTION_SSH_USER -R "$REPO"
printf '%s' "$SSH_PORT" | gh secret set PRODUCTION_SSH_PORT -R "$REPO"
gh secret set PRODUCTION_SSH_PRIVATE_KEY -R "$REPO" < "$SSH_KEY"
gh secret set PRODUCTION_SSH_KNOWN_HOSTS -R "$REPO" < "$KNOWN_HOSTS"
rm -f "$KNOWN_HOSTS"

install -d -m 700 "$SIGNING_DIR"

if [ ! -f "$KEYSTORE" ]; then
  if ! command -v keytool >/dev/null; then
    echo "Installing Java keytool..."
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y openjdk-21-jdk-headless
  fi

  STORE_PASS="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"
  KEY_PASS="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"
  ALIAS="3aksa-release"

  keytool -genkeypair     -keystore "$KEYSTORE"     -storetype JKS     -storepass "$STORE_PASS"     -keypass "$KEY_PASS"     -alias "$ALIAS"     -keyalg RSA     -keysize 4096     -validity 10000     -dname "CN=3AKSA, OU=Release, O=3AKSA, L=Tripoli, ST=Tripoli, C=LY"

  cat > "$CREDS" <<EOF
ANDROID_KEY_ALIAS=$ALIAS
ANDROID_KEYSTORE_PASSWORD=$STORE_PASS
ANDROID_KEY_PASSWORD=$KEY_PASS
EOF
  chmod 600 "$KEYSTORE" "$CREDS"
else
  [ -f "$CREDS" ] || die "$KEYSTORE exists but $CREDS is missing."
  # shellcheck disable=SC1090
  source "$CREDS"
  ALIAS="$ANDROID_KEY_ALIAS"
  STORE_PASS="$ANDROID_KEYSTORE_PASSWORD"
  KEY_PASS="$ANDROID_KEY_PASSWORD"
fi

echo "Uploading Android signing secrets..."
base64 -w0 "$KEYSTORE" | gh secret set ANDROID_KEYSTORE_BASE64 -R "$REPO"
printf '%s' "$STORE_PASS" | gh secret set ANDROID_KEYSTORE_PASSWORD -R "$REPO"
printf '%s' "$ALIAS" | gh secret set ANDROID_KEY_ALIAS -R "$REPO"
printf '%s' "$KEY_PASS" | gh secret set ANDROID_KEY_PASSWORD -R "$REPO"

echo
echo "IMPORTANT:"
echo "  Signing backup is stored in: $SIGNING_DIR"
echo "  Copy BOTH files to a secure offline location before deleting them from this server:"
echo "    $KEYSTORE"
echo "    $CREDS"
echo "  Future Android updates MUST use this same signing key."
echo

echo "Triggering Trusted Release Build..."
gh workflow run trusted-release.yml -R "$REPO" --ref "$BRANCH"   -f version_name=1.0.1   -f version_code=2   -f public_base_path=/3aksa/   -f public_app_url=https://marbo3a.ly/3aksa   -f api_base_url=https://marbo3a.ly/3aksa/api   -f socket_url=https://marbo3a.ly   -f socket_path=/3aksa/socket.io

echo "Triggering Production Deploy..."
gh workflow run production-deploy.yml -R "$REPO" --ref "$BRANCH"

echo
echo "Secrets configured and workflows triggered."
echo "Recent runs:"
gh run list -R "$REPO" --branch "$BRANCH" --limit 8
