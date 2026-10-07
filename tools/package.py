"""Builds dist/ElectoralBoardTable.mcaddon (plus the two .mcpack files).

Usage: python3 tools/package.py
Double-click the .mcaddon on a device with Minecraft Bedrock to import both packs.
"""
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = {"ElectoralBP": "Electoral_BP.mcpack", "ElectoralRP": "Electoral_RP.mcpack"}
DIST = os.path.join(ROOT, "dist")


def add_dir(zf, src, prefix):
    for base, _, files in os.walk(src):
        for name in sorted(files):
            path = os.path.join(base, name)
            rel = os.path.relpath(path, src)
            zf.write(path, os.path.join(prefix, rel) if prefix else rel)


def main():
    os.makedirs(DIST, exist_ok=True)
    for pack in PACKS:
        with open(os.path.join(ROOT, "packs", pack, "manifest.json")) as f:
            json.load(f)  # fail fast on a broken manifest
    for pack, out in PACKS.items():
        with zipfile.ZipFile(os.path.join(DIST, out), "w", zipfile.ZIP_DEFLATED) as zf:
            add_dir(zf, os.path.join(ROOT, "packs", pack), "")
    addon = os.path.join(DIST, "ElectoralBoardTable.mcaddon")
    with zipfile.ZipFile(addon, "w", zipfile.ZIP_DEFLATED) as zf:
        for pack in PACKS:
            add_dir(zf, os.path.join(ROOT, "packs", pack), pack)
    print(f"Wrote {addon}")


if __name__ == "__main__":
    main()
