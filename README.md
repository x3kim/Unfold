<div align="center">
  <img src="logo.png" alt="Unfold App Logo" width="128">
  <h1>Unfold ✨</h1>
  <p>
    A minimalist desktop utility to flatten a nested folder structure into a single directory.
  </p>
  <p>
    <a href="https://github.com/x3kim/unfold/releases"><img src="https://img.shields.io/github/v/release/x3kim/unfold?label=version" alt="Version"></a>
    <img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build Status">
    <a href="https://github.com/x3kim/unfold/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-purple" alt="License"></a>
  </p>
</div>

<!-- WICHTIG: Ersetze dieses Platzhalterbild durch einen echten Screenshot oder ein animiertes GIF deiner App! -->
<div align="center">
  <img src="https://via.placeholder.com/800x500.png?text=App+Screenshot+or+GIF+here" alt="App Screenshot">
  <br>
  <em>(Pictured: Main screen in light mode and the results screen in dark mode)</em>
</div>

---

## 🚀 Key Features

*   📂 **Effortless Folder Flattening**: Simply select a folder, and Unfold recursively finds every file to bring it to the top level.
*   ⚠️ **Smart Conflict Handling**: If files with the same name exist in different subfolders, Unfold intelligently renames them (e.g., `[conflict-1]-image.jpg`) so you never lose a file.
*   📝 **Detailed & Interactive Logging**: After every operation, you get a beautiful, interactive summary right within the app. See exactly which files were copied, renamed, or encountered errors, all color-coded for clarity.
*   💾 **Markdown Documentation**: A detailed `documentation.md` file is automatically generated in the output folder, providing a permanent record of the operation.
*   🎨 **Modern & Minimalist UI**: A clean, intuitive interface with both **Light & Dark modes** to match your system's theme.
*   🔒 **Safe & Non-Destructive**: Your original files and folders are **never** modified. Unfold works exclusively on copies in a newly created output folder (e.g., `MyFolder_unfolded`).

## ⚙️ Getting Started

There are two ways to use Unfold: by installing the ready-to-use application or by running it from the source code.

### For Users (Installation)

1.  Go to the **[Releases Page](https://github.com/x3kim/unfold/releases)**.
2.  Download the latest version for your operating system (`.exe` for Windows, `.dmg` for macOS, or `.AppImage` for Linux).
3.  Run the installer or the application file. That's it!

### For Developers (From Source)

If you want to contribute or run the app from the source code, follow these steps.

1.  **Prerequisites**: Make sure you have [Node.js](https://nodejs.org/) installed on your system.

2.  **Clone & Install**:
    ```bash
    # Clone the repository
    git clone https://github.com/x3kim/unfold.git
    
    # Navigate into the project directory
    cd unfold
    
    # Install the necessary dependencies
    npm install
    ```

3.  **Run & Build**:
    ```bash
    # Run the application in development mode
    npm start
    
    # Build the packaged application for distribution
    npm run build
    ```
    The final application will be located in the `dist/` directory.

## 🛠️ Built With

*   [**Electron**](https://www.electronjs.org/) - The framework for building cross-platform desktop apps with web technologies.
*   [**Node.js**](https://nodejs.org/) - For all the file system magic in the backend.
*   **HTML5, CSS3, Vanilla JavaScript** - No heavy frameworks, just pure web tech for a lightweight and fast UI.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 x3kim