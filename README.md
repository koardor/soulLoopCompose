# 魂环进化 - Android APK 构建说明

## 方法一：Android Studio（推荐，最简单）

1. 下载安装 [Android Studio](https://developer.android.com/studio)
2. 打开 Android Studio → `File` → `Open` → 选择本项目文件夹
3. 等待 Gradle Sync 完成（首次需要下载依赖，需要网络）
4. 菜单栏点击 `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
5. APK 生成在 `app/build/outputs/apk/debug/app-debug.apk`

## 方法二：命令行构建

前提：已安装 Android Studio 或 Android SDK（ANDROID_HOME 已配置）

```bash
# Windows
gradlew.bat assembleDebug

# macOS / Linux
./gradlew assembleDebug
```

APK 输出路径：`app/build/outputs/apk/debug/app-debug.apk`

## 项目信息

- **应用名称**：魂环进化
- **包名**：com.game.huanhuan
- **最低安卓版本**：Android 8.0（API 26）
- **目标版本**：Android 13（API 33）
- **版本号**：1.3

## 注意事项

- 此 APK 为 Debug 签名，可直接安装到手机（需开启"允许未知来源"）
- 若需要发布到应用商店，请使用 Release 签名
- 游戏数据（分数等）存储在 WebView 的 localStorage 中
