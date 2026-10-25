"""Regenerate checked-in ready-to-open examples without duplicating the video."""
import shutil
from davinci_creator.common import ROOT,load
from davinci_creator.deck import build
from davinci_creator.player import build_player

folder=ROOT/"examples/community"
build(load(folder/"content.json"),ROOT/"outputs/community-deck")
for name in ["presentation.pptx","presentation.html"]:
    shutil.copy2(ROOT/"outputs/community-deck"/name,folder/name)
shutil.copy2(ROOT/"outputs/community-deck/previews/storyboard.jpg",folder/"storyboard.jpg")
build_player(load(folder/"approved-timeline.json"),folder/"approved-video.mp4",folder/"interactive",link_video=True)
