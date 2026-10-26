from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import sys
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from .common import ROOT,ASSETS,load,write_json


def doctor():
    from .render import picture
    from .layout import font
    from .video import ffmpeg
    import subprocess
    required=["brand/logo.png","brand/name.png","brand/number.png","brand/wordmark.png","brand/space-hero.png","brand/space-content.png"]
    for name in required:picture(name)
    for bold in [False,True]:font(32,bold)
    result=subprocess.run([ffmpeg(),"-version"],capture_output=True,text=True,check=True)
    print(f"Python {sys.version.split()[0]}; fonts and {len(required)} brand images OK")
    print(result.stdout.splitlines()[0])
    print("Local tools ready. Gemini key is only needed for NEW narration.")


def main():
    parser=argparse.ArgumentParser(description="Da Vinci 4744: presentations and interactive video")
    sub=parser.add_subparsers(dest="command",required=True)
    sub.add_parser("doctor",help="Check local fonts, assets and FFmpeg")
    new=sub.add_parser("new",help="Create an editable project brief and content document")
    new.add_argument("name");new.add_argument("--title",default="המצגת החדשה שלנו")
    for name in ["check","deck","tts","video","player"]:
        command=sub.add_parser(name)
        command.add_argument("content",type=Path)
        if name in {"deck","video","player"}:command.add_argument("--out",type=Path,required=True)
        if name in {"tts","video"}:command.add_argument("--voices",type=Path);command.add_argument("--model",default="gemini-3.8-flash-tts")
        if name=="tts":command.add_argument("--key-file",type=Path)
        if name=="video":
            command.add_argument("--fps",type=int,default=30);command.add_argument("--width",type=int,default=1280)
            command.add_argument("--workers",type=int,default=2);command.add_argument("--draft",action="store_true")
            command.add_argument("--seconds",type=float);command.add_argument("--limit",type=int)
        if name=="player":command.add_argument("--video",type=Path,required=True)
    serve=sub.add_parser("serve",help="Serve an output folder locally")
    serve.add_argument("folder",type=Path);serve.add_argument("--port",type=int,default=8000)
    keygen=sub.add_parser("lti-keygen",help="Create a private RSA signing key for the LTI tool")
    keygen.add_argument("--out",type=Path,required=True)
    lti=sub.add_parser("lti-serve",help="Serve the learning library with optional LTI integration")
    lti.add_argument("--config",type=Path,required=True)
    lti.add_argument("--host",default="127.0.0.1");lti.add_argument("--port",type=int,default=8000)
    args=parser.parse_args()
    try:
        if args.command=="doctor":doctor();return
        if args.command in {"lti-keygen","lti-serve"}:
            try:
                if args.command=="lti-keygen":
                    from .lti.protocol import generate_key
                    generate_key(args.out)
                    print(f"Created private LTI signing key: {args.out}")
                else:
                    from .lti.app import create_app
                    from .lti.config import Settings
                    from waitress import serve as serve_lti
                    app=create_app(Settings.load(args.config))
                    print(f"LTI library listening on {args.host}:{args.port}",flush=True)
                    serve_lti(app,host=args.host,port=args.port,threads=8,clear_untrusted_proxy_headers=True)
            except ImportError:
                raise ValueError("Install LTI dependencies with: .venv/bin/python -m pip install -e '.[lti]'")
            return
        if args.command=="new":
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]*",args.name):raise ValueError("Use a lowercase project name with hyphens")
            folder=ROOT/"projects"/args.name
            if folder.exists():raise ValueError(f"Project already exists: {folder}")
            folder.mkdir(parents=True)
            doc=json.loads((ROOT/"templates/starter.json").read_text(encoding="utf-8"))
            doc["title"]=args.title;doc["scenes"][0]["title"]=args.title
            write_json(folder/"content.json",doc)
            shutil.copy2(ROOT/"templates/brief.md",folder/"brief.md")
            print(f"Project ready: {folder}");return
        if args.command=="serve":
            if not args.folder.is_dir():raise ValueError("Folder does not exist")
            from .serve import RangeHandler
            handler=partial(RangeHandler,directory=str(args.folder.resolve()))
            server=ThreadingHTTPServer(("127.0.0.1",args.port),handler)
            print(f"Open http://127.0.0.1:{args.port}/ (Ctrl+C to stop)",flush=True)
            try:server.serve_forever()
            except KeyboardInterrupt:server.server_close()
            return
        doc=load(args.content)
        if args.command=="check":
            from .layout import elements
            for i,scene in enumerate(doc["scenes"]):elements(scene,i,len(doc["scenes"]))
            print(f"Content and text fit OK: {len(doc['scenes'])} scenes");return
        if args.command=="deck":
            from .deck import build
            build(doc,args.out)
        elif args.command=="tts":
            from .tts import generate
            generate(doc,args.voices or args.content.parent/"audio/voices",args.key_file,args.model)
        elif args.command=="video":
            from .video import render
            render(doc,args.out,args.voices or args.content.parent/"audio/voices",fps=args.fps,width=args.width,
                   workers=args.workers,draft=args.draft,seconds=args.seconds,limit=args.limit,model=args.model)
        elif args.command=="player":
            from .player import build_player
            build_player(doc,args.video,args.out)
    except (ValueError,FileNotFoundError,RuntimeError) as error:
        parser.exit(1,f"Error: {error}\n")


if __name__=="__main__":main()
