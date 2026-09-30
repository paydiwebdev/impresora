"""
Lanzador de la app de etiquetas (index.html + JS se quedan como están).

Python hace lo que el navegador no puede:
  * sirve la carpeta www/ en http://127.0.0.1:8765 (no más file://)
  * POST /api/actualizar  -> descarga el Excel de GitHub y lo guarda en datos/
  * GET  /datos/pedidos.xls -> entrega ese Excel a la app JS
  * abre Edge como ventana de aplicación, con impresión directa (sin diálogo)

Solo usa la biblioteca estándar: no hay que instalar nada más que Python.
"""
import http.server
import os
import shutil
import subprocess
import sys
import threading
import urllib.request
import webbrowser
from pathlib import Path
from urllib.parse import unquote

# ============================================================
# CONFIGURACIÓN
# ============================================================
URL_EXCEL = ("https://raw.githubusercontent.com/paydiwebdev/impresora/"
             "refs/heads/main/www/tmp_excel.xls")
PORT = 8765

BASE = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
WWW = BASE / "www" if (BASE / "www" / "index.html").exists() else BASE
DATA = BASE / "datos"                     # cambie por Path(r"C:\Etiquetas") si quiere
EXCEL = DATA / "pedidos.xls"

EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


# ============================================================
# DESCARGA Y GUARDADO DEL EXCEL
# ============================================================
def descargar_excel():
    DATA.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(URL_EXCEL, headers={"User-Agent": "etiquetas-launcher"})
    with urllib.request.urlopen(req, timeout=30) as r:      # lanza HTTPError si es 404, etc.
        contenido = r.read()
    if not contenido:
        raise ValueError("El archivo descargado está vacío.")

    tmp = EXCEL.with_name(EXCEL.name + ".tmp")
    tmp.write_bytes(contenido)                              # primero a temporal
    if EXCEL.exists():                                      # copia de seguridad de la versión anterior
        shutil.copy2(EXCEL, DATA / "pedidos_anterior.xls")
    tmp.replace(EXCEL)                                      # y se mueve a su sitio


# ============================================================
# SERVIDOR LOCAL
# ============================================================
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WWW), **kwargs)

    def translate_path(self, path):
        limpio = path.split("?", 1)[0]
        if limpio.startswith("/datos/"):
            nombre = Path(unquote(limpio[len("/datos/"):])).name   # .name evita salirse de la carpeta
            return str(DATA / nombre)
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path == "/api/actualizar":
            try:
                descargar_excel()
                self._responder(200, "ok")
            except Exception as e:
                self._responder(500, f"{type(e).__name__}: {e}")
        else:
            self._responder(404, "not found")

    def _responder(self, codigo, texto):
        cuerpo = texto.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, *args):        # sin ruido en consola
        pass


# ============================================================
# ABRIR EDGE
# ============================================================
def abrir_edge(url):
    exe = next((p for p in EDGE_PATHS if os.path.exists(p)), None)
    if not exe:
        webbrowser.open(url)
        return None
    return subprocess.Popen([
        exe,
        f"--app={url}",                                   # ventana sin barra de direcciones
        "--kiosk-printing",                               # window.print() imprime directo, sin diálogo
        f"--user-data-dir={DATA / 'edge-perfil'}",        # perfil propio: así los flags siempre se aplican
        "--no-first-run",
    ])


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    url = f"http://127.0.0.1:{PORT}/"
    try:
        servidor = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:                       # ya hay una instancia en marcha: solo abrir la ventana
        abrir_edge(url)
        return
    threading.Thread(target=servidor.serve_forever, daemon=True).start()

    edge = abrir_edge(url)
    try:
        if edge:
            edge.wait()                   # al cerrar la ventana, se apaga todo
        else:
            threading.Event().wait()      # sin Edge: seguir hasta Ctrl+C
    except KeyboardInterrupt:
        pass
    servidor.shutdown()


if __name__ == "__main__":
    main()
