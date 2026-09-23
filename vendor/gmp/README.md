# GMP 6.3.0

`gmp-6.3.0.tar.xz` is the source archive supplied for this project. Both production
and integration Docker builds copy it from this directory and run
`sha256sum --check --strict SHA256SUMS` before extracting or executing its contents.
No GMP download is performed during the build.

SHA-256: `a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898`

To verify locally on macOS:

```sh
cd vendor/gmp
shasum -a 256 --check SHA256SUMS
```

When upgrading GMP, review the replacement archive, update its checksum and the
version paths in both Dockerfiles in the same change. The checksum pins the supplied
bytes; it is not a publisher signature. Licensing files are included in the archive
(`COPYING`, `COPYING.LESSERv3`, `COPYINGv2`).
