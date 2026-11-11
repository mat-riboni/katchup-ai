#!/bin/zsh
cd -- "${0:A:h}"
node_bin=$(command -v node)
if [[ -z "$node_bin" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node(N); do
    if [[ -x "$candidate" ]]; then node_bin="$candidate"; fi
  done
fi
if [[ -z "$node_bin" ]]; then
  print 'Node.js 22.9 or newer is required. Install Node.js, then reopen this launcher.'
  read -k 1 '?Press any key to close.'
  exit 1
fi
"$node_bin" scripts/start-demo.mjs
if [[ $? -ne 0 ]]; then
  read -k 1 '?Press any key to close.'
  exit 1
fi
