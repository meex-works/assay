#!/bin/sh
# pump.fun's published IDLs, pinned to the commit the write-up used. Not vendored: the source repo has no license.
set -e
REF=639b87f
mkdir -p idl
for f in pump.json pump_amm.json pump_fees.json; do
  curl -fsSL "https://raw.githubusercontent.com/pump-fun/pump-public-docs/$REF/idl/$f" -o "idl/$f"
done
echo "idl/ at pump-fun/pump-public-docs@$REF"
