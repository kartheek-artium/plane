#!/bin/bash
# Build + push production Plane images (v1.4.2 + cross-project-parent patch) to ECR.
# Run on the Mac from the repo root:  bash build-prod-images.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REGION=ap-south-1
ACCOUNT=251986138033
ECR=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com
TAG=v1.4.2-xproject.2
WT=../../plane-v1.4.2-prod

echo "==> ECR login"
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR

echo "==> Preparing clean v1.4.2 worktree at $WT"
if [ ! -d "$WT" ]; then
  git worktree add --detach "$WT" v1.4.2
fi
cd "$WT"
git checkout -q --detach v1.4.2
git reset -q --hard && git clean -fdq
git apply "$OLDPWD/deploy/prod-v1.4.2-all-features.patch"
echo "    patched files:"; git status --short | sed 's/^/      /'

echo "==> Building backend ($TAG) — ~3-5 min"
docker build --platform linux/amd64 -f apps/api/Dockerfile.api -t $ECR/plane-backend:$TAG apps/api

echo "==> Building frontend ($TAG) — 15-25 min under amd64 emulation, be patient"
docker build --platform linux/amd64 -f apps/web/Dockerfile.web -t $ECR/plane-frontend:$TAG .

echo "==> Pushing"
docker push $ECR/plane-backend:$TAG
docker push $ECR/plane-frontend:$TAG

echo
echo "DONE. Images:"
echo "  $ECR/plane-backend:$TAG"
echo "  $ECR/plane-frontend:$TAG"
