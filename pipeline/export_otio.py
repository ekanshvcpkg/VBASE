"""master_edl.json -> timeline.otio (OpenTimelineIO): open the cut in DaVinci Resolve / Premiere / FCP."""
import json, sys, opentimelineio as otio
edir, src = sys.argv[1], sys.argv[2]
m = json.load(open(f"{edir}/master_edl.json")); fps = m["fps"]
import os
tl = otio.schema.Timeline(name=os.path.splitext(os.path.basename(src))[0] + " · VBASE edit"); tr = otio.schema.Track(name="V1")
ref = otio.schema.ExternalReference(target_url=src)
for s in m["keep_segments"]:
    rng = otio.opentime.TimeRange(otio.opentime.RationalTime(round(s["source_start"]*fps), fps),
                                  otio.opentime.RationalTime(round((s["source_end"]-s["source_start"])*fps), fps))
    tr.append(otio.schema.Clip(name=f"shot{s['id']}", media_reference=ref, source_range=rng))
tl.tracks.append(tr)
for c in m["three_d_cues"]:
    tl.tracks[0].markers.append(otio.schema.Marker(name=c.get("scene"), marked_range=otio.opentime.TimeRange(
        otio.opentime.RationalTime(round(c["timeline_start"]*fps), fps), otio.opentime.RationalTime(round((c["timeline_end"]-c["timeline_start"])*fps), fps))))
otio.adapters.write_to_file(tl, f"{edir}/timeline.otio"); print("wrote", f"{edir}/timeline.otio", len(tr), "clips")
