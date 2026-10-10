# Changelog

本檔遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [0.1.1] - 2026-10-10

### Fixed

- 依「Answer Key S1-6」試算表，修正中一至中三選擇題的正確答案（`js/plugins/questionDatabase.js` 的 `C_A`）。共更新 3244 題；答案表有 A–D 的 4061 題已全部對上。
- 中四至中六的答案表已有資料，但遊戲題庫尚未收錄這些年級，因此這次沒有改動。
- TSA 題目不在這份答案表內，維持原答案。

### 尚未能從答案表填上的題目

- 中一 1A02 英文第 41–100 題：答案表該欄是空白。
- 中二 2A02 英文第 38、40 題：答案表寫的是 `N`，不是 A–D。
- 中二 2A02 中文第 101–106 題、中三 3A02 英文第 101 題：答案表沒有對應題號。
