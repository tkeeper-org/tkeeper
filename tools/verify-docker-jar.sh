#!/bin/sh
set -eu

jar=$1
expected_profile=$2
expected_sha256=${3:-}

if [ -z "$expected_sha256" ]; then
    echo "Expected JAR SHA-256 is required" >&2
    exit 1
fi

actual_sha256=$(sha256sum "$jar")
actual_sha256=${actual_sha256%% *}

if [ "$actual_sha256" != "$expected_sha256" ]; then
    echo "Docker JAR SHA-256 mismatch" >&2
    exit 1
fi

manifest_dir=$(mktemp -d)
trap 'rm -rf "$manifest_dir"' EXIT HUP INT TERM
(cd "$manifest_dir" && jar xf "$jar" META-INF/MANIFEST.MF)
actual_profile=$(sed -n 's/^TKeeper-Profile: //p' "$manifest_dir/META-INF/MANIFEST.MF" | tr -d '\r')

if [ "$actual_profile" != "$expected_profile" ]; then
    echo "Docker JAR profile mismatch: expected $expected_profile, got $actual_profile" >&2
    exit 1
fi

echo "Verified Docker JAR: profile=$actual_profile sha256=$actual_sha256"
