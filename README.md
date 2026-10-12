# KNF Field & Lab Data app — setup

One installable web app for phones and tablets (field) and Windows PCs (lab). Every record is saved on the device first. It uploads to Supabase automatically whenever there is signal.

## Files
| File | What it is |
|---|---|
| `index.html` | The app |
| `schema.js` | Forms, dropdown lists, photo types (edit here to add or rename fields) |
| `core.js` | Offline storage and sync |
| `sw.js` | Offline caching and background upload |
| `supabase_setup.sql` | Database, security rules, photo bucket, and typed views for QGIS |

## 1. Supabase
**Already done for the LPAL project** (xmvzhxlqagstuvqvcyhc): tables, security rules, private photo storage and views have been created, and public sign-ups are off. The app has the project address and publishable key built in. What's left is step 4 below: add each person's account.

Original setup steps, for reference:
1. Create a project at supabase.com (the Pro plan is worth it for daily backups).
2. Open **SQL Editor**, paste all of `supabase_setup.sql`, and run it. It is safe to run again after edits.
3. Go to **Authentication → Sign In / Providers**: keep Email on and **turn off "Allow new users to sign up"**.
4. Go to **Authentication → Users → Add user** and add each crew member and lab tech (email and password).
5. Copy the **Project URL** and the **publishable/anon key** from Project Settings → API. Each person enters these once in the app under Settings.

## 2. Hosting (free)
Put the folder on GitHub Pages, the same way as your Garden Log app. Anyone on the crew then opens the link:
- **Android / Windows (Chrome or Edge):** menu → *Install app*
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*

The public code holds no site numbers or locations. The KNF site list (about 6,000 trinomials with district, parish, recorded locations for Caney, Kisatchie and Grant/Winn sites, and the Phase II candidates) is stored privately in Supabase (`site_registry`) and downloads to each device after sign-in, then works offline. A copy is kept in the KNF_Field_Data_PRIVATE folder; never upload that folder to GitHub.

## 3. GPS sources
Every location box has a **source** picker next to *Capture position*. The choice is remembered per device and stored with each position, and accuracy warnings follow it.
- **Emlid Reach RX2 (RTK):** Android. Pair over Bluetooth, set **Emlid Flow** (or Lefebure NTRIP Client) as the *mock location app* in Developer options, and get an RTK fix. Warns above ±0.1 m.
- **Trimble TDC600 (RTX):** the TDC600 is an Android handheld, so open the app on the TDC600 itself. In Developer options set **Trimble Mobile Manager** as the mock location app, and turn off battery optimization for it. Warns above ±1 m.
- **Phone/tablet built-in GPS:** no setup needed. Usually 3–10 m, so it's fine for finding STPs but too coarse for unit datums and corners.
- **Other receiver:** any receiver that feeds Android's location (mock location).
- **Typed in:** coordinates from any instrument can be typed into UTM E/N. They are labelled "typed in" with the chosen source, and the app works out lat/lon for the maps.
- **Live readout:** every location box shows the current accuracy, updating every second. It is green when good for the chosen source, yellow while settling and red when poor or stale. *Capture position* averages the fixes over the set number of seconds.
- **Unit datums** warn above ±1 m and **corner shots** above ±0.5 m, whatever the source.
- **iPhone/iPad:** web apps can't connect to Bluetooth receivers. Use the phone's own GPS or type in coordinates.
- **PPK:** every capture stores a UTC timestamp (`gps_time`) for matching to post-processed points later.

## 4. QGIS
Add a PostgreSQL connection to the Supabase database (Project Settings → Database → connection string, *session pooler*). Use these layers:
- `excavations_pts`: point layer
- `excavations`, `levels`, `lithic_tools`, `prehistoric_ceramics`, etc.: **complete** records only, using the Access column names
- `*_all` views: include drafts (`record_status` column)

## Sites
- **Previously recorded sites:** choose the district, then pick the trinomial from the list (type to search). The app fills in the site name, parish, ID code and USGS quad.
- **New sites (temporary number):** *📍 Fill parish, quad & district from my position* takes the quad from the 7.5' grid and the parish and district from the nearest recorded site, so check those near parish lines. If you are standing within 400 m of a recorded site, the app asks whether it is that site.
- ID codes are parish digit + site number (NA 1, CL 2, WE 3, GR 4, WN 5, RA 6, VN 7). For example, 16NA41 is 1041.

## Points and site map
On a site page, **+ Take a point** records any GPS point: boundary, site datum, isolated find, feature, photo point, landmark or road. **Finish & add next** keeps the same kind and counts the label up (B1, B2, B3…). The **site map** draws STPs (filled = positive), units, points and a boundary outline with a scale bar, and works offline without a basemap. It also warns if the site's recorded location is more than 500 m from the points being taken. In QGIS the points are in `mappoints_pts`.

## Test mode
Settings → *Switch to test mode* gives a practice copy of the app with a purple TEST MODE banner. Practice records use their own storage on the device and their own server table (`records_test`), so they never mix with project data. In test mode, *Load practice data* adds a practice site (KRD-T99) with a finished STP, an STP in progress, a test unit with subunits, bags and a box. The *Test checklist* lists everything to try.

