#!/usr/bin/env bash
# scripts/vps-setup.sh
#
# One-time bootstrap for a fresh VPS.
# Run as the user who will own the deploy (e.g. root or ubuntu):
#
#   bash scripts/vps-setup.sh
#
# What it does:
#   1. Installs Docker + Docker Compose plugin
#   2. Installs Git
#   3. Generates an SSH deploy key and prints the public key
#      → add this public key to GitHub repo Settings > Deploy keys
#   4. Adds that key to authorized_keys so CI can SSH back in
#      (only needed if using SSH-based deploy user)
#   5. Opens port 3200 in ufw

set -euo pipefail

echo "=== Step 1: Install Docker ==="
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "$USER" || true
  echo "Docker installed. You may need to log out and back in."
else
  echo "Docker already installed: $(docker --version)"
fi

echo ""
echo "=== Step 2: Install Git ==="
if ! command -v git &>/dev/null; then
  apt-get update -qq && apt-get install -y git
else
  echo "Git already installed: $(git --version)"
fi

echo ""
echo "=== Step 3: Generate SSH deploy key ==="
KEY_PATH="$HOME/.ssh/synq_deploy_key"
if [ ! -f "$KEY_PATH" ]; then
  ssh-keygen -t ed25519 -C "synq-github-actions" -f "$KEY_PATH" -N ""
  echo "Deploy key created."
else
  echo "Deploy key already exists at $KEY_PATH"
fi

echo ""
echo "================================================================"
echo "GITHUB ACTIONS SECRET — VPS_SSH_KEY"
echo "Copy everything between the lines into GitHub Secrets:"
echo "----------------------------------------------------------------"
cat "$KEY_PATH"
echo "----------------------------------------------------------------"
echo ""
echo "GITHUB ACTIONS SECRET — VPS_USER"
echo "  Value: $(whoami)"
echo ""
echo "GITHUB ACTIONS SECRET — VPS_HOST"
echo "  Value: $(curl -s ifconfig.me 2>/dev/null || echo '<your-public-ip>')"
echo "================================================================"

echo ""
echo "=== Step 4: Open firewall port 3200 ==="
if command -v ufw &>/dev/null; then
  ufw allow 3200/tcp && echo "Port 3200 open."
else
  echo "ufw not found — open port 3200 manually in your cloud firewall/security group."
fi

echo ""
echo "=== Done ==="
echo "Next: set the three secrets above in your GitHub repo:"
echo "  https://github.com/quikjimmy/synq/settings/secrets/actions"
echo "Then push to main/master — the deploy workflow will handle the rest."
