# Body-fat reference asset provenance

- Authority: D-S14-1 (2026-10-30).
- Source: YBS SYSTEM repository, `public/body-fat/` (read-only; the local checkout path is supplied at run time through `--source-root` or `BODY_FAT_SOURCE_ROOT`).
- Source repository HEAD observed read-only: `db9749a282a3acc37a967c0ce4763d88460b458b`.
- Scope hashed: original image files under `female/`, `male/`, and `male-cinematic/` only. No original image binaries are committed. No YBS terms-and-conditions card or design was copied.
- Output convention: optimized derivatives only under `public/images/body-fat/`; no originals are committed. A reproducible media script must read this source directory read-only, preserve the originals, emit WebP/AVIF at no more than 2x display width, and target <=150 KB per derivative.
- Each original is listed with its original byte length and SHA-256 for provenance verification. Hashes identify source inputs; they do not indicate that image binaries are present in this repository.

| Relative source path     |   Bytes | SHA-256                                                            |
| ------------------------ | ------: | ------------------------------------------------------------------ |
| `female/18.png`          | 1106633 | `1009ca1d22759b3abfd96ff68311e9903c6f414dfd398476a4af7d61a493a9cc` |
| `female/20.png`          | 1085397 | `48ba791dd86b81dec0076ab85679f7e4ce7e93a722d569d018ecf30cacdbece5` |
| `female/22.png`          | 1047716 | `01a01acd515f718b589012965a27d03985544a4b72348fbf80e614ba9ac68cdd` |
| `female/25.png`          | 1093522 | `bd8032bc107f334b50c4c6a0db44f4b7a3c154ca4b47aac3344497208bfaa13e` |
| `female/28.png`          | 1001523 | `6d0752b1a73ada46b5a3d20370c284251f8f597e318d1cc2f4648ded5f676ff9` |
| `female/30.png`          | 1149829 | `9b48b0e6034a0d83570d4d8151c3ba2650dd1b5b4aa376e3b7f94e56c746bfc9` |
| `female/32.png`          | 1138189 | `028f41ec73ce06729c4b1e01b6895329b4c60301aa4e2d0ee0bd3b7822549d75` |
| `female/35.png`          | 1062499 | `d1952ea113aa703fd692d8f2e944e6aef644123485b588cc0f49543ff9234fc0` |
| `female/38.png`          | 1023346 | `51b677f19f43544f04210758a6b94f33ee4987eaa83414c7da8b49edbdee1f52` |
| `female/40.png`          | 1018340 | `f1d57857f505c18e3c5a61153aff84a001dc185d147116a87dee28d04f18c08b` |
| `female/42.png`          |  944161 | `a748358f1fcb2ba87675ca33e283c68993f4167a6d5d831a76f7c362109ac298` |
| `female/45.png`          | 1038829 | `43fb7102998490217dfbc1586e249a58b05d52a7b919cddc32e967e94c7a8837` |
| `female/50.png`          |  763576 | `25e2af7e2172cad36154eefb111acd5e2e31a6afbf95b7c9d94b7937ecdcbff9` |
| `male-cinematic/10.png`  |  838888 | `99426e5e09603203907b7dfc4977c4bed7d348d14909f6de7dbcb9bfe44fb19e` |
| `male-cinematic/12.png`  |  919612 | `71265f2d3c5efe32ef72689193eb6cde9c2b197a45dd45a1c8dd82aeeea2b3c5` |
| `male-cinematic/15.jpeg` | 1621846 | `111307790a56561efbeb523727749db237555cd4acccd1829b417e8edb1833b2` |
| `male-cinematic/15.png`  | 2068057 | `03a7007fe4c43628818b4822192b685798cc94bcb26b673e18c95ae10d7f9b31` |
| `male-cinematic/18.jpeg` | 1684820 | `835e8f376282c17143ed461c69f20f427da572da8ba381f545f5ff42c028aea6` |
| `male-cinematic/18.png`  | 2360395 | `c68415a2840e1da4e288ec11d65d1e0c705b3e3472b2ae855e9144fe06a5c933` |
| `male-cinematic/20.jpeg` | 1682921 | `bbdf07390145cf83ab07ce0a00e7737db2802ebde657a715b9c4e04b66b16ba8` |
| `male-cinematic/20.png`  | 2008496 | `6e477fb565af9919f6f46ba6819b56128dc05fc754b2e12e47b16edac1ff4061` |
| `male-cinematic/22.png`  |  959853 | `9df1eba3eec17a8a122711ca764f6f661af9405386c87c72581f6ca11bb66c71` |
| `male-cinematic/25.png`  |  924145 | `352a72f13b05ab8b3cfcda419f6c142148ac8f08e5afec2db2c0b5266cc8a26a` |
| `male-cinematic/28.png`  | 2588474 | `896c13e089f6aac341b4bc6e3c8337cd408e2fd388c1ee7f0a8f009aab0a2e07` |
| `male-cinematic/30.png`  | 1523099 | `7e1946de16a262cc9c72ee3e5600856b41440186a340c1000a360292e76ed74e` |
| `male-cinematic/32.png`  |  948915 | `0efab16f7b324f07822962a97943c9c00fec14ba537d9be8f7df23c906da9ac1` |
| `male-cinematic/35.png`  |  941290 | `b8b73326efad9473764b25522be9b7827a01e54745c5a35319aedf347b71a6fd` |
| `male-cinematic/40.png`  | 2793581 | `525f637586cc6fca98109089fe699ee05470b8f9791eaa09e840b5dbc1c3490f` |
| `male/10.png`            | 1982763 | `aa77d8d455e34473589a1b400f22dd3375e3a88fd30cc5f7c0f3868fc4eee496` |
| `male/12.png`            | 1000660 | `dc01e02ef390da55040f3dc5a650ca52c1dbc69be8420c97b043b6ba9632939c` |
| `male/15.png`            |  950984 | `686b03b08bf740e74cf2fa2068d27413ef7e1aaeae2fb9733a07817a993b8951` |
| `male/18.png`            |  746779 | `821b8468afbfb2609fd3f1076be9bd9527d9bb1233a63ac6e4af1ceb6acead31` |
| `male/20.png`            |  904911 | `f88dd85af14d8aebab73805da7b24e6c35739027203fd08c0dd98791aa5f7659` |
| `male/22.png`            |  937780 | `f80704e8de5a15f0d0b0d16d9415e71700f5ba927c09725092d43e6fc38aacbd` |
| `male/25.png`            |  972740 | `f59a9d52a9ec5a65005b33dec88d81d8ffc80beb027111f4e687021ca81e58e2` |
| `male/28.png`            | 1078585 | `4c097afe2e3a7177c6954ea1effd6c4fe8ce478ce0f68d145d02419d547e35d4` |
| `male/30.png`            | 1164190 | `91764a6d3420a8f80a53b82b72740f169df2f55d4e52b9cfc75f1c48b8543700` |
| `male/32.png`            |  916738 | `379c81ae60213e0bfef4eb0f383dad2cbdc36523b14d5145e77fe45e2d225c70` |
| `male/35.png`            | 1143434 | `2e665355a41f20ce398e1eac78ad860d5dd1b2d59258c1e2f2dc9a8b275ba8db` |
| `male/40.png`            |  981945 | `894bc7ec31e0bef7933b15f2abd475e9dc554b2692684224a8d176c2299802dc` |

## S14 derivative verification

- Generator: `scripts/media/optimize-body-fat-assets.mjs`; source inventory and every byte length/SHA-256 above are checked before encoding. The full source inventory (including the unused `male-cinematic/` files) was verified: 40/40 files matched.
- Encoder runtime: FFmpeg `9.0.2-full_build-www.gyan.dev`, with `libwebp` and `libaom-av1` plus the WebP/AVIF muxers available. Single-thread encoding, stripped metadata, fixed scaling and fixed quality steps keep repeated runs deterministic on this encoder build.
- Derivative settings: maximum image display width 384 CSS pixels, maximum source width 768 pixels (2x), preserved aspect ratio, and a 150,000-byte budget per file. Only `female/` and standard `male/` sources are emitted; `male-cinematic/` is hash-checked but never emitted.
- Verified output: 25 standard-series sources produced 25 WebP and 25 AVIF files at 768 × 658. Each is below 150,000 bytes; smallest 6,260 bytes, largest 20,380 bytes. The catalog records each derivative SHA-256 and its matching source SHA-256.
- The tracked asset set contains only optimized `.webp`/`.avif` derivatives under `public/images/body-fat/`; original binaries remain outside this repository.
