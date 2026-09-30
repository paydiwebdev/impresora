# Box Label Generator

Desktop app for generating and printing box labels from manufacturing orders.

This is the **Windows version**. The interface and logic are plain **HTML + JavaScript**, and a small **Python launcher** does the things a browser is not allowed to do (download a file and save it silently, skip print dialogs).

---

## Architecture

```
  iniciar.bat ──▶ launcher.py ──▶ Edge (app window, no address bar)
                      │                     │
                      │  http://127.0.0.1:8765
                      ▼                     ▼
              ┌───────────────┐      ┌───────────────────┐
              │ local server  │◀────▶│ index.html        │
              │  (stdlib)     │      │ app.js, style.css │
              └───────┬───────┘      │ xls-loader.js     │
                      │              └───────────────────┘
        POST /api/actualizar        GET /datos/pedidos.xls
                      │                     ▲
                      ▼                     │
               GitHub (raw) ──▶ datos/pedidos.xls
```

| Piece | Responsibility |
|---|---|
| `iniciar.bat` | Double-click entry point. Runs `launcher.py` with `pythonw` (no console window). |
| `launcher.py` | Serves the project folder, downloads the Excel from GitHub, opens Edge, stops everything when the window closes. |
| `index.html`, `style.css` | Screens and label layout (the `@page` rule in the CSS sets the paper size). |
| `app.js` | All application logic: order lookup, box calculation, label preview, editing, printing. |
| `xls-loader.js` | Defines `loadTicketData(file, onSuccess, onError)`, which turns the spreadsheet into an array of orders. |
| `lib/xlsx.full.min.js` | SheetJS, the library that reads `.xls` / `.xlsx` files in the browser. |

### Script load order

`index.html` loads the scripts in this order, and it matters:

1. `lib/xlsx.full.min.js`: SheetJS.
2. `xls-loader.js`: uses SheetJS to define `loadTicketData`.
3. `app.js`: calls `loadTicketData` (on the window `load` event).

### Data flow at startup

1. `app.js` loads the last saved `datos/pedidos.xls` immediately, so the app works offline.
2. In the background it calls `POST /api/actualizar`. The launcher downloads the newest Excel from GitHub.
3. If that succeeds, `app.js` reloads the data silently. If it fails (no internet), the local copy stays in use.

The launcher writes the download to a temporary file first and keeps the previous version as `pedidos_anterior.xls`, so a failed or corrupt download never destroys a working database.

---

## Requirements

- Windows 10/11 with **Microsoft Edge** (pre-installed).
- **Python 3.8+** from python.org. Tick *"Add python.exe to PATH"* during installation.
- Internet access only to refresh the database.

No `pip install` is needed: the launcher uses only the Python standard library.

---

## Folder layout

The whole app lives in the project root:

```
etiquetas/
├── iniciar.bat
├── launcher.py
├── index.html
├── style.css
├── app.js
├── xls-loader.js
├── lib/
│   └── xlsx.full.min.js
└── datos/             (created automatically)
    ├── pedidos.xls
    ├── pedidos_anterior.xls
    └── edge-perfil/   (private Edge profile used by the app window)
```

---

## Usage

1. Double-click **`iniciar.bat`**.
2. The app opens in its own window. The database loads and refreshes by itself; no buttons or file dialogs are involved.
3. Enter an order number, choose units per box, then generate, edit and print the labels.
4. Close the window to shut everything down.

**Recommended setup:** set the label printer as the **Windows default printer**. Printing uses Edge's `--kiosk-printing` flag, so `window.print()` sends the labels straight to that printer with no dialog and no preview.

**Shortcuts:** right-click `iniciar.bat` > *Send to* > *Desktop*. To start with Windows, put that shortcut in the folder opened by `Win + R` > `shell:startup`.

---

## Configuration

**`launcher.py`**

| Setting | Purpose |
|---|---|
| `URL_EXCEL` | Raw GitHub URL of the Excel file. |
| `PORT` | Local server port (default `8765`). |
| `DATA` | Where the Excel is stored (default `datos/` next to the script). Use an absolute path such as `Path(r"C:\Etiquetas")` to change it. |
| `EDGE_PATHS` | Locations searched for `msedge.exe`. |

**`app.js`**

| Setting | Purpose |
|---|---|
| `AUTO_ACTUALIZAR` | `true` refreshes the Excel on every startup; `false` only uses the local file. |
| `RUTA_EXCEL`, `RUTA_ACTUALIZAR` | Launcher endpoints used by the app. |

If the Excel columns change, update `xls-loader.js`. The launcher does not read the file contents.

---

## Troubleshooting

Open the developer tools inside the app window with **F12** (or `Ctrl + Shift + I`) and check the Console and Network tabs.

| Symptom | Likely cause and fix |
|---|---|
| Orders are never found; log says *"Todavía no hay base de datos local"* | First run with no internet, or the download failed. Connect and restart, or copy an Excel into `datos/pedidos.xls`. |
| Same, but `datos/pedidos.xls` exists | Type `typeof loadTicketData` in the Console. If it is not `"function"`, `xls-loader.js` or `lib/xlsx.full.min.js` failed to load (look for a 404 in the Network tab). If it is, the column names in the Excel probably changed. |
| The page loads but nothing updates | It was opened by double-clicking `index.html` (`file://`). Always start it with `iniciar.bat`. |
| The page looks unstyled | The `<link href>` in `index.html` must match the CSS file name exactly (`style.css` vs `styles.css`). |
| Print dialog still appears | The app was not opened through Edge (see next row), or it was opened outside the launcher. |
| A normal browser tab opens instead of an app window | Edge was not found in `EDGE_PATHS`. Add its real path. In this fallback there is no kiosk printing, and because `pythonw` has no console, the launcher can only be stopped from Task Manager. |
| Nothing happens on double-click | Python is not on the PATH, or `pythonw` is unavailable. Run `python launcher.py` in a terminal to see the error. |
| Second double-click opens a second window | Expected. If the port is already in use, the launcher assumes an instance is running and only opens another window. |
| Update fails with a message in the Console | The response text comes from the launcher (for example `HTTPError: HTTP Error 404`). Check `URL_EXCEL`. |

---

## Notes

- The server listens on `127.0.0.1` only, so it is not reachable from other machines.
- Because the app lives in the project root, the launcher serves that whole folder to the local machine (including `launcher.py`). This is harmless on `127.0.0.1`, but keep secrets out of the folder.
- `/datos/` serves files by name only (`Path(...).name`), so it cannot be used to read files outside `datos/`.
- The app window uses its own Edge profile (`datos/edge-perfil/`): no logins, extensions or settings are shared with the regular browser.
