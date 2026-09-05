#!/usr/bin/env bash
#
# The shell copy of the canonical scope-path rule must agree with the two Go
# copies (pkg/models/path_pattern.go and veans/internal/marshal/pathpattern).
# The cases below are the same table those two are tested against; when one
# changes, all three change.
#
#   ./canonical-path_test.sh

set -uo pipefail

# common.sh reads .veans.yml and requires a token; source only the pieces under
# test rather than standing up a fake repository for a pure string function.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail() { printf '::error::%s\n' "$*" >&2; exit 1; }
eval "$(sed -n '/^canonical_path()/,/^}/p;/^canonical_paths()/,/^}/p' "$script_dir/common.sh")"

failures=0
check() {
	local in="$1" want="$2" got
	got="$(canonical_path "$in")"
	if [[ "$got" != "$want" ]]; then
		printf 'canonical_path %-42s = %-40s want %s\n' "'$in'" "'$got'" "'$want'" >&2
		failures=$((failures + 1))
	fi
}

# Already canonical: git's own output must survive untouched.
check 'pkg/models/tasks.go'                     'pkg/models/tasks.go'
check 'captain-yard-web/src/server/db/repo.ts'  'captain-yard-web/src/server/db/repo.ts'
check '.github/workflows/test.yml'              '.github/workflows/test.yml'
check 'frontend/src/**'                         'frontend/src/**'

# Spellings that must collapse onto one identity.
check './pkg/models/tasks.go'                   'pkg/models/tasks.go'
check '/pkg/models/tasks.go'                    'pkg/models/tasks.go'
check './/pkg//models/tasks.go'                 'pkg/models/tasks.go'
check 'pkg/models/'                             'pkg/models'
check 'pkg\models\tasks.go'                     'pkg/models/tasks.go'
check 'pkg/models'                              'pkg/models'

# Not rebased: a sub-directory path stays wrong rather than being guessed at.
# "src/server/db/repo.ts" is a different file from
# "captain-yard-web/src/server/db/repo.ts", and pretending otherwise is what
# put two live leases on one file.
check 'src/server/db/repo.ts'                   'src/server/db/repo.ts'

# Degenerate input.
check ''                                        ''
check '/'                                       ''
check './'                                      ''

# canonical_paths drops blanks and refuses anything that escapes the repository.
got="$(printf '%s\n' './a.ts' '' 'b//c.ts' 'd/' | canonical_paths | tr '\n' ' ')"
if [[ "$got" != "a.ts b/c.ts d " ]]; then
	printf "canonical_paths = '%s' want 'a.ts b/c.ts d '\n" "$got" >&2
	failures=$((failures + 1))
fi

if printf '%s\n' '../outside.ts' | canonical_paths >/dev/null 2>&1; then
	echo "canonical_paths must refuse a path escaping the repository" >&2
	failures=$((failures + 1))
fi

if [[ $failures -gt 0 ]]; then
	echo "$failures case(s) failed" >&2
	exit 1
fi
echo "canonical_path: all cases pass"
