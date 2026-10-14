#!/bin/bash
# GreatTest Sync Script for Aliza (Linux)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="/home/aliza/Music/fyp/GreatTest"
DEST_DIR="$SCRIPT_DIR/code"

echo "=========================================="
echo " Syncing GreatTest -> just-working/code"
echo "=========================================="
echo "Source: $SOURCE_DIR"
echo "Dest:   $DEST_DIR"
echo ""

mkdir -p "$DEST_DIR"

rsync -av --delete \
  --exclude='.git' \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='.env' \
  --exclude='.pytest_cache' \
  --exclude='.ruff_cache' \
  --exclude='.llm_cache' \
  --exclude='outputs' \
  --exclude='repos' \
  --exclude='uploads' \
  "$SOURCE_DIR/" "$DEST_DIR/"

echo ""
echo "=== File Sync Complete! ==="
echo ""

cd "$SCRIPT_DIR"
git status --short

echo ""
read -p "Do you want to commit and push these changes to GitHub? (y/n): " PUSH_CHOICE
if [[ "$PUSH_CHOICE" =~ ^[Yy]$ ]]; then
    read -p "Enter commit message (press Enter for 'Sync updates from Aliza'): " COMMIT_MSG
    if [ -z "$COMMIT_MSG" ]; then
        COMMIT_MSG="Sync updates from Aliza"
    fi
    git add .
    git commit -m "$COMMIT_MSG"
    git push origin main
    echo ""
    echo "=== Changes pushed to GitHub successfully! ==="
else
    echo "Changes synced locally. Not pushing to GitHub."
fi

echo ""
read -p "Press Enter to finish..."
