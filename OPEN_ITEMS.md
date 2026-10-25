# Open items

## EARTH smoke/water animation is extremely shit

**Status: open. Needs dedicated work before EARTH motion can be called finished.**

The wind-gust smoke (canvas overlay) and the ocean-current water (WebGL pass) in EARTH are placeholders. The motion, colour and realism are not acceptable yet. The exaggerated smoke tails, the drift of the puffs and the ocean ripples do not read as real moving air/water.

Do not treat EARTH's animation as done.

Next pass should:

- move the gusts into a proper advected WebGL flow/fluid animation rather than stroked canvas smoke;
- drive the ocean surface with a real advected current/ripple field instead of the current fbm placeholder;
- tune colour, opacity and temporal smoothing at full zoom;
- re-check playback at the native timeline frame rate, and keep paused truly frozen.

Other open threads:

- The land-hydrology daily quota blocked a clean full rebuild of the 24 h / 7 d / 30 d ranges. The ocean-current fields were merged into the existing snapshots with `pipeline/add_ocean.py`; a full `pipeline/build_ranges.py` run is still required after the quota resets.
- The long atmosphere archive has no ocean-current field; the Earth water pass is disabled there.
