---
name: winappsdk-version-pin
description: The WinUI GUI must stay pinned to Microsoft.WindowsAppSDK 2.2.0 on this machine; 1.6/1.7 fail silently under the .NET 10 SDK.
metadata: 
  node_type: memory
  type: project
  originSessionId: 3687442b-87e0-4185-b13a-55edaf16adbc
---

`src/CollisionRenderer.Gui` pins `Microsoft.WindowsAppSDK` to **2.2.0**. This is intentional.

Under this machine's only SDK (.NET 10.0.300), the WindowsAppSDK **1.6/1.7** XAML markup
compiler is a net472 tool that **crashes silently** (exit 1, no output). 2.2.0 ships a net6
compiler that builds the `net8.0-windows10.0.19041.0` target cleanly (needs `LangVersion=latest`,
inherited from the repo `Directory.Build.props`).

**Why:** do not "downgrade" to 1.6/1.7 to match a tutorial — it will break the GUI build here.

**How to apply:** to use 1.6/1.7 you would have to install the .NET 8 SDK and pin it via
`global.json`. The app builds/runs unpackaged + self-contained
(`WindowsPackageType=None`, `WindowsAppSDKSelfContained=true`, `SelfContained=true`,
`RuntimeIdentifier=win-x64`), so no machine-wide WinAppSDK runtime is needed. Related: [[fidelity-source-of-truth]].
