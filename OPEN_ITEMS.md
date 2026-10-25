# Open items

## Ocean-current source is still 7.5°

**Status: open data item.**

The ocean-current values originate from 7.5° marine sample points and are upsampled to the 2°/3° atlas grid. That produces coastal holes. A runtime fill now extends the last valid ocean values into those holes and the basemap land mask keeps the trails off land.

A true 2° marine refetch was started (`pipeline/add_ocean_fine.py`) but the Open-Meteo Marine API rate-limited after 6 of 154 batches. The 2° refetch needs to resume in a fresh quota window (or use a higher-resolution alternative such as NOAA OSCAR).
