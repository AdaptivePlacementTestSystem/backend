#!/usr/bin/env bash
# devkit — định nghĩa dùng chung cho mọi hook. Nguồn duy nhất của quy ước nhánh/commit (Quyết định #36).
# Luồng: feat|fix|docs|chore|test|refactor/<slug> -> develop -> main ; hotfix/<slug> -> main (rồi merge ngược về develop).

DEVKIT_PROTECTED_BRANCHES="main develop"
DEVKIT_TYPES="feat|fix|docs|test|chore|refactor"
DEVKIT_SLUG='[a-z0-9]+(-[a-z0-9]+)*'
DEVKIT_BRANCH_RE="^((${DEVKIT_TYPES})|hotfix)/${DEVKIT_SLUG}$"
DEVKIT_COMMIT_RE="^(${DEVKIT_TYPES})(\([a-z0-9-]+\))?!?: (.+)$"
DEVKIT_MIN_DESC=10
DEVKIT_MAX_SUBJECT=72
DEVKIT_MAX_FILE_MB="${DEVKIT_MAX_FILE_MB:-5}"
DEVKIT_GENERIC_DESC="update|updates|fix|fixes|fix bug|fix bugs|bug fix|change|changes|wip|test|tests|stuff|misc|minor"

dk_err()  { printf 'devkit [LOI] %s\n' "$*" >&2; }
dk_warn() { printf 'devkit [CANH BAO] %s\n' "$*" >&2; }

dk_is_protected() {
  case " $DEVKIT_PROTECTED_BRANCHES " in *" $1 "*) return 0 ;; esac
  return 1
}

dk_check_branch_name() { [[ "$1" =~ $DEVKIT_BRANCH_RE ]]; }

# Kiểm tra 1 dòng tiêu đề commit: Conventional Commits + mô tả có nghĩa (rubric TC2.4).
dk_check_subject() {
  local s="$1"
  case "$s" in "Merge "*|"Revert \""*) return 0 ;; esac
  if ! [[ "$s" =~ $DEVKIT_COMMIT_RE ]]; then
    dk_err "Commit message sai chuan Conventional Commits: '$s'"
    dk_err "  Dang dung: <loai>(<pham-vi>): <mo ta>   voi loai = ${DEVKIT_TYPES//|/, }"
    return 1
  fi
  local desc="${BASH_REMATCH[3]}" lower
  if (( ${#s} > DEVKIT_MAX_SUBJECT )); then
    dk_err "Tieu de commit dai ${#s} ky tu (toi da $DEVKIT_MAX_SUBJECT): '$s'"
    return 1
  fi
  if (( ${#desc} < DEVKIT_MIN_DESC )); then
    dk_err "Mo ta commit qua ngan (duoi $DEVKIT_MIN_DESC ky tu), hay mo ta thay doi that su: '$s'"
    return 1
  fi
  lower=$(printf '%s' "$desc" | tr '[:upper:]' '[:lower:]')
  if [[ "$lower" =~ ^(${DEVKIT_GENERIC_DESC})$ ]]; then
    dk_err "Mo ta commit chung chung ('$desc'), khong dat yeu cau 'commit message co y nghia': '$s'"
    return 1
  fi
  return 0
}

dk_has_gitleaks() { command -v gitleaks >/dev/null 2>&1; }

dk_repo_root() { git rev-parse --show-toplevel; }
