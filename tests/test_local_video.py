import base64
import copy
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from PIL import Image
from davinci_creator.common import ASSETS, ROOT, validate
from davinci_creator.deck import html_deck, pptx_deck
from davinci_creator.scorm import build_scorm


class LocalVideoTests(unittest.TestCase):
    def setUp(self):
        (ASSETS/'projects').mkdir(exist_ok=True)
        self.temporary=tempfile.TemporaryDirectory(prefix='embedded-video-test-',dir=ASSETS/'projects')
        self.folder=Path(self.temporary.name)
        self.media=b'embedded MP4 fixture bytes'
        (self.folder/'story.mp4').write_bytes(self.media)
        Image.new('RGB',(1280,720),'navy').save(self.folder/'poster.png')
        (self.folder/'captions.vtt').write_text('WEBVTT\n\n00:00.000 --> 00:01.000\nשלום\n')
        prefix=self.folder.relative_to(ASSETS).as_posix()
        self.doc={'version':1,'title':'Embedded story','scenes':[
            {'id':'story','layout':'video','title':'סיפור קצר','video_file':f'{prefix}/story.mp4',
             'poster':f'{prefix}/poster.png','captions':f'{prefix}/captions.vtt'},
            {'id':'next','layout':'statement','title':'ממשיכים','subtitle':'שקף הבא'}]}
        validate(self.doc)

    def tearDown(self):
        self.temporary.cleanup()

    def test_html_and_scorm_contain_the_actual_video_and_captions(self):
        out=self.folder/'export';out.mkdir()
        html_deck(self.doc,out/'presentation.html')
        markup=(out/'presentation.html').read_text()
        self.assertIn('controls preload="none" playsinline',markup)
        encoded=re.search(r'<video\b[^>]*\bsrc="data:video/mp4;base64,([^"]+)"',markup).group(1)
        self.assertEqual(base64.b64decode(encoded),self.media)
        self.assertIn('data:text/vtt;base64,',markup)
        self.assertNotIn('src="https://',markup)
        with ZipFile(build_scorm(self.doc,out/'scorm')) as zipped:
            self.assertIn(encoded,zipped.read('media/index.html').decode())

    def test_powerpoint_contains_an_embedded_movie(self):
        pptx_deck(self.doc,self.folder/'presentation.pptx')
        with ZipFile(self.folder/'presentation.pptx') as zipped:
            movies=[n for n in zipped.namelist() if n.startswith('ppt/media/') and n.endswith('.mp4')]
            self.assertEqual(len(movies),1)
            self.assertEqual(zipped.read(movies[0]),self.media)
            slide=zipped.read('ppt/slides/slide1.xml').decode()
            self.assertIn('videoFile',slide)
            self.assertIn('media',slide)
            relations=zipped.read('ppt/slides/_rels/slide1.xml.rels').decode()
            self.assertNotIn('TargetMode="External"',relations)

    def test_invalid_or_ambiguous_media_references_are_rejected(self):
        for mutation in ['missing-poster','both-sources','escape','bad-captions','not-mp4']:
            doc=copy.deepcopy(self.doc);scene=doc['scenes'][0]
            if mutation=='missing-poster':scene.pop('poster')
            elif mutation=='both-sources':scene['youtube']='aaaaaaaaaaa'
            elif mutation=='escape':scene['video_file']='../outside.mp4'
            elif mutation=='bad-captions':scene['captions']=scene['poster']
            else:scene['video_file']=scene['poster']
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):validate(doc)

    @unittest.skipUnless(shutil.which('node'),'Node.js required')
    def test_playback_stops_when_leaving_the_slide(self):
        path=self.folder/'presentation.html';html_deck(self.doc,path)
        subprocess.run(['node',str(ROOT/'tests/local_video_runtime.test.cjs'),str(path)],check=True)


if __name__=='__main__':unittest.main()
