#!/bin/sh
# Harbor Pi install curls the nvm installer. Emit a no-op installer instead.
for arg in "$@"; do
  case "$arg" in
    *nvm-sh/nvm*)
      cat <<'EOF'
#!/bin/bash
mkdir -p "${HOME}/.nvm"
EOF
      exit 0
      ;;
  esac
done
exec /usr/bin/curl "$@"
