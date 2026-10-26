"""Local, provider-neutral SCORM 1.2 smoke test with simulated attempts."""
from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
import xml.etree.ElementTree as ET
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from zipfile import ZipFile

from davinci_creator.serve import RangeHandler

PAGE = """<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>בדיקת SCORM מקומית</title><style>body{margin:0;background:#09172b;color:#fafcff;font:16px Arial}header{padding:10px 20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}button{padding:8px 16px;cursor:pointer}iframe{display:block;border:0;width:100%;height:calc(100vh - 100px)}pre{margin:0;direction:ltr;text-align:left;font-size:12px}</style>
<header><strong>בדיקת SCORM מקומית · SCORM 1.2 emulator</strong><button id="new">ביצוע חדש</button><span>רענון הדף ממשיך את הביצוע הנוכחי.</span><pre id="report">טרם התקבל דיווח</pre></header>
<script>
const storageBase=__KEY__,attempt=localStorage.getItem(storageBase+':attempt')||'0';
const key=storageBase+':'+attempt;let state;try{state=JSON.parse(localStorage.getItem(key)||'null')}catch{}
const report=document.querySelector('#report');
function persist(value){state=value;localStorage.setItem(key,JSON.stringify(value));report.textContent=JSON.stringify({status:value['cmi.core.lesson_status'],score:value['cmi.core.score.raw']})}
const values=state||{'cmi.core.lesson_mode':'normal','cmi.core.lesson_status':'not attempted','cmi.student_data.mastery_score':String(__MASTERY__)};
window.API={LMSInitialize:()=> 'true',LMSGetValue:name=>values[name]||'',LMSSetValue:(name,value)=>{values[name]=value;return 'true'},LMSCommit:()=>{persist(values);return 'true'},LMSFinish:()=>{persist(values);return 'true'}};
// An unloading child can still save the old attempt. Give each new one its own key.
document.querySelector('#new').onclick=()=>{localStorage.setItem(storageBase+':attempt',String(Number(attempt)+1));location.reload()};
</script><iframe src="/package/index.html" title="פיילוט SCORM" allow="fullscreen" allowfullscreen></iframe></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--port", type=int, default=8770)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="davinci-scorm-demo-") as directory:
        root = Path(directory)
        package = root / "package"
        with ZipFile(args.archive) as archive:
            for name in archive.namelist():
                if not (package / name).resolve().is_relative_to(package.resolve()):
                    parser.error("Unsafe archive path")
            archive.extractall(package)
        manifest = ET.parse(package / "imsmanifest.xml")
        mastery = float(manifest.findtext(".//{http://www.adlnet.org/xsd/adlcp_rootv1p2}masteryscore", "80"))
        page = PAGE.replace("__KEY__", json.dumps("scorm-demo:" + hashlib.sha256(args.archive.read_bytes()).hexdigest()))
        page = page.replace("__MASTERY__", str(mastery))
        (root / "index.html").write_text(page, encoding="utf-8")

        class Handler(RangeHandler):
            def end_headers(self):
                self.send_header("Cache-Control", "no-store")
                super().end_headers()

        server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(root)))
        print(f"Local SCORM test: http://127.0.0.1:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
