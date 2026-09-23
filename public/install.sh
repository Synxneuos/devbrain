#!/usr/bin/env bash
# Jev Brain CLI - macOS & Linux One-Line Installer
# Usage: curl -fsSL https://jevbrain.world/install.sh | bash

set -e

BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}⚡ JEV BRAIN LOCAL CLI INSTALLER${RESET}"
echo -e "${BOLD}“Don't think. Route.”${RESET}"
echo ""

# Check for Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}✖ Node.js is required but not installed.${RESET}"
  echo -e "Please install Node.js (v18+) from: ${CYAN}https://nodejs.org${RESET}"
  echo "Or install via package manager: brew install node (macOS) or sudo apt install nodejs npm (Ubuntu)"
  exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✔${RESET} Found Node.js: ${NODE_VERSION}"

# Install jevbrain
echo -e "📦 Installing Jev Brain CLI globally..."
if npm install -g jevbrain >/dev/null 2>&1; then
  echo -e "${GREEN}✔ Installed via npm global registry!${RESET}"
else
  # Fallback: install in user directory ~/.jevbrain
  INSTALL_DIR="$HOME/.jevbrain"
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  npm init -y >/dev/null 2>&1 || true
  npm install jevbrain >/dev/null 2>&1 || true
  
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
  cat << 'EOF' > "$BIN_DIR/jevbrain"
#!/usr/bin/env bash
npx jevbrain "$@"
EOF
  chmod +x "$BIN_DIR/jevbrain"
  echo -e "${GREEN}✔ Installed to $BIN_DIR/jevbrain!${RESET}"
fi

echo ""
echo -e "${GREEN}${BOLD}🎉 JEV BRAIN CLI READY TO USE ON YOUR LOCAL SYSTEM!${RESET}"
echo ""
echo -e "Quick Setup:"
echo -e "  1. Get your free Token Holder API key from: ${CYAN}https://jevbrain.world${RESET}"
echo -e "     (Connect wallet → Holder Hub → Jev Brain CLI → Generate CLI Key)"
echo -e "  2. Open the Jev Brain terminal session — it will ask you to paste your key:"
echo -e "     ${CYAN}jevbrain${RESET}"
echo -e "  3. Or configure the key directly, then run your first query:"
echo -e "     ${CYAN}jevbrain config set-key <your-api-key>${RESET}"
echo -e "     Then ask a one-shot query:"
echo -e "     ${CYAN}jevbrain \"Write a python script to check Solana token balances\"${RESET}"
echo -e "  4. Inside chat: ${CYAN}/credits${RESET} shows your live balance, ${CYAN}/model${RESET} switches AI model"
echo ""
