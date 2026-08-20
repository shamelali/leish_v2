#!/bin/bash
cd /home/shamelali/leish_v2
echo '=== BRANCH ANALYSIS ==='
git branch -a
echo ''
git log --all --graph --oneline --decorate -20
echo ''
echo 'Checking merge conflicts:'
current=$(git branch --show-current)
for branch in $(git branch --format='%(refname:short)' | grep -v "^$current$"); do echo "Testing $branch"; git merge-tree $(git merge-base $current $branch) $current $branch 2>&1 | head -20; done
echo 'Divergence:'
for branch in $(git branch --format='%(refname:short)'); do ahead=$(git rev-list --count main..$branch 2>/dev/null || echo '?'); behind=$(git rev-list --count $branch..main 2>/dev/null || echo '?'); echo "$branch ahead $ahead behind $behind"; done
