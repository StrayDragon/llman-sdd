# Harbor's Pi adapter sources ~/.nvm/nvm.sh then nvm+npm installs Pi.
# This image already has Pi on PATH; stubs keep allowlist from hitting GitHub/npm.
export PATH="/root/.bun/bin:${PATH:-}"
nvm() { return 0; }
npm() {
  if [ "${1:-}" = '-v' ] || [ "${1:-}" = '--version' ]; then
    echo "10.9.2"
    return 0
  fi
  return 0
}