## Test units: subunits, datum and corners
- Each test unit gets its own **unit datum**: capture it with the GPS when creating the TP/Unit and describe it ("rebar with cap at SW corner of A").
- On the unit page, **+ Subunit** lays out subunits on a 0.5 m grid around the datum. The first is A, usually the 1 × 1 m square next to the datum; pick which corner of A the datum is on. Later subunits take the next letter and can be any size: use the presets (1×1, 0.5×1, 1×0.5, 0.5×0.5, 1×2, 2×1) or type E–W × N–S. Place them against an existing subunit's N/S/E/W side, nudge in 0.25 m steps, or tap the plan. L-shaped subunits are built from two or more pieces. The app blocks overlaps and warns if a piece doesn't touch the rest.
- Levels are started per subunit (tap the subunit, then **+ Level in B**). The subunit is picked from a list, and the level volume is worked out from the subunit's area × thickness.
- **Corner shots:** shoot at least one unit corner (two is better) with **+ Shoot a corner**, and choose which plan corner it is. The app calculates the unit's azimuth, sets it with one tap, and flags any corner more than 15 cm off the plan.
- Close-out for a unit requires every subunit to have levels and a terminal level, the azimuth, at least one corner shot within tolerance, profile and plan photos, and a profile drawing number.
- In QGIS, `subunits_utm15` gives real subunit polygons (UTM 15N) and `mappoints_pts` gives the corner shots.

## Labels, scanning and custody
- **Print labels:** go to Home → *Print labels*. Bag labels (B-XXXXXX) fit Avery 5160-size sheets (use weatherproof stock); box labels (X-XXXXXX) fit 4×2 in. Each code is random and unique, so anyone can print a batch without coordinating. Print from the hosted app: the QR then holds the app's address, and a phone's own camera opens that bag's page directly.
- **Field:** tick *Artifacts recovered* on the level form. When you press **Finish**, a pop-up asks you to scan the bag label (it opens the camera straight away; typing the code or a USB scanner also works). The pop-up shows the site, excavation, EU, level and depths to write on the bag as a backup. *Scan another bag* adds more bags to the same level (for example a special find). The level is finished only once at least one bag is scanned; *Back to the form* leaves it unfinished. A label already used on another bag is refused.
- **Special finds:** ticking *Special find* adds a description box (what it is, where and depth) and a *Photo of the special find* button. The level can't be finished without both.
- **Custody:** scanning a bag shows where it came from, who holds it, which box it is in, and its full custody log. You can hand it over, put it in a box, or mark it received at the lab or checked out for analysis. Scanning a box lists its contents, and *Add bags* scans bags into it one after another.
- **End-of-day bag check:** Home → **Bag check**. First have every crew device sync. Choose the sites, scan the box label (a new box is registered automatically), then scan every bag going into it; the camera stays open between bags, and scanning another box label switches boxes. The app expects every bag at those sites that isn't yet in a box or at the lab, so a bag missed yesterday is still expected today. **Finish check & make report** saves a report (it syncs like any record) listing missing bags grouped by who bagged them, extra labels (labels not linked to a level, usually a device that hasn't synced, or bags from another site), and the bags in each box. Reports can be printed or saved as PDF, copied as text for a group message, and annotated with notes; reopening one shows which missing bags have since turned up.
- **Lab:** *Scan bag* on the Lab screen jumps straight to that level's lab forms and logs the check-out. A USB barcode scanner on a PC also works: it types into the code box.
- Custody is an append-only log, so two devices offline can never overwrite each other's custody entries.

## New sites and odd jobs
*+ New site (temp. no.)* creates a temporary designation from the district (KRD-T01, CRD-T02 …) with an ID code of 8xxx. Use the *Kind* field for isolated finds or other investigations (for example a request from Matt), and note who asked and why. When the state assigns a trinomial, edit the site number. The temporary designation is kept on the record, and the ID code stays the same so excavation IDs don't change.

## Finish rules
- A record can only be **finished** (and uploaded) when every required item is filled in and nothing is in error. Until then it can be saved as a **draft**, which stays on that device only. The Sync page lists every draft.
- Unfinished work is impossible to miss. Saving unfinished needs a ticked "I understand it is NOT saved to the project" box. Unfinished records show a red **UNFINISHED** label and a red banner on every screen. A new level can't be started until the previous one is finished. Leaving a form with typed changes asks first, and the app reminds about unfinished records when it opens and before sign-out.
- Every level needs at least one photo. Test units also need profile and plan/overview photos.
- An excavation uploads as **open** once its type, number, date, excavators and location are in, so levels can hang under it and lab staff can see it. It can be **closed out** only when all checks pass.

## Checks built in
- **Hard stops:** missing required fields, duplicate excavation, level or catalogue numbers, bottom above top, weight 0 with a count, thickness greater than width, future dates.
- **Warnings:** Munsell format, unusual depths and weights, poor GPS accuracy, a position more than 400 m from the site's other excavations, named chert sources on visual ID only.
- **Completeness:** each form shows a live "still needed" list. The *Finish* button stays disabled until the list is empty and no field is in error.
- **Catalogue vs tabulation:** a mismatch keeps the tabulation in draft. The catalogue is treated as authoritative.
- **History:** every change is kept in `records_history` on the server. Deletions are flagged, never erased.
